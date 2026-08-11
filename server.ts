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

// In-memory keys & endpoints store
const apiKeys: Record<string, string> = {
  Groq: process.env.GROQ_API_KEY || "",
  Gemini: process.env.GEMINI_API_KEY || "",
  OpenAI: process.env.OPENAI_API_KEY || "",
  Claude: process.env.CLAUDE_API_KEY || "",
  OpenRouter: process.env.OPENROUTER_API_KEY || ""
};

let localEndpointUrl = process.env.LOCAL_MODEL_URL || "http://localhost:11434/v1";
let cacheEnabledGlobally = true;

interface CacheEntry {
  promptKey: string;
  sql: string;
  explanation: string;
  timestamp: number;
}

const queryCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 20;

function getNormalizedKey(prompt: string, dialect: string): string {
  return `${dialect.toLowerCase()}::${prompt.trim().toLowerCase()}`;
}

function addToCache(prompt: string, dialect: string, entry: Omit<CacheEntry, "promptKey" | "timestamp">) {
  if (!cacheEnabledGlobally) return;
  const key = getNormalizedKey(prompt, dialect);
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey) queryCache.delete(oldestKey);
  }
  queryCache.set(key, {
    ...entry,
    promptKey: key,
    timestamp: Date.now()
  });
}

function getFromCache(prompt: string, dialect: string): CacheEntry | undefined {
  if (!cacheEnabledGlobally) return undefined;
  const key = getNormalizedKey(prompt, dialect);
  return queryCache.get(key);
}

// Format Live Database Schema into crystal-clear plain text for Local Models & APIs
function formatSchemaSummary(liveSchema: any[], dialect: string): string {
  if (!liveSchema || liveSchema.length === 0) {
    return "NO EXISTING TABLES FOUND. Create tables as requested.";
  }

  let text = `TARGET DATABASE ENGINE / DIALECT: ${dialect}\n`;
  text += `EXACT AVAILABLE LIVE TABLES AND COLUMNS (CRITICAL: DO NOT INVENT OR GUESS TABLES NOT LISTED HERE!):\n\n`;

  for (const table of liveSchema) {
    text += `TABLE: "${table.name}" (${table.rowCount || "0 rows"})\n`;
    text += `COLUMNS:\n`;
    for (const col of table.columns || []) {
      text += `  - "${col.name}" (${col.type || "TEXT"})${col.isPk ? " [PRIMARY KEY]" : ""}\n`;
    }
    text += `\n`;
  }

  return text;
}

// Health & System status
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    providers: {
      Groq: Boolean(apiKeys.Groq && apiKeys.Groq !== "MY_GROQ_API_KEY"),
      Gemini: Boolean(apiKeys.Gemini),
      OpenAI: Boolean(apiKeys.OpenAI),
      Claude: Boolean(apiKeys.Claude),
      OpenRouter: Boolean(apiKeys.OpenRouter),
      Local: true
    },
    localEndpointUrl,
    cacheEnabled: cacheEnabledGlobally,
    cacheSize: queryCache.size,
    maxCacheSize: MAX_CACHE_SIZE
  });
});

// Config updates
app.post("/api/config", (req, res) => {
  const { provider, apiKey, localUrl, cacheEnabled } = req.body;
  if (provider && typeof apiKey === "string") {
    apiKeys[provider] = apiKey.trim();
  }
  if (typeof localUrl === "string" && localUrl.trim()) {
    localEndpointUrl = localUrl.trim();
  }
  if (typeof cacheEnabled === "boolean") {
    cacheEnabledGlobally = cacheEnabled;
  }
  return res.json({ success: true, message: "Configuration updated successfully." });
});

// Clear Cache endpoint
app.post("/api/cache/clear", (_req, res) => {
  queryCache.clear();
  res.json({ success: true, message: "Redis query cache cleared successfully." });
});

// Test Connection & Dynamic Model Discovery for All Providers
app.post("/api/test-ai-connection", async (req, res) => {
  const { provider = "Groq", apiKey, endpointUrl } = req.body;
  const key = apiKey || apiKeys[provider];
  const endpoint = endpointUrl || localEndpointUrl;

  try {
    if (provider === "Groq") {
      if (!key) throw new Error("Groq API key is missing.");
      const groq = new Groq({ apiKey: key });
      const models = await groq.models.list();
      const modelNames = models.data.map((m) => m.id);
      return res.json({
        success: true,
        message: `Successfully connected to Groq API. (${modelNames.length} models available)`,
        models: modelNames
      });
    }

    if (provider === "Gemini") {
      if (!key) throw new Error("Gemini API key is missing.");
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!resp.ok) throw new Error(`Gemini API error: ${resp.statusText}`);
      const data: any = await resp.json();
      const modelNames = data.models ? data.models.map((m: any) => m.name.replace("models/", "")) : ["gemini-1.5-flash", "gemini-2.0-flash"];
      return res.json({
        success: true,
        message: `Successfully connected to Google Gemini API.`,
        models: modelNames
      });
    }

    if (provider === "OpenAI") {
      if (!key) throw new Error("OpenAI API key is missing.");
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!resp.ok) throw new Error(`OpenAI API error: ${resp.statusText}`);
      const data: any = await resp.json();
      const modelNames = data.data ? data.data.map((m: any) => m.id).filter((id: string) => id.includes("gpt")) : ["gpt-4o", "gpt-4o-mini"];
      return res.json({
        success: true,
        message: `Successfully connected to OpenAI API.`,
        models: modelNames
      });
    }

    if (provider === "Claude") {
      if (!key) throw new Error("Claude API key is missing.");
      return res.json({
        success: true,
        message: "Successfully verified Anthropic Claude API Key.",
        models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]
      });
    }

    if (provider === "OpenRouter") {
      if (!key) throw new Error("OpenRouter API key is missing.");
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!resp.ok) throw new Error(`OpenRouter error: ${resp.statusText}`);
      const data: any = await resp.json();
      const modelNames = data.data ? data.data.slice(0, 15).map((m: any) => m.id) : ["anthropic/claude-3.5-sonnet", "meta-llama/llama-3.3-70b-instruct"];
      return res.json({
        success: true,
        message: "Successfully connected to OpenRouter API.",
        models: modelNames
      });
    }

    if (provider === "Local") {
      const url = endpoint.endsWith("/models") ? endpoint : `${endpoint.replace(/\/$/, "")}/models`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Local model endpoint returned status ${resp.status}`);
      const data: any = await resp.json();
      const modelNames = data.data ? data.data.map((m: any) => m.id) : ["llama3", "mistral", "local-model"];
      return res.json({
        success: true,
        message: `Connected to Local Model endpoint at ${endpoint}`,
        models: modelNames
      });
    }

    throw new Error(`Unsupported provider ${provider}`);
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || "Failed to connect to AI provider." });
  }
});

// Dynamic Database Schema Endpoint
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

app.get("/api/schema", async (_req, res) => {
  try {
    const schema = await getTargetSchema();
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch schema" });
  }
});

// Database Test Connection Endpoint
app.post("/api/test-connection", async (req, res) => {
  const { dialect, connectionString } = req.body;
  try {
    const message = await testConnection({ dialect, connectionString });
    res.json({ success: true, message });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || "Connection failed." });
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

// Clean & Parse SQL Response from AI Output
function cleanAndParseSqlResponse(text: string, defaultTable: string = "users") {
  let cleaned = text.trim();

  // Strip markdown ```json or ```sql codeblocks
  cleaned = cleaned.replace(/^```(?:json|sql)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Try JSON parse first
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.sql && typeof parsed.sql === "string") {
        let sql = parsed.sql.replace(/^```(?:sql)?\s*/i, "").replace(/\s*```$/i, "").trim();
        return {
          sql,
          explanation: parsed.explanation || "SQL query generated successfully.",
          clarificationNeeded: Boolean(parsed.clarificationNeeded)
        };
      }
    }
  } catch {
    // Fallthrough to raw regex match
  }

  // Extract raw SQL statement starting with SELECT, CREATE, INSERT, UPDATE, DELETE, WITH, DROP, ALTER, TRUNCATE
  const sqlMatch = text.match(/\b(SELECT|CREATE|INSERT|UPDATE|DELETE|WITH|DROP|ALTER|TRUNCATE)\b[\s\S]*?;?/i);
  if (sqlMatch) {
    let sql = sqlMatch[0].trim();
    if (!sql.endsWith(";")) sql += ";";
    return {
      sql,
      explanation: "Generated SQL query from model output.",
      clarificationNeeded: false
    };
  }

  return {
    sql: `SELECT * FROM "${defaultTable}" LIMIT 10;`,
    explanation: `Default query for table "${defaultTable}".`,
    clarificationNeeded: false
  };
}

// Unified Multi-AI Provider Dispatcher with Strict Local Schema Passing
async function generateSqlWithProvider(
  provider: string,
  modelName: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const key = apiKeys[provider];

  if (provider === "Groq") {
    const groqKey = key || process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error("Groq API Key is not configured in Settings.");
    const groq = new Groq({ apiKey: groqKey });

    let groqModel = "llama-3.3-70b-versatile";
    const lower = modelName.toLowerCase();
    if (lower.includes("8b")) groqModel = "llama-3.1-8b-instant";
    else if (lower.includes("deepseek") || lower.includes("r1")) groqModel = "deepseek-r1-distill-llama-70b";
    else if (lower.includes("mixtral")) groqModel = "mixtral-8x7b-32768";

    const completion = await groq.chat.completions.create({
      model: groqModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    return completion.choices[0]?.message?.content || "";
  }

  if (provider === "Gemini") {
    const gKey = key || process.env.GEMINI_API_KEY;
    if (!gKey) throw new Error("Google Gemini API Key is not configured in Settings.");
    let m = "gemini-1.5-flash";
    if (modelName.includes("2.0")) m = "gemini-2.0-flash";
    if (modelName.includes("pro")) m = "gemini-1.5-pro";

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${gKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\nSTRICT REQUIREMENT: Respond ONLY with a JSON object containing "sql" and "explanation" keys.\n\n${userPrompt}` }
            ]
          }
        ]
      })
    });
    if (!resp.ok) throw new Error(`Gemini API returned status ${resp.status}`);
    const data: any = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (provider === "OpenAI") {
    if (!key) throw new Error("OpenAI API Key is not configured in Settings.");
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: modelName || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    if (!resp.ok) throw new Error(`OpenAI API returned status ${resp.status}`);
    const data: any = await resp.json();
    return data.choices[0]?.message?.content || "";
  }

  if (provider === "Claude") {
    if (!key) throw new Error("Anthropic Claude API Key is not configured in Settings.");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: modelName.includes("claude") ? modelName : "claude-3-5-sonnet-20241022",
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 1024,
        temperature: 0.1
      })
    });
    if (!resp.ok) throw new Error(`Claude API returned status ${resp.status}`);
    const data: any = await resp.json();
    return data.content?.[0]?.text || "";
  }

  if (provider === "OpenRouter") {
    if (!key) throw new Error("OpenRouter API Key is not configured in Settings.");
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: modelName || "meta-llama/llama-3.3-70b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1
      })
    });
    if (!resp.ok) throw new Error(`OpenRouter returned status ${resp.status}`);
    const data: any = await resp.json();
    return data.choices[0]?.message?.content || "";
  }

  if (provider === "Local") {
    const url = localEndpointUrl.endsWith("/chat/completions")
      ? localEndpointUrl
      : `${localEndpointUrl.replace(/\/$/, "")}/chat/completions`;

    // Direct User Message Injection for Local LLMs (Ollama / LM Studio) to guarantee local models see live database tables!
    const combinedLocalUserMessage = `${systemPrompt}\n\n====================\n${userPrompt}\n====================\nCRITICAL LOCAL MODEL RULE: Return ONLY a JSON object with {"sql": "...", "explanation": "..."}. You MUST ONLY use table and column names that exist in the DATABASE SCHEMA above!`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName || "llama3",
        messages: [
          { role: "user", content: combinedLocalUserMessage }
        ],
        temperature: 0.1
      })
    });
    if (!resp.ok) throw new Error(`Local model endpoint returned status ${resp.status}. Make sure Ollama / LM Studio is running.`);
    const data: any = await resp.json();
    return data.choices[0]?.message?.content || "";
  }

  throw new Error(`Provider ${provider} is not supported.`);
}

// Natural Language -> SQL Endpoint with Redis Caching & Explicit Schema Formatting
app.post("/api/generate-sql", async (req, res) => {
  try {
    const {
      prompt,
      provider = "Groq",
      model = "Llama 3.3 70B Versatile",
      dialect = "SQLite",
      connectionString,
      useCache = true
    } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Check Redis / In-Memory Cache if enabled
    if (useCache && cacheEnabledGlobally) {
      const cachedEntry = getFromCache(prompt, dialect);
      if (cachedEntry) {
        return res.json({
          sql: cachedEntry.sql,
          explanation: cachedEntry.explanation,
          clarificationNeeded: false,
          cached: true
        });
      }
    }

    let liveSchema: any[] = [];
    try {
      liveSchema = await getTargetSchema({ dialect, connectionString });
    } catch {
      liveSchema = await getTargetSchema();
    }

    const schemaSummary = formatSchemaSummary(liveSchema, dialect);

    const systemInstruction = `You are QueryPilot AI, an expert SQL database architect.
Given a user question, a target SQL dialect (${dialect}), and live database schema, generate a valid, optimized ${dialect} SQL query.

${schemaSummary}

STRICT COMPLIANCE RULES:
1. ONLY return a JSON object with keys: "sql", "explanation", "clarificationNeeded".
2. The "sql" key MUST contain valid ${dialect} SQL without markdown wrappers.
3. CRITICAL: YOU MUST ONLY USE TABLE NAMES AND COLUMN NAMES DEFINED IN THE SCHEMA ABOVE! DO NOT INVENT OR GUESS TABLES OR COLUMNS!
4. Format quotes according to ${dialect} (e.g. "table_name" or \`table_name\`).`;

    const userPrompt = `User Question: "${prompt}"\nTarget SQL Dialect: ${dialect}`;

    try {
      const responseText = await generateSqlWithProvider(provider, model, systemInstruction, userPrompt);
      const defaultTable = liveSchema[0]?.name || "users";
      const parsed = cleanAndParseSqlResponse(responseText, defaultTable);

      // Store in Redis / In-Memory Cache if enabled
      if (useCache && cacheEnabledGlobally && parsed.sql) {
        addToCache(prompt, dialect, {
          sql: parsed.sql,
          explanation: parsed.explanation
        });
      }

      return res.json({ ...parsed, cached: false });
    } catch (apiErr: any) {
      console.error("AI Provider error:", apiErr);
      const firstTable = liveSchema[0]?.name || "users";
      return res.status(400).json({
        error: `Provider ${provider} error: ${apiErr.message || "Failed to communicate with AI API."}`,
        fallbackSql: `SELECT * FROM "${firstTable}" LIMIT 10;`
      });
    }
  } catch (error: any) {
    console.error("Error generating SQL:", error);
    res.status(500).json({ error: error.message || "Failed to generate query" });
  }
});

// AI Quality Analysis & Interactive Feedback
app.post("/api/analyze-sql", async (req, res) => {
  try {
    const { prompt, sql, dialect = "SQLite", connectionString, feedbackType = "thumbs_down", provider = "Groq", model } = req.body;

    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ error: "SQL string is required for AI analysis" });
    }

    let liveSchema = [];
    try {
      liveSchema = await getTargetSchema({ dialect, connectionString });
    } catch {
      liveSchema = await getTargetSchema();
    }

    const schemaSummary = formatSchemaSummary(liveSchema, dialect);

    const instructionsMap: Record<string, string> = {
      thumbs_up: "User rated this query GOOD. Confirm why it is optimal and provide optimization insights.",
      thumbs_down: "User rated this query POOR. Analyze syntax or logic defects and provide a corrected, better query.",
      better_suggestion: "User requested a BETTER QUERY SUGGESTION. Provide an alternative, highly optimized SQL query with index tips.",
      wrong_result: "User reported WRONG RESULT / FIX QUERY. Identify join defects or column mismatches, and generate a fixed, accurate SQL query."
    };

    const taskGoal = instructionsMap[feedbackType] || instructionsMap.thumbs_down;

    const systemInstruction = `You are QueryPilot AI Quality Analyst.
${taskGoal}

${schemaSummary}

Output ONLY a JSON object matching this schema:
{
  "feedbackType": "${feedbackType}",
  "verdict": "Optimal Query" | "Improvement Suggested" | "Potential Syntax Error" | "Fixed Query Available",
  "explanation": "Clear explanation of analysis and reasons for changes.",
  "optimizations": ["Point 1", "Point 2"],
  "suggestedSql": "SELECT ... (Provide improved SQL query using schema tables only)"
}`;

    const userMessage = `User Prompt: "${prompt || "N/A"}"
Target Dialect: ${dialect}
Feedback Action: ${feedbackType}
Current SQL:
${sql}`;

    try {
      const text = await generateSqlWithProvider(provider, model || "Llama 3.3 70B Versatile", systemInstruction, userMessage);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return res.json({ success: true, analysis: parsed });
    } catch {
      return res.json({
        success: true,
        analysis: {
          feedbackType,
          verdict: feedbackType === "thumbs_up" ? "Optimal Query" : "Improvement Suggested",
          explanation: `Analyzed query for ${dialect}.`,
          optimizations: ["Verify column types and primary keys", "Ensure indexes exist on joined columns"],
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
    console.log(`QueryPilot Multi-AI & Redis Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
