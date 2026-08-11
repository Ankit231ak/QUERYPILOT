import React, { useState, useEffect } from 'react';
import { DatabaseSource, QueryHistoryItem } from '../types';

interface QueryWorkspaceProps {
  dataSources: DatabaseSource[];
  onAddHistoryItem: (item: QueryHistoryItem) => void;
}

interface TableSchemaItem {
  id: string;
  name: string;
  rowCount: string;
  columns: { name: string; type: string; isPk?: boolean; description?: string }[];
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({
  onAddHistoryItem
}) => {
  const [liveSchema, setLiveSchema] = useState<TableSchemaItem[]>([]);
  const [selectedTable, setSelectedTable] = useState('orders');
  const [promptText, setPromptText] = useState('Show me top spending customers with order details.');
  const [selectedModel, setSelectedModel] = useState('Llama 3.3 70B Versatile');
  
  // Groq API status
  const [hasApiKey, setHasApiKey] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Clarification state
  const [definitionOption, setDefinitionOption] = useState<'spending' | 'orders' | 'aov'>('spending');
  const [clarificationStep, setClarificationStep] = useState(1);
  const [isClarifying, setIsClarifying] = useState(false);

  // Execution states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningQuery, setIsRunningQuery] = useState(false);

  // Live Query Results State
  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    rowCount: number;
    execTime: string;
    error?: string;
  } | null>(null);

  // Generated SQL state
  const [generatedSql, setGeneratedSql] = useState<string>(
    `SELECT \n    u.customer_id,\n    u.name,\n    u.region,\n    COUNT(o.order_id) AS total_orders,\n    ROUND(SUM(o.total_amount), 2) AS total_spent\nFROM \n    users u\nJOIN \n    orders o ON u.customer_id = o.customer_id\nWHERE \n    o.status = 'completed'\nGROUP BY \n    u.customer_id, u.name, u.region\nORDER BY \n    total_spent DESC\nLIMIT 10;`
  );

  const [aiInsight, setAiInsight] = useState<string>(
    'Executes a live JOIN query on SQLite connecting active customers with completed order totals.'
  );

  const [copied, setCopied] = useState(false);

  // Load dynamic SQLite database schema on mount
  useEffect(() => {
    fetch('/api/schema')
      .then(res => res.json())
      .then(data => {
        if (data.schema && Array.isArray(data.schema)) {
          setLiveSchema(data.schema);
          if (data.schema.length > 0) {
            setSelectedTable(data.schema[0].name);
          }
        }
      })
      .catch(err => console.error("Failed to load schema:", err));

    // Check health & Groq key
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHasApiKey(Boolean(data.hasGroqKey));
      })
      .catch(err => console.error("Failed to fetch health:", err));
  }, []);

  // Save Groq API Key
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setHasApiKey(true);
        setApiKeyInput('');
      }
    } catch (err) {
      console.error("Failed to save Groq key:", err);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Handle Natural Language Query Generation via Groq API
  const handleGenerate = async (definitionOverride?: string) => {
    setIsGenerating(true);

    const activeDef = definitionOverride || (definitionOption === 'orders' ? 'Number of Orders' : definitionOption === 'aov' ? 'Avg Order Value' : 'Total Spending');

    try {
      const response = await fetch('/api/generate-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          model: selectedModel,
          definitionOption: activeDef
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sql) {
          setGeneratedSql(data.sql);
        }
        if (data.explanation) {
          setAiInsight(data.explanation);
        }
        if (data.noApiKey) {
          setHasApiKey(false);
        }
        // Auto-run generated SQL on the live database!
        handleRunQuery(data.sql);
      }
    } catch (err) {
      console.error("Failed to generate SQL from Groq:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Run SQL Query on Live SQLite Database
  const handleRunQuery = async (targetSql?: string) => {
    const sqlToRun = targetSql || generatedSql;
    setIsRunningQuery(true);
    setQueryResults(null);

    try {
      const response = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlToRun })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQueryResults({
          columns: data.columns || [],
          rows: data.rows || [],
          rowCount: data.rowCount || 0,
          execTime: data.executionTimeMs || '1ms'
        });

        // Add to history
        onAddHistoryItem({
          id: `q-${Date.now()}`,
          question: promptText,
          sql: sqlToRun,
          status: 'Success',
          model: selectedModel,
          execTime: data.executionTimeMs || '1ms',
          rowsCount: data.rowCount || 0,
          date: 'Just now',
          timestamp: Date.now()
        });
      } else {
        setQueryResults({
          columns: [],
          rows: [],
          rowCount: 0,
          execTime: data.executionTimeMs || '0ms',
          error: data.error || 'Failed to execute query'
        });
      }
    } catch (err: any) {
      setQueryResults({
        columns: [],
        rows: [],
        rowCount: 0,
        execTime: '0ms',
        error: err.message || 'Network failure executing query'
      });
    } finally {
      setIsRunningQuery(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeTableSchema = liveSchema.find(t => t.name === selectedTable) || liveSchema[0];

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* Left Sidebar: Live SQLite Data Sources */}
      <aside className="w-64 xl:w-72 hidden md:flex flex-col bg-[#1e2023] border-r border-[#333538] h-full flex-shrink-0">
        <div className="p-4 flex items-center justify-between border-b border-[#333538]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4ae176] text-[20px]">database</span>
            <h3 className="font-semibold text-sm text-[#e2e2e6]">SQLite (Live)</h3>
          </div>
          <span className="text-[10px] bg-[#4ae176]/20 text-[#4ae176] px-2 py-0.5 rounded font-mono font-semibold">Active</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-1.5 text-[#e2e2e6]">
              <span className="font-semibold text-xs text-[#c9c4d8] uppercase tracking-wider">Tables ({liveSchema.length})</span>
            </div>

            <div className="mt-1 space-y-1">
              {liveSchema.map((table) => {
                const isSelected = selectedTable === table.name;
                return (
                  <div
                    key={table.id}
                    onClick={() => setSelectedTable(table.name)}
                    className={`flex items-center justify-between group px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#333538] text-[#e2e2e6]' : 'hover:bg-[#282a2d] text-[#c9c4d8]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[16px] ${isSelected ? 'text-[#cabeff]' : ''}`}>
                        table
                      </span>
                      <span className={`text-sm ${isSelected ? 'font-medium text-[#e2e2e6]' : ''}`}>
                        {table.name}
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#111317] px-1.5 py-0.5 rounded text-[#4ae176] font-mono">
                      {table.rowCount}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[#111317] relative overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full flex-1 flex flex-col gap-6">

          {/* Groq API Key Setup Banner if missing */}
          {!hasApiKey && (
            <div className="bg-[#282a2d] border border-[#947dff]/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#947dff]/20 text-[#cabeff] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined">key</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#e2e2e6]">Enter your Groq API Key</h4>
                  <p className="text-xs text-[#c9c4d8] mt-0.5">
                    Connect Groq AI (`llama-3.3-70b-versatile`) to generate dynamic SQL for your prompts. Get a free key at <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[#cabeff] underline">console.groq.com</a>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/50 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-[#947dff] flex-1 md:w-60"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={isSavingKey}
                  className="bg-[#947dff] hover:bg-[#cabeff] text-[#2b0088] px-4 py-1.5 rounded-lg font-semibold text-xs transition-colors flex-shrink-0"
                >
                  {isSavingKey ? 'Saving...' : 'Save Key'}
                </button>
              </div>
            </div>
          )}

          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#e2e2e6] tracking-tight">Query Workspace</h1>
              <p className="text-xs md:text-sm text-[#c9c4d8] mt-1">Real SQL execution on SQLite powered by Groq AI.</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleRunQuery('SELECT * FROM users LIMIT 10;')}
                className="px-3.5 py-2 rounded-lg bg-[#1e2023] text-[#e2e2e6] hover:bg-[#282a2d] transition-colors text-xs md:text-sm font-medium flex items-center gap-2 border border-[#484555]/30"
              >
                <span className="material-symbols-outlined text-[18px]">table_rows</span> Quick Users Query
              </button>
            </div>
          </header>

          {/* Natural Language Prompt Input */}
          <div className="bg-[#1e2023] rounded-xl shadow-lg border border-[#333538] focus-within:border-[#947dff] focus-within:ring-1 focus-within:ring-[#947dff] transition-all p-1">
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full bg-transparent border-none outline-none resize-none min-h-[110px] p-4 text-[#e2e2e6] placeholder:text-[#938ea1] text-sm md:text-base font-sans"
                placeholder="Ask anything about your database... e.g. 'Show me top 5 products by rating' or 'Total orders grouped by region'"
              />
              <div className="p-3 pt-0 flex flex-wrap items-center justify-between gap-2 border-t border-[#333538]/50 mt-1">
                <div className="flex items-center text-[#c9c4d8] text-xs gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#cabeff]">bolt</span>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/40 rounded px-2 py-1 outline-none text-xs font-medium"
                  >
                    <option value="Llama 3.3 70B Versatile">Groq: Llama 3.3 70B Versatile</option>
                    <option value="Llama 3.1 8B Instant">Groq: Llama 3.1 8B Instant</option>
                    <option value="DeepSeek R1 Distill 70B">Groq: DeepSeek R1 Distill 70B</option>
                    <option value="Mixtral 8x7B">Groq: Mixtral 8x7B</option>
                  </select>
                </div>

                <button
                  onClick={() => handleGenerate()}
                  disabled={isGenerating}
                  className="bg-[#947dff] hover:bg-[#cabeff] text-[#2b0088] px-5 py-2 rounded-lg font-semibold shadow-md shadow-[#947dff]/20 transition-all flex items-center gap-2 text-xs md:text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
                      Generating with Groq...
                    </>
                  ) : (
                    <>
                      Generate & Run SQL <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => { setPromptText("Show revenue grouped by product category"); handleGenerate(); }}
              className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-[#4ae176]">trending_up</span> Category Revenue
            </button>
            <button 
              onClick={() => { setPromptText("List products with rating greater than 4.5 sorted by rating"); handleGenerate(); }}
              className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-[#cabeff]">star</span> Top Rated Products
            </button>
            <button 
              onClick={() => { setPromptText("Show reviews with reviewer name and product name"); handleGenerate(); }}
              className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-[#c3c6ce]">rate_review</span> Customer Reviews
            </button>
          </div>

          {/* Generated SQL Editor */}
          <div className="rounded-xl overflow-hidden shadow-2xl border border-[#333538] bg-[#0B0D10]">
            <div className="flex items-center justify-between bg-[#333538] px-4 py-2 border-b border-[#484555]/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#cabeff]">code</span>
                <span className="text-xs font-mono text-[#e2e2e6]">Executable SQLite SQL</span>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={handleCopySql}
                  className="text-[#c9c4d8] hover:text-[#e2e2e6] p-1 rounded hover:bg-[#484555] transition-colors relative"
                  title="Copy SQL"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  {copied && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#333538] text-white text-[10px] px-2 py-0.5 rounded shadow">Copied!</span>
                  )}
                </button>
              </div>
            </div>

            <div className="p-4 font-mono text-xs md:text-sm leading-relaxed overflow-x-auto text-[#e2e2e6] bg-[#0B0D10]">
              <textarea
                value={generatedSql}
                onChange={(e) => setGeneratedSql(e.target.value)}
                className="w-full bg-transparent border-none outline-none font-mono text-xs md:text-sm text-[#e2e2e6] resize-y min-h-[100px]"
              />
            </div>

            <div className="bg-[#333538] px-4 py-3 border-t border-[#484555]/30 flex flex-wrap justify-between items-center gap-2">
              <div className="text-xs text-[#c9c4d8] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4ae176]"></span> Ready for live execution on SQLite
              </div>
              <button 
                onClick={() => handleRunQuery()}
                disabled={isRunningQuery}
                className="px-5 py-2 bg-[#4ae176] text-[#003915] font-semibold rounded shadow-md shadow-[#4ae176]/20 hover:bg-[#6bff8f] transition-all flex items-center gap-2 text-xs md:text-sm cursor-pointer disabled:opacity-50"
              >
                {isRunningQuery ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
                    Executing Query...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span> Run Live Query
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Explanation Insight */}
          <div className="bg-[#947dff]/10 border border-[#947dff]/20 rounded-xl p-4 flex gap-3 items-start">
            <span className="material-symbols-outlined text-[#cabeff] mt-0.5 text-[20px]">auto_awesome</span>
            <div>
              <h4 className="text-xs md:text-sm font-semibold text-[#e2e2e6] mb-1">AI Explanation</h4>
              <p className="text-xs md:text-sm text-[#c9c4d8] leading-relaxed">
                {aiInsight}
              </p>
            </div>
          </div>

          {/* Results Section */}
          {queryResults && (
            <div className="mt-2 mb-12">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-semibold text-[#e2e2e6]">Execution Results</h3>
                <div className="flex items-center gap-3 text-xs text-[#c9c4d8] font-mono">
                  <span className="bg-[#1e2023] px-2 py-1 rounded border border-[#333538] text-[#4ae176]">
                    {queryResults.rowCount} rows returned
                  </span>
                  <span className="bg-[#1e2023] px-2 py-1 rounded border border-[#333538]">
                    Time: {queryResults.execTime}
                  </span>
                </div>
              </div>

              {/* SQL Error Banner */}
              {queryResults.error ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-xs font-mono">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <span className="material-symbols-outlined text-[18px]">error</span> SQL Execution Failed
                  </div>
                  <div>{queryResults.error}</div>
                </div>
              ) : (
                /* Live Data Table */
                <div className="bg-[#1e2023] rounded-xl overflow-x-auto border border-[#333538] shadow-lg">
                  {queryResults.rows.length === 0 ? (
                    <div className="p-8 text-center text-[#c9c4d8] text-sm">
                      Query executed successfully, but returned 0 matching rows.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-[#333538]/60 border-b border-[#333538] text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">
                          {queryResults.columns.map((col) => (
                            <th key={col} className="p-3 font-mono">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-xs md:text-sm text-[#e2e2e6] divide-y divide-[#333538]/60">
                        {queryResults.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#282a2d] transition-colors font-mono">
                            {queryResults.columns.map((col) => (
                              <td key={col} className="p-3">
                                {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-[#666] italic">null</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Right Column: Live Context & Table Inspector */}
      <aside className="w-72 xl:w-80 bg-[#1e2023] border-l border-[#333538] hidden lg:flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-[#333538]">
          <h3 className="font-semibold text-sm text-[#e2e2e6]">Table Inspector</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTableSchema ? (
            <div className="bg-[#111317] rounded-lg p-3 shadow-sm border border-[#333538]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#cabeff]">table</span>
                <h4 className="font-semibold text-sm text-[#e2e2e6]">{activeTableSchema.name}</h4>
                <span className="ml-auto text-[10px] bg-[#4ae176]/15 text-[#4ae176] px-1.5 py-0.5 rounded font-mono">
                  {activeTableSchema.rowCount}
                </span>
              </div>
              <div className="space-y-2 mt-3">
                {activeTableSchema.columns.map((col) => (
                  <div key={col.name} className="flex justify-between items-center text-xs">
                    <span className="font-mono text-[#e6deff]">{col.name}</span>
                    <span className="text-[#c9c4d8] text-[11px] font-mono">
                      {col.type}
                      {col.isPk && <span className="text-[#cabeff] text-[10px] font-bold ml-1">PK</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#c9c4d8]">Loading live schema...</div>
          )}
        </div>
      </aside>
    </div>
  );
};
