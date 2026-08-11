import React, { useState, useEffect } from 'react';
import { DatabaseConfig, QueryHistoryItem, SqlDialect, AIAnalysisResult } from '../types';

interface QueryWorkspaceProps {
  databases: DatabaseConfig[];
  activeDatabase: DatabaseConfig;
  onSelectDatabase: (id: string) => void;
  onAddDatabase: (db: DatabaseConfig) => void;
  onAddHistoryItem: (item: QueryHistoryItem) => void;
}

interface TableSchemaItem {
  id: string;
  name: string;
  rowCount: string;
  columns: { name: string; type: string; isPk?: boolean; description?: string }[];
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({
  databases,
  activeDatabase,
  onSelectDatabase,
  onAddDatabase,
  onAddHistoryItem
}) => {
  // Collapsible panels state for perfect responsiveness!
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);

  // Schema state
  const [liveSchema, setLiveSchema] = useState<TableSchemaItem[]>([]);
  const [selectedTable, setSelectedTable] = useState('orders');
  
  // Prompt & Model state
  const [promptText, setPromptText] = useState('Show me top spending customers with completed order details.');
  const [selectedModel, setSelectedModel] = useState('Llama 3.3 70B Versatile');
  
  // Groq Key state
  const [hasApiKey, setHasApiKey] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Add Database Modal state
  const [showAddDbModal, setShowAddDbModal] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [newDbDialect, setNewDbDialect] = useState<SqlDialect>('PostgreSQL');
  const [newDbConnString, setNewDbConnString] = useState('');

  // Execution states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningQuery, setIsRunningQuery] = useState(false);

  // Generated SQL state
  const [generatedSql, setGeneratedSql] = useState<string>(
    `SELECT \n    u.customer_id,\n    u.name,\n    u.region,\n    COUNT(o.order_id) AS total_orders,\n    ROUND(SUM(o.total_amount), 2) AS total_spent\nFROM \n    users u\nJOIN \n    orders o ON u.customer_id = o.customer_id\nWHERE \n    o.status = 'completed'\nGROUP BY \n    u.customer_id, u.name, u.region\nORDER BY \n    total_spent DESC\nLIMIT 10;`
  );

  const [aiInsight, setAiInsight] = useState<string>(
    `Generates optimized JOIN query targeting ${activeDatabase?.dialect || 'SQLite'} schema.`
  );

  // Live Query Results State
  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    rowCount: number;
    execTime: string;
    error?: string;
  } | null>(null);

  // AI Quality Analysis State (Thumbs Up / Down)
  const [userRating, setUserRating] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);

  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load live database schema on mount
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

    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHasApiKey(Boolean(data.hasGroqKey));
      })
      .catch(err => console.error("Health check error:", err));
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

  // Submit New Database Modal
  const handleSaveNewDb = () => {
    if (!newDbName.trim()) return;
    const newDb: DatabaseConfig = {
      id: `db-${Date.now()}`,
      name: newDbName.trim(),
      dialect: newDbDialect,
      connectionString: newDbConnString.trim() || `${newDbDialect.toLowerCase()}://localhost/db`,
      status: 'connected'
    };
    onAddDatabase(newDb);
    setShowAddDbModal(false);
    setNewDbName('');
    setNewDbConnString('');
  };

  // Generate SQL via Groq AI with target dialect
  const handleGenerate = async () => {
    setIsGenerating(true);
    setAiAnalysis(null);
    setUserRating(null);

    try {
      const response = await fetch('/api/generate-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          model: selectedModel,
          dialect: activeDatabase?.dialect || 'SQLite'
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
        // Auto-run query
        handleRunQuery(data.sql);
      }
    } catch (err) {
      console.error("Failed to generate SQL from Groq:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Run SQL Query
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
          model: `${selectedModel} (${activeDatabase?.dialect || 'SQLite'})`,
          execTime: data.executionTimeMs || '1ms',
          rowsCount: data.rowCount || 0,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

  // Manual "Save to History" button handler
  const handleManualSaveHistory = () => {
    onAddHistoryItem({
      id: `q-manual-${Date.now()}`,
      question: promptText || "Custom SQL Execution",
      sql: generatedSql,
      status: queryResults?.error ? 'Failed' : 'Success',
      model: selectedModel,
      execTime: queryResults?.execTime || '0ms',
      rowsCount: queryResults?.rowCount || 0,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Thumbs Up / Thumbs Down Feedback + AI Quality Analysis
  const handleFeedback = async (rating: 'thumbs_up' | 'thumbs_down') => {
    setUserRating(rating);
    setIsAnalyzing(true);
    setAiAnalysis(null);

    try {
      const response = await fetch('/api/analyze-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          sql: generatedSql,
          dialect: activeDatabase?.dialect || 'SQLite',
          feedbackType: rating
        })
      });

      const data = await response.json();
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeTableSchema = liveSchema.find(t => t.name === selectedTable) || liveSchema[0];

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative bg-[#111317]">

      {/* Left Collapsible Panel: Database Tables */}
      {showLeftPanel && (
        <aside className="w-72 bg-[#1e2023] border-r border-[#333538] h-full flex flex-col z-20 shadow-xl flex-shrink-0 animate-in slide-in-from-left duration-200">
          <div className="p-4 flex items-center justify-between border-b border-[#333538]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ae176] text-[20px]">database</span>
              <h3 className="font-semibold text-sm text-[#e2e2e6]">{activeDatabase?.name || 'SQLite'}</h3>
            </div>
            <button onClick={() => setShowLeftPanel(false)} className="text-[#c9c4d8] hover:text-white">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <div className="px-2 py-1.5 text-[11px] font-semibold text-[#938ea1] uppercase tracking-wider">
              Tables ({liveSchema.length})
            </div>
            <div className="space-y-1 mt-1">
              {liveSchema.map((table) => {
                const isSelected = selectedTable === table.name;
                return (
                  <div
                    key={table.id}
                    onClick={() => setSelectedTable(table.name)}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
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
        </aside>
      )}

      {/* Main Workspace Column (100% Responsive Full Width!) */}
      <main className="flex-1 flex flex-col h-full bg-[#111317] relative overflow-y-auto w-full min-w-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6">

          {/* Top Bar Navigation & Actions */}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333538]/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-[#e2e2e6] tracking-tight">Query Workspace</h1>
                <span className="bg-[#947dff]/20 text-[#cabeff] border border-[#947dff]/30 text-xs font-mono px-2 py-0.5 rounded-md">
                  {activeDatabase?.dialect || 'SQLite'}
                </span>
              </div>
              <p className="text-xs text-[#c9c4d8] mt-1">Multi-dialect AI SQL generator & live database engine.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Left Tables Panel */}
              <button 
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  showLeftPanel ? 'bg-[#333538] border-[#947dff] text-[#cabeff]' : 'bg-[#1e2023] border-[#484555]/40 text-[#c9c4d8] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_sidebar</span>
                <span>Tables</span>
              </button>

              {/* Database Selector Dropdown */}
              <div className="flex items-center bg-[#1e2023] border border-[#484555]/40 rounded-lg px-2.5 py-1 text-xs">
                <span className="material-symbols-outlined text-[16px] text-[#4ae176] mr-1.5">database</span>
                <select
                  value={activeDatabase?.id}
                  onChange={(e) => onSelectDatabase(e.target.value)}
                  className="bg-transparent text-[#e2e2e6] outline-none font-medium text-xs cursor-pointer"
                >
                  {databases.map((db) => (
                    <option key={db.id} value={db.id} className="bg-[#111317] text-[#e2e2e6]">
                      {db.name} ({db.dialect})
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Database Button */}
              <button
                onClick={() => setShowAddDbModal(true)}
                className="px-3 py-1.5 rounded-lg bg-[#947dff]/20 hover:bg-[#947dff]/30 border border-[#947dff]/40 text-[#cabeff] transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span> Add DB
              </button>

              {/* Toggle Inspector Panel */}
              <button 
                onClick={() => setShowRightPanel(!showRightPanel)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  showRightPanel ? 'bg-[#333538] border-[#947dff] text-[#cabeff]' : 'bg-[#1e2023] border-[#484555]/40 text-[#c9c4d8] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>Inspector</span>
              </button>
            </div>
          </header>

          {/* Groq API Key Setup Banner if missing */}
          {!hasApiKey && (
            <div className="bg-[#282a2d] border border-[#947dff]/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg w-full min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#947dff]/20 text-[#cabeff] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined">key</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#e2e2e6]">Enter your Groq API Key</h4>
                  <p className="text-xs text-[#c9c4d8] mt-0.5">
                    Enable live Groq AI generation (`llama-3.3-70b-versatile`). Get a free key at <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[#cabeff] underline">console.groq.com</a>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/50 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-[#947dff] flex-1 md:w-52 font-mono"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={isSavingKey}
                  className="bg-[#947dff] hover:bg-[#cabeff] text-[#2b0088] px-4 py-1.5 rounded-lg font-semibold text-xs transition-colors flex-shrink-0 cursor-pointer"
                >
                  {isSavingKey ? 'Saving...' : 'Save Key'}
                </button>
              </div>
            </div>
          )}

          {/* Natural Language Prompt Input */}
          <div className="bg-[#1e2023] rounded-xl shadow-lg border border-[#333538] focus-within:border-[#947dff] focus-within:ring-1 focus-within:ring-[#947dff] transition-all p-1 w-full">
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full bg-transparent border-none outline-none resize-none min-h-[100px] p-4 text-[#e2e2e6] placeholder:text-[#938ea1] text-sm md:text-base font-sans"
                placeholder={`Ask anything about your ${activeDatabase?.dialect || 'SQLite'} database... e.g. 'Show me top 5 products by rating' or 'Total orders grouped by region'`}
              />
              <div className="p-3 pt-0 flex flex-wrap items-center justify-between gap-2 border-t border-[#333538]/50 mt-1">
                <div className="flex items-center text-[#c9c4d8] text-xs gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#cabeff]">bolt</span>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/40 rounded px-2 py-1 outline-none text-xs font-medium cursor-pointer"
                  >
                    <option value="Llama 3.3 70B Versatile">Groq: Llama 3.3 70B Versatile</option>
                    <option value="Llama 3.1 8B Instant">Groq: Llama 3.1 8B Instant</option>
                    <option value="DeepSeek R1 Distill 70B">Groq: DeepSeek R1 Distill 70B</option>
                    <option value="Mixtral 8x7B">Groq: Mixtral 8x7B</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-[#947dff] hover:bg-[#cabeff] text-[#2b0088] px-5 py-2 rounded-lg font-semibold shadow-md shadow-[#947dff]/20 transition-all flex items-center gap-2 text-xs md:text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
                      Generating...
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

          {/* Quick Example Prompts */}
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
              onClick={() => { setPromptText("Show customer reviews with reviewer name and product name"); handleGenerate(); }}
              className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-[#c3c6ce]">rate_review</span> Customer Reviews
            </button>
          </div>

          {/* Generated SQL Editor Box */}
          <div className="rounded-xl overflow-hidden shadow-2xl border border-[#333538] bg-[#0B0D10] w-full">
            <div className="flex flex-wrap items-center justify-between bg-[#333538] px-4 py-2 border-b border-[#484555]/30 gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#cabeff]">code</span>
                <span className="text-xs font-mono text-[#e2e2e6]">Generated SQL ({activeDatabase?.dialect || 'SQLite'})</span>
              </div>

              {/* Action Buttons: Copy, Save to History, Thumbs Up / Down */}
              <div className="flex items-center gap-2">
                {/* Manual Save to History Button */}
                <button
                  onClick={handleManualSaveHistory}
                  className="px-2.5 py-1 rounded bg-[#282a2d] hover:bg-[#484555] text-[#c9c4d8] hover:text-white text-xs font-medium flex items-center gap-1 transition-colors relative cursor-pointer"
                  title="Save to Query History"
                >
                  <span className="material-symbols-outlined text-[15px] text-[#4ae176]">bookmark_add</span>
                  <span>Save to History</span>
                  {saveSuccess && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#4ae176] text-[#003915] font-bold text-[10px] px-2 py-0.5 rounded shadow">Saved!</span>
                  )}
                </button>

                {/* Thumbs Up Button */}
                <button 
                  onClick={() => handleFeedback('thumbs_up')}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    userRating === 'thumbs_up' ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'text-[#c9c4d8] hover:text-white hover:bg-[#484555]'
                  }`}
                  title="Thumbs Up - Good Query"
                >
                  <span className="material-symbols-outlined text-[18px]">thumb_up</span>
                </button>

                {/* Thumbs Down Button */}
                <button 
                  onClick={() => handleFeedback('thumbs_down')}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    userRating === 'thumbs_down' ? 'bg-red-500/20 text-red-400' : 'text-[#c9c4d8] hover:text-white hover:bg-[#484555]'
                  }`}
                  title="Thumbs Down - Incorrect / Needs Fix"
                >
                  <span className="material-symbols-outlined text-[18px]">thumb_down</span>
                </button>

                {/* Copy SQL Button */}
                <button 
                  onClick={handleCopySql}
                  className="text-[#c9c4d8] hover:text-[#e2e2e6] p-1.5 rounded hover:bg-[#484555] transition-colors relative cursor-pointer"
                  title="Copy SQL"
                >
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
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
                className="w-full bg-transparent border-none outline-none font-mono text-xs md:text-sm text-[#e2e2e6] resize-y min-h-[90px]"
              />
            </div>

            <div className="bg-[#333538] px-4 py-3 border-t border-[#484555]/30 flex flex-wrap justify-between items-center gap-2">
              <div className="text-xs text-[#c9c4d8] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4ae176]"></span> Ready to execute on {activeDatabase?.name || 'SQLite'}
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

          {/* AI Quality Testing & Analysis Overlay (Triggered by Thumbs Up / Down) */}
          {(isAnalyzing || aiAnalysis) && (
            <div className="bg-[#1e2023] border border-[#947dff]/40 rounded-xl p-5 shadow-xl space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-[#333538] pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#cabeff]">analytics</span>
                  <h3 className="text-sm font-bold text-[#e2e2e6]">Groq AI Quality & Syntax Analysis</h3>
                </div>

                {aiAnalysis && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                    aiAnalysis.verdict === 'Optimal Query' 
                      ? 'bg-[#4ae176]/20 text-[#4ae176] border border-[#4ae176]/30' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {aiAnalysis.verdict}
                  </span>
                )}
              </div>

              {isAnalyzing ? (
                <div className="flex items-center gap-3 text-xs text-[#c9c4d8] py-4">
                  <span className="material-symbols-outlined animate-spin text-[#947dff]">autorenew</span>
                  <span>Analyzing SQL correctness, performance, and dialect joins...</span>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-3 text-xs md:text-sm">
                  <p className="text-[#c9c4d8] leading-relaxed">{aiAnalysis.explanation}</p>

                  {aiAnalysis.optimizations?.length > 0 && (
                    <div className="bg-[#111317] p-3 rounded-lg border border-[#333538] space-y-1">
                      <div className="font-semibold text-xs text-[#cabeff] mb-1">Key Recommendations:</div>
                      {aiAnalysis.optimizations.map((tip, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-[#c9c4d8]">
                          <span className="text-[#4ae176]">✓</span> {tip}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.suggestedSql && aiAnalysis.suggestedSql !== generatedSql && (
                    <div className="bg-[#0B0D10] p-3 rounded-lg border border-[#947dff]/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-[#cabeff]">Suggested Optimized Query:</span>
                        <button
                          onClick={() => {
                            setGeneratedSql(aiAnalysis.suggestedSql!);
                            handleRunQuery(aiAnalysis.suggestedSql!);
                          }}
                          className="px-3 py-1 rounded bg-[#947dff] text-[#2b0088] font-bold text-xs hover:bg-[#cabeff] transition-colors cursor-pointer"
                        >
                          Use This Query
                        </button>
                      </div>
                      <pre className="font-mono text-xs text-[#e2e2e6] overflow-x-auto p-2 bg-[#111317] rounded">
                        <code>{aiAnalysis.suggestedSql}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

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

          {/* Execution Results Section */}
          {queryResults && (
            <div className="mt-2 mb-12 w-full">
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
                <div className="bg-[#1e2023] rounded-xl overflow-x-auto border border-[#333538] shadow-lg w-full">
                  {queryResults.rows.length === 0 ? (
                    <div className="p-8 text-center text-[#c9c4d8] text-sm">
                      Query executed successfully, but returned 0 matching rows.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[500px]">
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

      {/* Right Collapsible Panel: Table Inspector */}
      {showRightPanel && (
        <aside className="w-80 bg-[#1e2023] border-l border-[#333538] h-full flex flex-col z-20 shadow-xl flex-shrink-0 animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-[#333538] flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[#e2e2e6]">Table Inspector</h3>
            <button onClick={() => setShowRightPanel(false)} className="text-[#c9c4d8] hover:text-white">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
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
              <div className="text-xs text-[#c9c4d8]">Select a table to inspect columns.</div>
            )}
          </div>
        </aside>
      )}

      {/* Add New Database Modal */}
      {showAddDbModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e2023] border border-[#333538] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#333538] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4ae176]">add_database</span>
                <h3 className="text-lg font-bold text-[#e2e2e6]">Add Database Connection</h3>
              </div>
              <button onClick={() => setShowAddDbModal(false)} className="text-[#938ea1] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Database Name</label>
                <input 
                  type="text" 
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="e.g. Analytics PostgreSQL" 
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff]" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">SQL Dialect</label>
                <select
                  value={newDbDialect}
                  onChange={(e) => setNewDbDialect(e.target.value as SqlDialect)}
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff]"
                >
                  <option value="PostgreSQL">PostgreSQL</option>
                  <option value="MySQL">MySQL</option>
                  <option value="SQLite">SQLite</option>
                  <option value="MariaDB">MariaDB</option>
                  <option value="SQL Server">Microsoft SQL Server</option>
                  <option value="Oracle">Oracle Database</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Connection String / Host URL</label>
                <input 
                  type="text" 
                  value={newDbConnString}
                  onChange={(e) => setNewDbConnString(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/dbname" 
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff] font-mono" 
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-[#333538]">
              <button 
                onClick={() => setShowAddDbModal(false)} 
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#282a2d] text-[#c9c4d8] cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveNewDb} 
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#947dff] text-[#2b0088] hover:bg-[#cabeff] transition-colors cursor-pointer"
              >
                Connect Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
