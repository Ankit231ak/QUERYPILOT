import React, { useState, useEffect } from 'react';
import { DatabaseConfig } from '../types';

interface DatabaseExplorerViewProps {
  databases: DatabaseConfig[];
  activeDatabase: DatabaseConfig;
  onSelectDatabase: (id: string) => void;
  onAddDatabase: (db: DatabaseConfig) => void;
}

interface TableSchemaItem {
  id: string;
  name: string;
  rowCount: string;
  columns: { name: string; type: string; isPk?: boolean; description?: string }[];
}

export const DatabaseExplorerView: React.FC<DatabaseExplorerViewProps> = ({
  databases,
  activeDatabase,
  onSelectDatabase
}) => {
  const [liveTables, setLiveTables] = useState<TableSchemaItem[]>([]);
  const [activeTableName, setActiveTableName] = useState('');
  const [activeTab, setActiveTab] = useState<'columns' | 'sample'>('columns');
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  
  // Sample data preview state
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [sampleCols, setSampleCols] = useState<string[]>([]);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  const fetchLiveSchema = () => {
    if (!activeDatabase) return;
    setIsLoadingSchema(true);
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
          setLiveTables(data.schema);
          if (data.schema.length > 0) {
            if (!activeTableName || !data.schema.some(t => t.name === activeTableName)) {
              setActiveTableName(data.schema[0].name);
            }
          }
        }
      })
      .catch(err => console.error("Failed to load schema:", err))
      .finally(() => setIsLoadingSchema(false));
  };

  useEffect(() => {
    fetchLiveSchema();
  }, [activeDatabase]);

  // Fetch sample data when switching to Sample Data tab or changing active table
  useEffect(() => {
    if (activeTab === 'sample' && activeTableName) {
      setIsLoadingSample(true);
      fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT * FROM "${activeTableName}" LIMIT 10;`,
          dialect: activeDatabase?.dialect || 'SQLite',
          connectionString: activeDatabase?.connectionString
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSampleCols(data.columns || []);
            setSampleRows(data.rows || []);
          }
        })
        .catch(err => console.error("Failed to fetch sample data:", err))
        .finally(() => setIsLoadingSample(false));
    }
  }, [activeTab, activeTableName, activeDatabase]);

  const activeTable = liveTables.find(t => t.name === activeTableName) || liveTables[0];

  const filteredTables = liveTables.filter(t => 
    t.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-screen flex flex-col gap-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#333538] pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#e2e2e6] mb-1">Database Explorer</h1>
          <p className="text-sm md:text-base text-[#c9c4d8]">Inspect live schemas, column types, and records across your databases.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Refresh Schema Button */}
          <button
            onClick={fetchLiveSchema}
            disabled={isLoadingSchema}
            className="px-3 py-1.5 rounded-lg bg-[#1e2023] hover:bg-[#282a2d] text-[#c9c4d8] border border-[#484555]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh database schema"
          >
            <span className={`material-symbols-outlined text-[16px] ${isLoadingSchema ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Refresh Schema</span>
          </button>

          {/* Database Selector Dropdown */}
          <div className="flex items-center bg-[#1e2023] border border-[#484555]/40 rounded-lg px-3 py-1.5 text-xs">
            <span className="material-symbols-outlined text-[18px] text-[#4ae176] mr-2">database</span>
            <select
              value={activeDatabase?.id}
              onChange={(e) => onSelectDatabase(e.target.value)}
              className="bg-transparent text-[#e2e2e6] outline-none font-semibold text-xs cursor-pointer"
            >
              {databases.map((db) => (
                <option key={db.id} value={db.id} className="bg-[#111317] text-[#e2e2e6]">
                  {db.name} ({db.dialect})
                </option>
              ))}
            </select>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4ae176]/10 text-[#4ae176] font-mono text-xs border border-[#4ae176]/20">
            <span className="w-2 h-2 rounded-full bg-[#4ae176] animate-pulse"></span> {activeDatabase?.dialect || 'SQLite'} Connected
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left List of Tables */}
        <div className="lg:col-span-4 bg-[#1e2023] border border-[#333538] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#938ea1] uppercase tracking-wider">
              Tables ({liveTables.length})
            </span>
            <button onClick={fetchLiveSchema} className="text-[10px] text-[#cabeff] hover:underline font-mono">
              Sync
            </button>
          </div>

          <div className="relative">
            <span className="material-symbols-outlined text-[#938ea1] text-[18px] absolute left-3 top-2.5">search</span>
            <input 
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search live tables..."
              className="w-full bg-[#111317] text-[#e2e2e6] pl-9 pr-3 py-2 rounded-lg text-xs border border-[#333538] outline-none focus:border-[#947dff]"
            />
          </div>

          {isLoadingSchema ? (
            <div className="text-xs text-[#c9c4d8] p-3 flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-[16px]">autorenew</span> Loading tables...
            </div>
          ) : (
            <div className="space-y-1 overflow-y-auto max-h-[500px]">
              {filteredTables.map((table) => {
                const isSelected = activeTableName === table.name;
                return (
                  <div
                    key={table.id}
                    onClick={() => setActiveTableName(table.name)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#333538] text-[#e2e2e6] border border-[#484555]/50' : 'hover:bg-[#282a2d] text-[#c9c4d8]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-[#cabeff]' : ''}`}>
                        table
                      </span>
                      <span className="text-sm font-semibold">{table.name}</span>
                    </div>
                    <span className="text-xs font-mono bg-[#111317] px-2 py-0.5 rounded text-[#4ae176]">
                      {table.rowCount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Table Detail Panel */}
        {activeTable ? (
          <div className="lg:col-span-8 bg-[#1e2023] border border-[#333538] rounded-xl p-6 flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#333538] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[24px] text-[#cabeff]">table</span>
                  <h2 className="text-xl font-bold text-[#e2e2e6]">{activeTable.name}</h2>
                  <span className="bg-[#333538] text-[#4ae176] text-xs font-mono px-2 py-0.5 rounded">
                    {activeTable.rowCount}
                  </span>
                </div>
                <p className="text-xs text-[#c9c4d8] mt-1">Live {activeDatabase?.dialect || 'SQLite'} database table schema.</p>
              </div>

              <div className="flex gap-2 bg-[#111317] p-1 rounded-lg border border-[#333538]">
                <button
                  onClick={() => setActiveTab('columns')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'columns' ? 'bg-[#333538] text-[#e2e2e6]' : 'text-[#c9c4d8] hover:text-[#e2e2e6]'
                  }`}
                >
                  Columns
                </button>
                <button
                  onClick={() => setActiveTab('sample')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'sample' ? 'bg-[#333538] text-[#e2e2e6]' : 'text-[#c9c4d8] hover:text-[#e2e2e6]'
                  }`}
                >
                  Sample Data
                </button>
              </div>
            </div>

            {activeTab === 'columns' ? (
              <div className="overflow-x-auto border border-[#333538] rounded-lg">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#282a2d] text-xs font-semibold text-[#938ea1] uppercase border-b border-[#333538]">
                      <th className="p-3">Column Name</th>
                      <th className="p-3">Data Type</th>
                      <th className="p-3">Keys</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333538] text-xs md:text-sm">
                    {activeTable.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-[#282a2d]">
                        <td className="p-3 font-mono font-medium text-[#e2e2e6]">{col.name}</td>
                        <td className="p-3 font-mono text-[#cabeff]">{col.type}</td>
                        <td className="p-3">
                          {col.isPk ? (
                            <span className="bg-[#947dff]/20 text-[#cabeff] font-bold text-[10px] px-2 py-0.5 rounded">Primary Key</span>
                          ) : (
                            <span className="text-[#938ea1] text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#333538] rounded-lg bg-[#111317] p-4">
                <p className="text-xs text-[#938ea1] mb-3">Live 10 sample records from <code className="text-[#cabeff]">{activeTable.name}</code>:</p>
                
                {isLoadingSample ? (
                  <div className="text-xs text-[#c9c4d8] p-4">Loading sample records...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-[#282a2d] border-b border-[#333538] text-[11px] font-semibold text-[#c9c4d8] uppercase">
                          {sampleCols.map(col => (
                            <th key={col} className="p-2.5 font-mono">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-[#333538]">
                        {sampleRows.map((row, i) => (
                          <tr key={i} className="hover:bg-[#282a2d] font-mono text-[#e2e2e6]">
                            {sampleCols.map(col => (
                              <td key={col} className="p-2.5">{String(row[col] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-8 text-xs text-[#c9c4d8]">Loading table information...</div>
        )}
      </div>
    </div>
  );
};
