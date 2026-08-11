import React, { useState } from 'react';
import { NavigationPath, QueryHistoryItem } from './types';
import { initialQueryHistory } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { QueryWorkspace } from './components/QueryWorkspace';
import { QueryHistoryView } from './components/QueryHistoryView';
import { DatabaseExplorerView } from './components/DatabaseExplorerView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [currentPath, setCurrentPath] = useState<NavigationPath>('query');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Real App Session state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(initialQueryHistory);

  const handleAddHistoryItem = (item: QueryHistoryItem) => {
    setQueryHistory(prev => [item, ...prev]);
  };

  const handleGlobalSearch = (query: string) => {
    if (query.trim().length > 0) {
      if (currentPath !== 'query-history') {
        setCurrentPath('query-history');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#111317] text-[#e2e2e6] font-sans antialiased selection:bg-[#947dff]/30 selection:text-[#cabeff]">
      {/* Navigation Sidebar */}
      <Sidebar 
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Top Header Bar */}
      <Header 
        onOpenMobileMenu={() => setIsMobileOpen(true)}
        onSearch={handleGlobalSearch}
      />

      {/* Main Content View Container */}
      <div className="pt-16 lg:pl-72 min-h-screen transition-all duration-300">
        {currentPath === 'query' && (
          <QueryWorkspace 
            dataSources={[]}
            onAddHistoryItem={handleAddHistoryItem}
          />
        )}

        {currentPath === 'query-history' && (
          <QueryHistoryView 
            historyItems={queryHistory}
            onNavigate={setCurrentPath}
          />
        )}

        {currentPath === 'database-explorer' && (
          <DatabaseExplorerView 
            dataSources={[]}
          />
        )}

        {currentPath === 'settings' && (
          <SettingsView />
        )}
      </div>
    </div>
  );
}
