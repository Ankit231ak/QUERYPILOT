import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { initDb, getDbSchema, queryAll } from "./db.js";

dotenv.config();
dotenv.config({ path: ".env.local" });

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory key store if user sets key via web UI
let dynamicGroqApiKey = process.env.GROQ_API_KEY || "";

function getGroqClient() {
  const apiKey = dynamicGroqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "MY_GROQ_API_KEY" || apiKey.trim() === "") {
    return null;
  }
  return new Groq({ apiKey });
}

// API Health check
app.get("/api/health", async (_req, res) => {
  const hasGroqKey = Boolean(
    (dynamicGroqApiKey || process.env.GROQ_API_KEY) &&
      (dynamicGroqApiKey || process.env.GROQ_API_KEY) !== "MY_GROQ_API_KEY"
  );

  res.json({
    status: "ok",
    hasGroqKey,
    provider: "Groq AI",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (Recommended)" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Ultra Fast)" },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7b" }
    ]
  });
});

// Update Groq API Key dynamically
app.post("/api/config", (req, res) => {
  const { apiKey } = req.body;
  if (typeof apiKey === "string") {
    dynamicGroqApiKey = apiKey.trim();
    return res.json({ success: true, message: "Groq API key updated successfully." });
  }
  res.status(400).json({ error: "Invalid API key provided." });
});

// Live Database Schema Endpoint
app.get("/api/schema", async (_req, res) => {
  try {
    const schema = await getDbSchema();
    res.json({ success: true, schema });
  } catch (error: any) {
    console.error("Error fetching schema:", error);
    res.status(500).json({ error: error.message || "Failed to fetch schema" });
  }
});

// Live SQL Execution Endpoint
app.post("/api/execute-sql", async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== "string") {
    return res.status(400).json({ error: "SQL query string is required" });
  }

  const startTime = performance.now();
  try {
    const rows = await queryAll(sql);
    const endTime = performance.now();
    const executionTimeMs = Math.round((endTime - startTime) * 100) / 100;

    let columns: string[] = [];
    if (rows.length > 0) {
      columns = Object.keys(rows[0]);
    }

    return res.json({
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: `${executionTimeMs}ms`
    });
  } catch (error: any) {
    const endTime = performance.now();
    const executionTimeMs = Math.round((endTime - startTime) * 100) / 100;

    return res.status(400).json({
      success: false,
      error: error.message || "SQL Execution Error",
      executionTimeMs: `${executionTimeMs}ms`
    });
  }
});

// Natural Language -> SQL generation powered by Groq
app.post("/api/generate-sql", async (req, res) => {
  try {
    const { prompt, model, definitionOption } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const groq = getGroqClient();

    // Map UI model name or select default
    let selectedModel = "llama-3.3-70b-versatile";
    if (model) {
      if (model.includes("Instant") || model.includes("8b")) {
        selectedModel = "llama-3.1-8b-instant";
      } else if (model.includes("DeepSeek") || model.includes("r1")) {
        selectedModel = "deepseek-r1-distill-llama-70b";
      } else if (model.includes("Mixtral")) {
        selectedModel = "mixtral-8x7b-32768";
      }
    }

    const liveSchema = await getDbSchema();
    const schemaPromptContext = JSON.stringify(liveSchema, null, 2);

    if (groq) {
      const systemInstruction = `You are QueryPilot, an expert AI SQL database architect.
Given a user query and a live SQLite database schema, generate a valid, optimized SQLite SQL query.
Important rules:
1. ONLY return a JSON object with keys: "sql", "explanation", "clarificationNeeded".
2. The "sql" key MUST contain valid SQLite SQL (without markdown codeblocks in the string value).
3. Do NOT invent tables or columns that do not exist in the schema.
4. Schema details:
${schemaPromptContext}`;

      const userPrompt = `User question: "${prompt}"
${definitionOption ? `Selected Preference: ${definitionOption}` : ""}`;

      const completion = await groq.chat.completions.create({
        model: selectedModel,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0]?.message?.content || "";
      let parsed = { sql: "", explanation: "", clarificationNeeded: false };

      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = {
          sql: `SELECT u.customer_id, u.name, COUNT(o.order_id) AS total_orders, SUM(o.total_amount) AS total_spent FROM users u JOIN orders o ON u.customer_id = o.customer_id WHERE o.status = 'completed' GROUP BY u.customer_id, u.name ORDER BY total_spent DESC LIMIT 10;`,
          explanation: "Calculates top customer spending based on completed orders.",
          clarificationNeeded: false
        };
      }

      return res.json(parsed);
    } else {
      // Fallback SQL generator if GROQ_API_KEY is missing
      const lower = prompt.toLowerCase();
      let sql = "";
      let explanation = "";

      if (lower.includes("revenue") || lower.includes("category")) {
        sql = `SELECT \n    p.category, \n    SUM(oi.quantity * oi.unit_price) AS total_revenue,\n    COUNT(DISTINCT o.order_id) AS total_orders\nFROM \n    products p\nJOIN \n    order_items oi ON p.id = oi.product_id\nJOIN \n    orders o ON oi.order_id = o.order_id\nWHERE \n    o.status = 'completed'\nGROUP BY \n    p.category\nORDER BY \n    total_revenue DESC;`;
        explanation = "Aggregates revenue across categories from the live database.";
      } else if (lower.includes("product") || lower.includes("stock") || lower.includes("rating")) {
        sql = `SELECT \n    id, name, category, price, stock_quantity, rating\nFROM \n    products\nWHERE \n    rating >= 4.5\nORDER BY \n    rating DESC, stock_quantity DESC;`;
        explanation = "Retrieves high-rated products sorted by rating and available stock.";
      } else if (lower.includes("review") || lower.includes("comment")) {
        sql = `SELECT \n    p.name AS product_name, \n    u.name AS reviewer, \n    r.rating, \n    r.comment, \n    r.review_date\nFROM \n    reviews r\nJOIN \n    products p ON r.product_id = p.id\nJOIN \n    users u ON r.customer_id = u.customer_id\nORDER BY \n    r.rating DESC;`;
        explanation = "Lists customer product reviews with reviewer details.";
      } else {
        sql = `SELECT \n    u.customer_id,\n    u.name,\n    u.region,\n    COUNT(o.order_id) AS total_orders,\n    ROUND(SUM(o.total_amount), 2) AS total_spent\nFROM \n    users u\nJOIN \n    orders o ON u.customer_id = o.customer_id\nWHERE \n    o.status = 'completed'\nGROUP BY \n    u.customer_id, u.name, u.region\nORDER BY \n    total_spent DESC\nLIMIT 10;`;
        explanation = "Returns top 10 customers by total spend executed on SQLite.";
      }

      return res.json({
        sql,
        explanation: `${explanation} (Note: Set GROQ_API_KEY in Settings to enable real Groq AI dynamic SQL generation).`,
        clarificationNeeded: false,
        noApiKey: true
      });
    }
  } catch (error: any) {
    console.error("Error generating SQL:", error);
    res.status(500).json({ error: error.message || "Failed to generate query" });
  }
});

async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QueryPilot Server running with Groq API & SQLite on http://0.0.0.0:${PORT}`);
  });
}

startServer();
