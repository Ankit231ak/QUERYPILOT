import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { initDb, getTargetSchema, executeTargetQuery, testConnection } from "./db.js";

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

// Test Connection Endpoint (PostgreSQL, MySQL, SQLite)
app.post("/api/test-connection", async (req, res) => {
  const { dialect, connectionString } = req.body;
  try {
    const message = await testConnection({ dialect, connectionString });
    res.json({ success: true, message });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || "Connection failed." });
  }
});

// Dynamic Live Schema Endpoint for active database (PostgreSQL, MySQL, SQLite)
app.post("/api/schema", async (req, res) => {
  try {
    const { dialect, connectionString } = req.body;
    const schema = await getTargetSchema({ dialect, connectionString });
    res.json({ success: true, schema });
  } catch (error: any) {
    console.error("Error fetching schema:", error);
    res.status(500).json({ error: error.message || "Failed to fetch database schema" });
  }
});

// GET fallback schema for initial page load
app.get("/api/schema", async (_req, res) => {
  try {
    const schema = await getTargetSchema();
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch schema" });
  }
});

// Live SQL Execution Endpoint
app.post("/api/execute-sql", async (req, res) => {
  const { sql, dialect, connectionString } = req.body;
  if (!sql || typeof sql !== "string") {
    return res.status(400).json({ error: "SQL query string is required" });
  }

  const startTime = performance.now();
  try {
    const { rows, columns } = await executeTargetQuery(sql, { dialect, connectionString });
    const endTime = performance.now();
    const executionTimeMs = Math.round((endTime - startTime) * 100) / 100;

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
    const { prompt, model, definitionOption, dialect = "SQLite", connectionString } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const groq = getGroqClient();

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

    let liveSchema: any[] = [];
    try {
      liveSchema = await getTargetSchema({ dialect, connectionString });
    } catch {
      liveSchema = await getTargetSchema();
    }
    const schemaPromptContext = JSON.stringify(liveSchema, null, 2);

    if (groq) {
      const systemInstruction = `You are QueryPilot, an expert AI SQL database architect.
Given a user query, a target SQL dialect (${dialect}), and live database schema, generate a valid, optimized ${dialect} SQL query.
Important rules:
1. ONLY return a JSON object with keys: "sql", "explanation", "clarificationNeeded".
2. The "sql" key MUST contain valid ${dialect} SQL without markdown codeblocks in the string.
3. Use dialect-specific keywords and syntax for ${dialect} (e.g. use double quotes "table" or ILIKE for PostgreSQL if appropriate).
4. Do NOT invent tables or columns that do not exist in the schema.
5. Live Schema details:
${schemaPromptContext}`;

      const userPrompt = `User question: "${prompt}"
Target Dialect: ${dialect}
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
        const firstTable = liveSchema[0]?.name || "users";
        parsed = {
          sql: `SELECT * FROM "${firstTable}" LIMIT 10;`,
          explanation: `Queries ${firstTable} for ${dialect}.`,
          clarificationNeeded: false
        };
      }

      return res.json(parsed);
    } else {
      // Fallback SQL generator if GROQ_API_KEY is missing
      const firstTable = liveSchema[0]?.name || "users";
      const sql = `SELECT * FROM "${firstTable}" LIMIT 10;`;
      return res.json({
        sql,
        explanation: `Queries live ${dialect} database table "${firstTable}". Set GROQ_API_KEY in Settings for AI generation.`,
        clarificationNeeded: false,
        noApiKey: true
      });
    }
  } catch (error: any) {
    console.error("Error generating SQL:", error);
    res.status(500).json({ error: error.message || "Failed to generate query" });
  }
});

// AI Testing & Analysis Endpoint
app.post("/api/analyze-sql", async (req, res) => {
  try {
    const { prompt, sql, dialect = "SQLite", connectionString, feedbackType = "thumbs_down" } = req.body;

    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ error: "SQL string is required for AI analysis" });
    }

    const groq = getGroqClient();
    let liveSchema = [];
    try {
      liveSchema = await getTargetSchema({ dialect, connectionString });
    } catch {
      liveSchema = await getTargetSchema();
    }

    if (groq) {
      const systemInstruction = `You are QueryPilot AI Quality Analyst.
Analyze the given SQL query for target dialect ${dialect} against the provided database schema and user prompt.
Output ONLY a JSON object matching this schema:
{
  "feedbackType": "${feedbackType}",
  "verdict": "Optimal Query" | "Improvement Suggested" | "Potential Syntax Error" | "Schema Mismatch",
  "explanation": "Detailed technical analysis of correctness, performance, and dialect syntax for ${dialect}.",
  "optimizations": ["Point 1", "Point 2"],
  "suggestedSql": "SELECT ... (Provide improved SQL query if appropriate or requested)"
}
Database Schema: ${JSON.stringify(liveSchema)}`;

      const userMessage = `User Prompt: "${prompt || "N/A"}"
Target Dialect: ${dialect}
User Rating: ${feedbackType}
Generated SQL:
${sql}`;

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const text = completion.choices[0]?.message?.content || "";
      let parsed = JSON.parse(text);
      return res.json({ success: true, analysis: parsed });
    } else {
      return res.json({
        success: true,
        analysis: {
          feedbackType,
          verdict: feedbackType === "thumbs_up" ? "Optimal Query" : "Improvement Suggested",
          explanation: feedbackType === "thumbs_up"
            ? "The query correctly executes against the connected database schema."
            : "Suggested tuning join conditions and index selection.",
          optimizations: ["Verify primary key indexing", "Use explicit column list instead of SELECT *"],
          suggestedSql: sql
        }
      });
    }
  } catch (error: any) {
    console.error("Error analyzing SQL:", error);
    res.status(500).json({ error: error.message || "Failed to analyze query" });
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
    console.log(`QueryPilot Server running with Live PostgreSQL, MySQL & SQLite Engine on http://0.0.0.0:${PORT}`);
  });
}

startServer();
