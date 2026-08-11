import React, { useState, useEffect } from 'react';
import { DatabaseConfig, QueryHistoryItem, SqlDialect, AIAnalysisResult, AIProvider, ModelRatings } from '../types';

interface QueryWorkspaceProps {
  databases: DatabaseConfig[];
  activeDatabase: DatabaseConfig;
  onSelectDatabase: (id: string) => void;
  onAddDatabase: (db: DatabaseConfig) => void;
  onRenameDatabase: (id: string, newName: string) => void;
  onDeleteDatabase: (id: string) => void;
  onAddHistoryItem: (item: QueryHistoryItem) => void;
  queryHistory: QueryHistoryItem[];
}

interface TableSchemaItem {
  id: string;
  name: string;
  rowCount: string;
  columns: { name: string; type: string; isPk?: boolean; description?: string }[];
}

const DB_CONNECTION_EXAMPLES: Record<SqlDialect, { placeholder: string; example: string; notes: string }> = {
  PostgreSQL: {
    placeholder: 'postgresql://postgres:password@localhost:5432/dbname',
    example: 'postgresql://postgres:pass123@localhost:5432/production',
    notes: 'Default PostgreSQL port: 5432.'
  },
  MySQL: {
    placeholder: 'mysql://user:password@localhost:3306/dbname',
    example: 'mysql://root:secret@localhost:3306/sales_db',
    notes: 'Default MySQL port: 3306.'
  },
  SQLite: {
    placeholder: 'sqlite:///querypilot.db or sqlite:///C:/path/to/db.sqlite',
    example: 'sqlite:///querypilot.db',
    notes: 'Local SQLite database file path.'
  },
  MariaDB: {
    placeholder: 'mysql://user:password@localhost:3306/dbname',
    example: 'mysql://maria_user:pass@localhost:3306/app_db',
    notes: 'MariaDB on port 3306.'
  },
  'SQL Server': {
    placeholder: 'mssql://sa:password@localhost:1433/dbname',
    example: 'mssql://sa:StrongPass123@localhost:1433/enterprise_db',
    notes: 'Default SQL Server port: 1433.'
  },
  Oracle: {
    placeholder: 'oracle://user:password@localhost:1521/XEPDB1',
    example: 'oracle://system:oracle_pass@localhost:1521/ORCL',
    notes: 'Default Oracle listener port: 1521.'
  }
};

const DEFAULT_PROVIDER_MODELS: Record<AIProvider, string[]> = {
  Groq: ['Llama 3.3 70B Versatile', 'Llama 3.1 8B Instant', 'DeepSeek R1 Distill 70B', 'Mixtral 8x7B'],
  Gemini: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  OpenAI: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  Claude: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'],
  OpenRouter: ['meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1'],
  Local: ['local-ollama (http://localhost:11434)', 'local-lmstudio (http://localhost:1234/v1)']
};

const isMutationQuery = (sql: string): boolean => {
  const clean = sql.trim().toUpperCase();
  return /\b(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(clean);
};

const getMutationOpType = (sql: string): string => {
  const upper = sql.trim().toUpperCase();
  if (upper.includes('CREATE')) return 'CREATE TABLE / SCHEMA';
  if (upper.includes('DROP')) return 'DROP TABLE / SCHEMA';
  if (upper.includes('ALTER')) return 'ALTER TABLE';
  if (upper.includes('TRUNCATE')) return 'TRUNCATE TABLE';
  if (upper.includes('INSERT')) return 'INSERT DATA';
  if (upper.includes('UPDATE')) return 'UPDATE DATA';
  if (upper.includes('DELETE')) return 'DELETE DATA';
  return 'MUTATION OPERATION';
};

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({
  databases,
  activeDatabase,
  onSelectDatabase,
  onAddDatabase,
  onRenameDatabase,
  onDeleteDatabase,
  onAddHistoryItem,
  queryHistory
}) => {
  // Collapsible & Resizable sidebars state
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  
  // Resizable Sidebars Width (Drag with Mouse!)
  const [leftWidth, setLeftWidth] = useState<number>(280);
  const [rightWidth, setRightWidth] = useState<number>(320);

  // Mouse Drag Handler for Left Tables Panel
  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.min(Math.max(startWidth + (moveEvent.clientX - startX), 180), 550);
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Mouse Drag Handler for Right Inspector Panel
  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.min(Math.max(startWidth - (moveEvent.clientX - startX), 200), 600);
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Schema state
  const [liveSchema, setLiveSchema] = useState<TableSchemaItem[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  
  // Persistent Prompt & Multi-AI Provider State across Tab Switch & Page Reloads
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('querypilot_selected_provider');
      return (saved as AIProvider) || 'Groq';
    } catch {
      return 'Groq';
    }
  });

  const [providerModels, setProviderModels] = useState<string[]>(
    DEFAULT_PROVIDER_MODELS[selectedProvider] || DEFAULT_PROVIDER_MODELS.Groq
  );

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('querypilot_selected_model');
      return saved || DEFAULT_PROVIDER_MODELS.Groq[0];
    } catch {
      return DEFAULT_PROVIDER_MODELS.Groq[0];
    }
  });

  const [promptText, setPromptText] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('querypilot_prompt_text');
      return saved !== null ? saved : 'Show me top spending customers with completed order details.';
    } catch {
      return 'Show me top spending customers with completed order details.';
    }
  });

  const [generatedSql, setGeneratedSql] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('querypilot_generated_sql');
      return saved !== null ? saved : 'SELECT * FROM users LIMIT 30;';
    } catch {
      return 'SELECT * FROM users LIMIT 30;';
    }
  });

  const [aiInsight, setAiInsight] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('querypilot_ai_insight');
      return saved || '';
    } catch {
      return '';
    }
  });

  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    rowCount: number;
    execTime: string;
    error?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('querypilot_query_results');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem('querypilot_ai_analysis');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isCachedResponse, setIsCachedResponse] = useState(false);

  // Default Result Row Limit State (Loads from settings or defaults to 30)
  const [resultRowLimit, setResultRowLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('querypilot_row_limit');
      return saved !== null ? parseInt(saved, 10) : 30;
    } catch {
      return 30;
    }
  });

  // Per-Model Ratings
  const [modelRatings, setModelRatings] = useState<ModelRatings>(() => {
    try {
      const saved = localStorage.getItem('querypilot_model_ratings');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Sync state to LocalStorage so tab switches and reloads preserve EVERYTHING!
  useEffect(() => {
    localStorage.setItem('querypilot_selected_provider', selectedProvider);
  }, [selectedProvider]);

  useEffect(() => {
    localStorage.setItem('querypilot_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('querypilot_prompt_text', promptText);
  }, [promptText]);

  useEffect(() => {
    localStorage.setItem('querypilot_generated_sql', generatedSql);
  }, [generatedSql]);

  useEffect(() => {
    if (aiInsight) localStorage.setItem('querypilot_ai_insight', aiInsight);
    else localStorage.removeItem('querypilot_ai_insight');
  }, [aiInsight]);

  useEffect(() => {
    if (queryResults) localStorage.setItem('querypilot_query_results', JSON.stringify(queryResults));
    else localStorage.removeItem('querypilot_query_results');
  }, [queryResults]);

  useEffect(() => {
    if (aiAnalysis) localStorage.setItem('querypilot_ai_analysis', JSON.stringify(aiAnalysis));
    else localStorage.removeItem('querypilot_ai_analysis');
  }, [aiAnalysis]);

  useEffect(() => {
    localStorage.setItem('querypilot_model_ratings', JSON.stringify(modelRatings));
  }, [modelRatings]);

  // Model switching handler: PRESERVES promptText, generatedSql, queryResults, and model if valid!
  useEffect(() => {
    const defaultList = DEFAULT_PROVIDER_MODELS[selectedProvider] || DEFAULT_PROVIDER_MODELS.Groq;
    setProviderModels(defaultList);
    if (!defaultList.includes(selectedModel)) {
      setSelectedModel(defaultList[0]);
    }
    setAiTestResult(null);
  }, [selectedProvider]);

  // Database Management Modal state
  const [showAddDbModal, setShowAddDbModal] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [newDbDialect, setNewDbDialect] = useState<SqlDialect>('PostgreSQL');
  const [newDbConnString, setNewDbConnString] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);

  // Rename Database Modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  // Operational Safety Approval State
  const [pendingSafetyApproval, setPendingSafetyApproval] = useState<{
    sql: string;
    opType: string;
  } | null>(null);

  // Execution states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningQuery, setIsRunningQuery] = useState(false);
  const [activeFeedbackType, setActiveFeedbackType] = useState<'thumbs_up' | 'thumbs_down' | 'better_suggestion' | 'wrong_result' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [copied, setCopied] = useState(false);

  const fetchLiveSchema = () => {
    if (!activeDatabase) return;
    setIsLoadingSchema(true);
    setSchemaError(null);

    fetch('/api/schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dialect: activeDatabase.dialect,
        connectionString: activeDatabase.connectionString
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.schema)) {
          setLiveSchema(data.schema);
          if (data.schema.length > 0) {
            if (!selectedTable || !data.schema.some(t => t.name === selectedTable)) {
              setSelectedTable(data.schema[0].name);
            }
          }
        } else {
          setSchemaError(data.error || 'Could not fetch database schema.');
        }
      })
      .catch(err => setSchemaError(err.message || "Failed to load schema"))
      .finally(() => setIsLoadingSchema(false));
  };

  useEffect(() => {
    fetchLiveSchema();
  }, [activeDatabase]);

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setAiTestResult(null);

    try {
      const res = await fetch('/api/test-ai-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider })
      });
      const data = await res.json();
      if (data.success) {
        setAiTestResult({ success: true, message: data.message });
        if (Array.isArray(data.models) && data.models.length > 0) {
          setProviderModels(data.models);
          setSelectedModel(data.models[0]);
        }
      } else {
        setAiTestResult({ success: false, message: data.error });
      }
    } catch (err: any) {
      setAiTestResult({ success: false, message: err.message || "AI connection ping failed." });
    } finally {
      setTestingAi(false);
    }
  };

  const handleTestConnection = async () => {
    if (!newDbConnString.trim() && newDbDialect !== 'SQLite') {
      setTestResult({ success: false, message: "Please enter a connection string first." });
      return;
    }
    setIsTestingConn(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dialect: newDbDialect, connectionString: newDbConnString.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Failed to ping database." });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSaveNewDb = () => {
    if (!newDbName.trim()) return;
    const newDb: DatabaseConfig = {
      id: `db-${Date.now()}`,
      name: newDbName.trim(),
      dialect: newDbDialect,
      connectionString: newDbConnString.trim() || undefined,
      status: 'connected'
    };
    onAddDatabase(newDb);
    setShowAddDbModal(false);
    setNewDbName('');
    setNewDbConnString('');
    setTestResult(null);
  };

  const handleConfirmRename = () => {
    if (renameInput.trim() && activeDatabase) {
      onRenameDatabase(activeDatabase.id, renameInput.trim());
      setShowRenameModal(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setAiAnalysis(null);
    setActiveFeedbackType(null);
    setPendingSafetyApproval(null);
    setIsCachedResponse(false);

    try {
      const response = await fetch('/api/generate-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          provider: selectedProvider,
          model: selectedModel,
          dialect: activeDatabase?.dialect || 'SQLite',
          connectionString: activeDatabase?.connectionString
        })
      });

      const data = await response.json();
      if (response.ok) {
        if (data.sql) {
          setGeneratedSql(data.sql);
        }
        if (data.explanation) {
          setAiInsight(data.explanation);
        }
        if (data.cached) {
          setIsCachedResponse(true);
        }
        handleRunQuery(data.sql);
      } else if (data.error) {
        alert(data.error);
        if (data.fallbackSql) setGeneratedSql(data.fallbackSql);
      }
    } catch (err) {
      console.error("Failed to generate SQL:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunQuery = async (targetSql?: string, overrideSafety: boolean = false) => {
    const sqlToRun = targetSql || generatedSql;

    if (!overrideSafety && isMutationQuery(sqlToRun)) {
      setPendingSafetyApproval({
        sql: sqlToRun,
        opType: getMutationOpType(sqlToRun)
      });
      return;
    }

    setIsRunningQuery(true);
    setQueryResults(null);

    try {
      const response = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlToRun,
          dialect: activeDatabase?.dialect || 'SQLite',
          connectionString: activeDatabase?.connectionString
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQueryResults({
          columns: data.columns || [],
          rows: data.rows || [],
          rowCount: data.rowCount || 0,
          execTime: data.executionTimeMs || '1ms'
        });

        onAddHistoryItem({
          id: `q-${Date.now()}`,
          question: promptText,
          sql: sqlToRun,
          status: 'Success',
          model: `${selectedProvider}: ${selectedModel} (${activeDatabase?.dialect || 'SQLite'})`,
          execTime: data.executionTimeMs || '1ms',
          rowsCount: data.rowCount || 0,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now()
        });

        if (isMutationQuery(sqlToRun)) {
          fetchLiveSchema();
        }
      } else {
        setQueryResults({
          columns: [],
          rows: [],
          rowCount: 0,
          execTime: data.executionTimeMs || '0ms',
          error: data.error || 'Failed to execute query'
        });

        onAddHistoryItem({
          id: `q-${Date.now()}`,
          question: promptText,
          sql: sqlToRun,
          status: 'Failed',
          model: `${selectedProvider}: ${selectedModel} (${activeDatabase?.dialect || 'SQLite'})`,
          execTime: data.executionTimeMs || '0ms',
          rowsCount: 0,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now()
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

  const handleAcceptMutation = () => {
    if (pendingSafetyApproval) {
      const sqlToRun = pendingSafetyApproval.sql;
      setPendingSafetyApproval(null);
      handleRunQuery(sqlToRun, true);
    }
  };

  const handleRejectMutation = () => {
    setPendingSafetyApproval(null);
  };

  const modelRatingKey = `${selectedProvider}:${selectedModel}`;
  const currentModelRating = modelRatings[modelRatingKey] || { up: 0, down: 0 };

  const handleAiFeedbackAction = async (actionType: 'thumbs_up' | 'thumbs_down' | 'better_suggestion' | 'wrong_result') => {
    if (actionType === 'thumbs_up') {
      setModelRatings(prev => ({
        ...prev,
        [modelRatingKey]: {
          up: (prev[modelRatingKey]?.up || 0) + 1,
          down: prev[modelRatingKey]?.down || 0
        }
      }));
    } else if (actionType === 'thumbs_down') {
      setModelRatings(prev => ({
        ...prev,
        [modelRatingKey]: {
          up: prev[modelRatingKey]?.up || 0,
          down: (prev[modelRatingKey]?.down || 0) + 1
        }
      }));
    }

    setActiveFeedbackType(actionType);
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
          connectionString: activeDatabase?.connectionString,
          feedbackType: actionType,
          provider: selectedProvider,
          model: selectedModel
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
  const recentHistoryItems = queryHistory.slice(0, 5);

  // Effective row display slicing for results table
  const displayedRows = queryResults?.rows 
    ? (resultRowLimit === 0 ? queryResults.rows : queryResults.rows.slice(0, resultRowLimit))
    : [];

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden relative bg-[#111317]">

      {/* Left Collapsible & RESIZABLE Panel: Database Tables */}
      {showLeftPanel && (
        <>
          <aside 
            style={{ width: `${leftWidth}px` }}
            className="bg-[#1e2023] border-r border-[#333538] h-full flex flex-col z-20 shadow-xl flex-shrink-0 relative select-none"
          >
            <div className="p-4 flex items-center justify-between border-b border-[#333538]">
              <div className="flex items-center gap-2 truncate">
                <span className="material-symbols-outlined text-[#4ae176] text-[20px] flex-shrink-0">database</span>
                <h3 className="font-semibold text-sm text-[#e2e2e6] truncate">{activeDatabase?.name || 'SQLite'}</h3>
              </div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={fetchLiveSchema} 
                  disabled={isLoadingSchema}
                  className="p-1 rounded text-[#c9c4d8] hover:text-[#4ae176] hover:bg-[#333538] transition-colors"
                  title="Refresh live tables"
                >
                  <span className={`material-symbols-outlined text-[18px] ${isLoadingSchema ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                </button>

                <button onClick={() => setShowLeftPanel(false)} className="p-1 text-[#c9c4d8] hover:text-white">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-semibold text-[#938ea1] uppercase tracking-wider">
                <span>Tables ({liveSchema.length})</span>
                <button onClick={fetchLiveSchema} className="text-[10px] text-[#cabeff] hover:underline font-mono lowercase">Sync</button>
              </div>

              {isLoadingSchema ? (
                <div className="p-3 text-xs text-[#c9c4d8] flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[16px]">autorenew</span> Loading live tables...
                </div>
              ) : schemaError ? (
                <div className="p-3 text-xs text-red-400 bg-red-500/10 rounded border border-red-500/20">{schemaError}</div>
              ) : (
                <div className="space-y-1 mt-1">
                  {liveSchema.map((table) => {
                    const isSelected = selectedTable === table.name;
                    return (
                      <div
                        key={table.id}
                        onClick={() => {
                          setSelectedTable(table.name);
                          setGeneratedSql(`SELECT * FROM "${table.name}" LIMIT 30;`);
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#333538] text-[#e2e2e6]' : 'hover:bg-[#282a2d] text-[#c9c4d8]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
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
              )}
            </div>
          </aside>

          {/* Mouse Drag Resizer Bar for Left Sidebar */}
          <div 
            onMouseDown={handleLeftMouseDown}
            className="w-1.5 hover:w-2 bg-[#333538] hover:bg-[#947dff] cursor-col-resize h-full transition-all flex-shrink-0 z-30 flex items-center justify-center group"
            title="Drag mouse left/right to resize Tables Panel"
          >
            <div className="w-0.5 h-8 bg-[#666] group-hover:bg-white rounded"></div>
          </div>
        </>
      )}

      {/* Main Workspace Column (Responsive Center Path) */}
      <main className="flex-1 flex flex-col h-full bg-[#111317] relative overflow-y-auto w-full min-w-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6">

          {/* Top Bar Navigation & Actions */}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333538]/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-[#e2e2e6] tracking-tight">Query Workspace</h1>
                <span className="bg-[#4ae176]/15 text-[#4ae176] border border-[#4ae176]/30 text-xs font-mono px-2.5 py-0.5 rounded-md font-semibold">
                  {activeDatabase?.dialect || 'SQLite'} Connected
                </span>
              </div>
              <p className="text-xs text-[#c9c4d8] mt-1">Multi-AI Provider SQL workspace connected to {activeDatabase?.name || 'SQLite'}.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  showLeftPanel ? 'bg-[#333538] border-[#947dff] text-[#cabeff]' : 'bg-[#1e2023] border-[#484555]/40 text-[#c9c4d8] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_sidebar</span>
                <span>Tables</span>
              </button>

              <div className="flex items-center bg-[#1e2023] border border-[#484555]/40 rounded-lg px-2.5 py-1 text-xs">
                <span className="material-symbols-outlined text-[16px] text-[#4ae176] mr-1.5">database</span>
                <select
                  value={activeDatabase?.id}
                  onChange={(e) => onSelectDatabase(e.target.value)}
                  className="bg-transparent text-[#e2e2e6] outline-none font-semibold text-xs cursor-pointer max-w-[130px] truncate"
                >
                  {databases.map((db) => (
                    <option key={db.id} value={db.id} className="bg-[#111317] text-[#e2e2e6]">
                      {db.name} ({db.dialect})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => { setRenameInput(activeDatabase?.name || ''); setShowRenameModal(true); }}
                className="p-1.5 rounded-lg bg-[#1e2023] border border-[#484555]/40 text-[#c9c4d8] hover:text-white transition-colors text-xs cursor-pointer"
                title="Rename active database"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm(`Are you sure you want to remove database connection "${activeDatabase?.name}"?`)) {
                    onDeleteDatabase(activeDatabase.id);
                  }
                }}
                className="p-1.5 rounded-lg bg-[#1e2023] border border-[#484555]/40 text-[#c9c4d8] hover:text-red-400 transition-colors text-xs cursor-pointer"
                title="Delete active database connection"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>

              <button
                onClick={() => setShowAddDbModal(true)}
                className="px-3 py-1.5 rounded-lg bg-[#947dff]/20 hover:bg-[#947dff]/30 border border-[#947dff]/40 text-[#cabeff] transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span> Connect DB
              </button>

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

          {/* UNIFIED MULTI-AI PROVIDER & MODEL BAR */}
          <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#cabeff]">psychology</span>
                <span className="text-xs font-semibold text-[#c9c4d8]">AI Provider:</span>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as AIProvider)}
                  className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/50 px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none focus:border-[#947dff] cursor-pointer"
                >
                  <option value="Groq">Groq AI</option>
                  <option value="Gemini">Google Gemini</option>
                  <option value="OpenAI">OpenAI</option>
                  <option value="Claude">Anthropic Claude</option>
                  <option value="OpenRouter">OpenRouter</option>
                  <option value="Local">Local (Ollama / LM Studio)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#c9c4d8]">Model:</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-[#111317] text-[#e2e2e6] border border-[#484555]/50 px-2.5 py-1.5 rounded-lg text-xs font-medium outline-none focus:border-[#947dff] cursor-pointer max-w-xs truncate"
                >
                  {providerModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleTestAiConnection}
              disabled={testingAi}
              className="px-3 py-1.5 rounded-lg bg-[#282a2d] hover:bg-[#333538] text-[#cabeff] border border-[#484555]/40 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Ping AI Provider and fetch live available model list"
            >
              <span className={`material-symbols-outlined text-[16px] ${testingAi ? 'animate-spin' : ''}`}>sync</span>
              {testingAi ? 'Pinging...' : 'Test AI & Fetch Models'}
            </button>
          </div>

          {aiTestResult && (
            <div className={`p-3 rounded-lg text-xs font-mono border ${
              aiTestResult.success 
                ? 'bg-[#4ae176]/10 text-[#4ae176] border-[#4ae176]/30' 
                : 'bg-red-500/10 text-red-300 border-red-500/30'
            }`}>
              {aiTestResult.message}
            </div>
          )}

          {/* Natural Language Prompt Input */}
          <div className="bg-[#1e2023] rounded-xl shadow-lg border border-[#333538] focus-within:border-[#947dff] focus-within:ring-1 focus-within:ring-[#947dff] transition-all p-1 w-full">
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full bg-transparent border-none outline-none resize-none min-h-[100px] p-4 text-[#e2e2e6] placeholder:text-[#938ea1] text-sm md:text-base font-sans"
                placeholder={`Ask anything about your ${activeDatabase?.name || 'database'} (${activeDatabase?.dialect || 'SQLite'})... e.g. 'Create table tasks' or 'Show all records'`}
              />
              <div className="p-3 pt-0 flex flex-wrap items-center justify-between gap-2 border-t border-[#333538]/50 mt-1">
                <div className="flex items-center text-[#c9c4d8] text-xs gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#cabeff]">bolt</span>
                  <span className="font-semibold text-[#e2e2e6]">{selectedProvider}:</span>
                  <span className="font-mono text-xs text-[#cabeff]">{selectedModel}</span>
                  {isCachedResponse && (
                    <span className="bg-[#4ae176]/20 text-[#4ae176] text-[10px] px-2 py-0.5 rounded font-mono border border-[#4ae176]/30">
                      ⚡ Redis Cached
                    </span>
                  )}
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

          {/* RECENT QUERY HISTORY PILLS */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-[#938ea1] font-medium">
              <span className="material-symbols-outlined text-[14px]">history</span>
              <span>Recent Query History:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {recentHistoryItems.length === 0 ? (
                <>
                  <button 
                    onClick={() => { setPromptText("Show all users limited to 30"); handleGenerate(); }}
                    className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#4ae176]">table_rows</span> Show users table
                  </button>
                  <button 
                    onClick={() => { setPromptText("Create table tasks with task_id, title, status"); handleGenerate(); }}
                    className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px] text-amber-300">add_circle</span> Create new table example
                  </button>
                </>
              ) : (
                recentHistoryItems.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => {
                      setPromptText(item.question);
                      setGeneratedSql(item.sql);
                      handleRunQuery(item.sql);
                    }}
                    className="px-3 py-1.5 rounded-full bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] text-xs border border-[#333538] flex items-center gap-1.5 transition-colors cursor-pointer max-w-xs truncate"
                    title={item.sql}
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#cabeff] flex-shrink-0">history</span>
                    <span className="truncate">{item.question || item.sql}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* OPERATIONAL SAFETY APPROVAL BANNER */}
          {pendingSafetyApproval && (
            <div className="bg-[#282a2d] border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[24px]">warning</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#e2e2e6]">Operational Safety Approval Required</h3>
                    <span className="bg-amber-500/20 text-amber-300 text-xs font-mono px-2 py-0.5 rounded border border-amber-500/30">
                      {pendingSafetyApproval.opType}
                    </span>
                  </div>
                  <p className="text-xs text-[#c9c4d8] mt-0.5">
                    This query modifies your database schema or records. Review the SQL query below and choose Accept or Reject.
                  </p>
                </div>
              </div>

              <div className="bg-[#111317] p-3 rounded-lg border border-[#333538] font-mono text-xs text-[#e2e2e6] overflow-x-auto">
                <code>{pendingSafetyApproval.sql}</code>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1 border-t border-[#333538]">
                <button
                  onClick={handleRejectMutation}
                  className="px-4 py-2 rounded-lg bg-[#1e2023] hover:bg-[#333538] text-red-400 border border-red-500/30 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span> Reject / Cancel
                </button>
                
                <button
                  onClick={handleAcceptMutation}
                  className="px-5 py-2 rounded-lg bg-[#4ae176] hover:bg-[#6bff8f] text-[#003915] font-bold text-xs shadow-lg shadow-[#4ae176]/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span> Accept & Execute Query
                </button>
              </div>
            </div>
          )}

          {/* Generated SQL Editor Box */}
          <div className="rounded-xl overflow-hidden shadow-2xl border border-[#333538] bg-[#0B0D10] w-full">
            <div className="flex flex-wrap items-center justify-between bg-[#333538] px-4 py-2 border-b border-[#484555]/30 gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#cabeff]">code</span>
                <span className="text-xs font-mono text-[#e2e2e6]">Executable {activeDatabase?.dialect || 'SQLite'} SQL</span>
              </div>

              {/* Action Buttons: Per-Model Thumbs Up / Down Counters */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button 
                  onClick={() => handleAiFeedbackAction('thumbs_up')}
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer font-mono text-xs flex items-center gap-1.5 ${
                    activeFeedbackType === 'thumbs_up' ? 'bg-[#4ae176]/20 text-[#4ae176] font-bold' : 'text-[#c9c4d8] hover:text-white hover:bg-[#484555]'
                  }`}
                  title={`Thumbs Up for ${selectedModel}`}
                >
                  <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                  <span>{currentModelRating.up}</span>
                </button>

                <button 
                  onClick={() => handleAiFeedbackAction('thumbs_down')}
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer font-mono text-xs flex items-center gap-1.5 ${
                    activeFeedbackType === 'thumbs_down' ? 'bg-red-500/20 text-red-400 font-bold' : 'text-[#c9c4d8] hover:text-white hover:bg-[#484555]'
                  }`}
                  title={`Thumbs Down for ${selectedModel}`}
                >
                  <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                  <span>{currentModelRating.down}</span>
                </button>

                <button
                  onClick={() => handleAiFeedbackAction('better_suggestion')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                    activeFeedbackType === 'better_suggestion' ? 'bg-[#947dff] text-[#2b0088] font-bold' : 'bg-[#111317] text-[#cabeff] hover:bg-[#947dff]/20 border border-[#947dff]/30'
                  }`}
                  title="Ask AI to suggest an optimized alternative query"
                >
                  <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                  <span>Better Suggestion</span>
                </button>

                <button
                  onClick={() => handleAiFeedbackAction('wrong_result')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                    activeFeedbackType === 'wrong_result' ? 'bg-amber-500 text-black font-bold' : 'bg-[#111317] text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
                  }`}
                  title="Report wrong results & ask AI to fix SQL query"
                >
                  <span className="material-symbols-outlined text-[15px]">warning</span>
                  <span>Wrong Result / Fix</span>
                </button>

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
                    Executing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span> Run Live Query
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Quality Testing & Interactive Re-generation Reply Overlay */}
          {(isAnalyzing || aiAnalysis) && (
            <div className="bg-[#1e2023] border border-[#947dff]/50 rounded-xl p-5 shadow-2xl space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-[#333538] pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#cabeff]">psychology</span>
                  <h3 className="text-sm font-bold text-[#e2e2e6]">
                    AI Response ({selectedProvider}: {selectedModel})
                  </h3>
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
                  <span>AI is evaluating SQL correctness and generating an improved query...</span>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-3 text-xs md:text-sm">
                  <p className="text-[#c9c4d8] leading-relaxed">{aiAnalysis.explanation}</p>

                  {aiAnalysis.optimizations?.length > 0 && (
                    <div className="bg-[#111317] p-3 rounded-lg border border-[#333538] space-y-1">
                      <div className="font-semibold text-xs text-[#cabeff] mb-1">AI Recommendations & Fixes:</div>
                      {aiAnalysis.optimizations.map((tip, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-[#c9c4d8]">
                          <span className="text-[#4ae176]">✓</span> {tip}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.suggestedSql && (
                    <div className="bg-[#0B0D10] p-4 rounded-xl border border-[#947dff]/40 space-y-3 shadow-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono text-[#cabeff] font-semibold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">auto_awesome</span> AI Re-generated Improved Query:
                        </span>
                        <button
                          onClick={() => {
                            setGeneratedSql(aiAnalysis.suggestedSql!);
                            handleRunQuery(aiAnalysis.suggestedSql!);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-[#947dff] text-[#2b0088] font-bold text-xs hover:bg-[#cabeff] transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span> Use & Execute This Query
                        </button>
                      </div>
                      <pre className="font-mono text-xs text-[#e2e2e6] overflow-x-auto p-3 bg-[#111317] rounded-lg border border-[#333538]">
                        <code>{aiAnalysis.suggestedSql}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* AI Explanation Insight */}
          {aiInsight && (
            <div className="bg-[#947dff]/10 border border-[#947dff]/20 rounded-xl p-4 flex gap-3 items-start">
              <span className="material-symbols-outlined text-[#cabeff] mt-0.5 text-[20px]">auto_awesome</span>
              <div>
                <h4 className="text-xs md:text-sm font-semibold text-[#e2e2e6] mb-1">AI Explanation</h4>
                <p className="text-xs md:text-sm text-[#c9c4d8] leading-relaxed">
                  {aiInsight}
                </p>
              </div>
            </div>
          )}

          {/* Execution Results Section with Row Numbers & Row Limit Controls */}
          {queryResults && (
            <div className="mt-2 mb-12 w-full">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-semibold text-[#e2e2e6]">Live Execution Results ({activeDatabase?.name || 'SQLite'})</h3>
                
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#c9c4d8] font-mono">
                  <div className="flex items-center gap-1.5 bg-[#1e2023] px-2.5 py-1 rounded-lg border border-[#333538]">
                    <span className="text-[#938ea1]">Show limit:</span>
                    <select
                      value={resultRowLimit}
                      onChange={(e) => setResultRowLimit(parseInt(e.target.value, 10))}
                      className="bg-transparent text-[#4ae176] font-bold outline-none cursor-pointer"
                    >
                      <option value={10} className="bg-[#111317] text-[#e2e2e6]">10 rows</option>
                      <option value={30} className="bg-[#111317] text-[#e2e2e6]">30 rows (Default)</option>
                      <option value={50} className="bg-[#111317] text-[#e2e2e6]">50 rows</option>
                      <option value={100} className="bg-[#111317] text-[#e2e2e6]">100 rows</option>
                      <option value={200} className="bg-[#111317] text-[#e2e2e6]">200 rows</option>
                      <option value={0} className="bg-[#111317] text-[#e2e2e6]">Unlimited</option>
                    </select>
                  </div>

                  <span className="bg-[#1e2023] px-2.5 py-1 rounded-lg border border-[#333538] text-[#4ae176]">
                    Showing {displayedRows.length} of {queryResults.rowCount} rows
                  </span>

                  <span className="bg-[#1e2023] px-2.5 py-1 rounded-lg border border-[#333538]">
                    Time: {queryResults.execTime}
                  </span>
                </div>
              </div>

              {queryResults.error ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-xs font-mono">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <span className="material-symbols-outlined text-[18px]">error</span> {activeDatabase?.dialect || 'SQL'} Execution Error
                  </div>
                  <div>{queryResults.error}</div>
                </div>
              ) : (
                <div className="bg-[#1e2023] rounded-xl overflow-x-auto border border-[#333538] shadow-lg w-full">
                  {queryResults.rows.length === 0 ? (
                    <div className="p-8 text-center text-[#c9c4d8] text-sm">
                      Query executed successfully on {activeDatabase?.name}, but returned 0 matching rows.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-[#282a2d] border-b border-[#333538] text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">
                          {/* Dedicated Row Number Header */}
                          <th className="p-3 font-mono text-center w-12 text-[#938ea1] border-r border-[#333538] bg-[#1a1c20]">#</th>
                          {queryResults.columns.map((col) => (
                            <th key={col} className="p-3 font-mono">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-xs md:text-sm text-[#e2e2e6] divide-y divide-[#333538]/60">
                        {displayedRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#282a2d] transition-colors font-mono">
                            {/* Row Number cell starting at 1 for data row 1 */}
                            <td className="p-3 font-mono text-center text-[#938ea1] text-xs border-r border-[#333538] bg-[#14161a] font-semibold">
                              {idx + 1}
                            </td>
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

      {/* Right Collapsible & RESIZABLE Panel: Table Inspector */}
      {showRightPanel && (
        <>
          {/* Mouse Drag Resizer Bar for Right Inspector Panel */}
          <div 
            onMouseDown={handleRightMouseDown}
            className="w-1.5 hover:w-2 bg-[#333538] hover:bg-[#947dff] cursor-col-resize h-full transition-all flex-shrink-0 z-30 flex items-center justify-center group"
            title="Drag mouse left/right to resize Table Inspector"
          >
            <div className="w-0.5 h-8 bg-[#666] group-hover:bg-white rounded"></div>
          </div>

          <aside 
            style={{ width: `${rightWidth}px` }}
            className="bg-[#1e2023] border-l border-[#333538] h-full flex flex-col z-20 shadow-xl flex-shrink-0 relative select-none"
          >
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
        </>
      )}

      {/* Add New Database Modal */}
      {showAddDbModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e2023] border border-[#333538] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#333538] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4ae176]">add_database</span>
                <h3 className="text-lg font-bold text-[#e2e2e6]">Connect Real Database</h3>
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
                  placeholder="e.g. Production PostgreSQL or Analytics MySQL" 
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff]" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">SQL Engine / Dialect</label>
                <select
                  value={newDbDialect}
                  onChange={(e) => {
                    const dialect = e.target.value as SqlDialect;
                    setNewDbDialect(dialect);
                    setNewDbConnString(DB_CONNECTION_EXAMPLES[dialect].example);
                  }}
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff] cursor-pointer"
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
                <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Connection String</label>
                <input 
                  type="text" 
                  value={newDbConnString}
                  onChange={(e) => setNewDbConnString(e.target.value)}
                  placeholder={DB_CONNECTION_EXAMPLES[newDbDialect].placeholder}
                  className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff] font-mono" 
                />
                
                <div className="mt-2 p-2.5 bg-[#111317] rounded-lg border border-[#333538] text-[11px] text-[#c9c4d8] space-y-1">
                  <div className="font-semibold text-[#cabeff] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    <span>{newDbDialect} Connection Format:</span>
                  </div>
                  <div className="font-mono text-[#4ae176] break-all">{DB_CONNECTION_EXAMPLES[newDbDialect].example}</div>
                  <div className="text-[#938ea1]">{DB_CONNECTION_EXAMPLES[newDbDialect].notes}</div>
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg text-xs font-mono border ${
                  testResult.success 
                    ? 'bg-[#4ae176]/10 text-[#4ae176] border-[#4ae176]/30' 
                    : 'bg-red-500/10 text-red-300 border-red-500/30'
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-[#333538]">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConn}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#282a2d] hover:bg-[#333538] text-[#cabeff] border border-[#484555]/40 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[16px] ${isTestingConn ? 'animate-spin' : ''}`}>sync</span>
                {isTestingConn ? 'Testing...' : 'Test Connection'}
              </button>

              <div className="flex gap-2">
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
        </div>
      )}

      {/* Rename Database Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e2023] border border-[#333538] rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#333538] pb-3">
              <h3 className="text-base font-bold text-[#e2e2e6]">Rename Database</h3>
              <button onClick={() => setShowRenameModal(false)} className="text-[#938ea1] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Database Name</label>
              <input 
                type="text" 
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff]" 
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowRenameModal(false)} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#282a2d] text-[#c9c4d8]">Cancel</button>
              <button onClick={handleConfirmRename} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#947dff] text-[#2b0088]">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
