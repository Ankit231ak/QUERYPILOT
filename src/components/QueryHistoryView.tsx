import React, { useState } from 'react';
import { QueryHistoryItem, NavigationPath } from '../types';

interface QueryHistoryViewProps {
  historyItems: QueryHistoryItem[];
  onNavigate: (path: NavigationPath) => void;
}

export const QueryHistoryView: React.FC<QueryHistoryViewProps> = ({ historyItems, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Success' | 'Warning' | 'Failed'>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = historyItems.filter((item) => {
    const matchesSearch = item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.sql.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCopy = (sql: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-screen flex flex-col gap-6">
      {/* Header & Search Bar Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#e2e2e6] mb-1">Query History</h1>
          <p className="text-sm md:text-base text-[#c9c4d8]">Review and search your past database interactions.</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-wrap items-center bg-[#1e2023] rounded-xl p-1.5 border border-[#333538] shadow-sm w-full md:w-auto">
          <div className="flex items-center px-3 gap-2 border-r border-[#333538] py-1 flex-1 md:flex-none">
            <span className="material-symbols-outlined text-[#c9c4d8] text-[20px]">search</span>
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search questions or SQL..."
              className="bg-transparent text-[#e2e2e6] text-xs md:text-sm w-full md:w-48 outline-none border-none placeholder:text-[#938ea1]"
            />
          </div>

          <div className="flex items-center px-1.5 gap-1 py-1">
            {(['All', 'Success', 'Warning', 'Failed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-[#333538] text-[#e2e2e6] font-semibold'
                    : 'text-[#c9c4d8] hover:bg-[#282a2d] hover:text-[#e2e2e6]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="bg-[#1e2023] border border-[#333538] rounded-xl shadow-md overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto w-full flex-1">
          <table className="w-full text-left whitespace-nowrap min-w-[700px]">
            <thead className="bg-[#282a2d] border-b border-[#333538]">
              <tr>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Question / Query</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Model</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Exec Time</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Rows</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#c9c4d8] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333538] text-xs md:text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#938ea1]">
                    No queries found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr 
                    key={item.id} 
                    onClick={() => onNavigate('query')}
                    className="hover:bg-[#282a2d] transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col max-w-[320px]">
                        <span className="text-[#e2e2e6] font-medium truncate">{item.question}</span>
                        <span className="font-mono text-[11px] text-[#938ea1] mt-0.5 truncate">{item.sql}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {item.status === 'Success' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#4ae176]/10 text-[#4ae176] font-mono text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4ae176]"></span> Success
                        </span>
                      )}
                      {item.status === 'Warning' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] font-mono text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]"></span> Warning
                        </span>
                      )}
                      {item.status === 'Failed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/20 text-[#ffb4ab] font-mono text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]"></span> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[#c9c4d8]">{item.model}</td>
                    <td className="px-6 py-4 font-mono text-[#e2e2e6]">{item.execTime}</td>
                    <td className="px-6 py-4 font-mono text-[#e2e2e6]">{item.rowsCount}</td>
                    <td className="px-6 py-4 text-[#c9c4d8]">{item.date}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={(e) => handleCopy(item.sql, item.id, e)}
                          className="p-1.5 text-[#c9c4d8] hover:text-[#cabeff] transition-colors opacity-0 group-hover:opacity-100 relative"
                          title="Copy SQL"
                        >
                          <span className="material-symbols-outlined text-[18px]">content_copy</span>
                          {copiedId === item.id && (
                            <span className="absolute -top-6 right-0 bg-[#333538] text-white text-[10px] px-1.5 py-0.5 rounded">Copied</span>
                          )}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onNavigate('query'); }}
                          className="p-1.5 text-[#c9c4d8] hover:text-[#cabeff] transition-colors opacity-0 group-hover:opacity-100"
                          title="Open in Workspace"
                        >
                          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#333538] bg-[#1a1c1f] flex items-center justify-between">
          <span className="text-xs text-[#c9c4d8]">Showing 1 to {filteredItems.length} of {historyItems.length} queries</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded-lg bg-[#333538] text-[#938ea1] text-xs cursor-not-allowed opacity-50" disabled>
              Previous
            </button>
            <button className="px-3 py-1 rounded-lg bg-[#333538] text-[#e2e2e6] hover:bg-[#484555] text-xs transition-colors cursor-pointer">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
