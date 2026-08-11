import React, { useState, useEffect } from 'react';
import { NavigationPath, QueryHistoryItem, DatabaseConfig } from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { QueryWorkspace } from './components/QueryWorkspace';
import { QueryHistoryView } from './components/QueryHistoryView';
import { DatabaseExplorerView } from './components/DatabaseExplorerView';
import { SettingsView } from './components/SettingsView';

const DEFAULT_DATABASES: DatabaseConfig[] = [
  {
    id: 'db-sqlite-local',
    name: 'Main SQLite Database',
    dialect: 'SQLite',
    connectionString: 'sqlite:///querypilot.db',
    status: 'connected',
    isDefault: true
  }
];

export default function App() {
  const [currentPath, setCurrentPath] = useState<NavigationPath>('query');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Persistent Databases state
  const [databases, setDatabases] = useState<DatabaseConfig[]>(() => {
    try {
      const saved = localStorage.getItem('querypilot_databases');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load databases from localStorage:", e);
    }
    return DEFAULT_DATABASES;
  });

  const [activeDatabaseId, setActiveDatabaseId] = useState<string>(() => {
    return databases[0]?.id || 'db-sqlite-local';
  });

  // Persistent History state
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('querypilot_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load history from localStorage:", e);
    }
    return [];
  });

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('querypilot_history', JSON.stringify(queryHistory));
    } catch (e) {
      console.error("Failed to save history to localStorage:", e);
    }
  }, [queryHistory]);

  // Save databases to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('querypilot_databases', JSON.stringify(databases));
    } catch (e) {
      console.error("Failed to save databases to localStorage:", e);
    }
  }, [databases]);

  const handleAddHistoryItem = (item: QueryHistoryItem) => {
    setQueryHistory(prev => {
      const filtered = prev.filter(h => h.id !== item.id);
      return [item, ...filtered];
    });
  };

  const handleClearHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('querypilot_history');
  };

  const handleAddDatabase = (newDb: DatabaseConfig) => {
    setDatabases(prev => [...prev, newDb]);
    setActiveDatabaseId(newDb.id);
  };

  const handleRenameDatabase = (id: string, newName: string) => {
    setDatabases(prev => prev.map(db => db.id === id ? { ...db, name: newName } : db));
  };

  const handleDeleteDatabase = (id: string) => {
    if (databases.length <= 1) {
      alert("You must keep at least one database connection.");
      return;
    }
    const filtered = databases.filter(db => db.id !== id);
    setDatabases(filtered);
    if (activeDatabaseId === id) {
      setActiveDatabaseId(filtered[0].id);
    }
  };

  const handleGlobalSearch = (query: string) => {
    if (query.trim().length > 0) {
      if (currentPath !== 'query-history') {
        setCurrentPath('query-history');
      }
    }
  };

  const activeDatabase = databases.find(d => d.id === activeDatabaseId) || databases[0];

  return (
    <div className="min-h-screen bg-[#111317] text-[#e2e2e6] font-sans antialiased selection:bg-[#947dff]/30 selection:text-[#cabeff]">
      {/* Navigation Sidebar */}
      <Sidebar 
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        activeDatabase={activeDatabase}
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
            databases={databases}
            activeDatabase={activeDatabase}
            onSelectDatabase={(id) => setActiveDatabaseId(id)}
            onAddDatabase={handleAddDatabase}
            onRenameDatabase={handleRenameDatabase}
            onDeleteDatabase={handleDeleteDatabase}
            onAddHistoryItem={handleAddHistoryItem}
            queryHistory={queryHistory}
          />
        )}

        {currentPath === 'query-history' && (
          <QueryHistoryView 
            historyItems={queryHistory}
            onNavigate={setCurrentPath}
            onClearHistory={handleClearHistory}
          />
        )}

        {currentPath === 'database-explorer' && (
          <DatabaseExplorerView 
            databases={databases}
            activeDatabase={activeDatabase}
            onSelectDatabase={(id) => setActiveDatabaseId(id)}
            onAddDatabase={handleAddDatabase}
          />
        )}

        {currentPath === 'settings' && (
          <SettingsView />
        )}
      </div>
    </div>
  );
}
