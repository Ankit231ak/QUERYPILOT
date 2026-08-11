import React from 'react';
import { NavigationPath } from '../types';

interface SidebarProps {
  currentPath: NavigationPath;
  onNavigate: (path: NavigationPath) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const logoUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuAPqmh4R-35VMvVyFT8C5QtyJt968YbRHcKH_lFJrPpiN_RNU2PXmtE5fwiDmxVYDuH7-_dnpfIzxHhmLR0yM0gRB6nHrn1z067Bpx7U3uqUrs6chNoV2EGOM7s8IxlesXJdWfpM2VlstSRLFfhZo-C_e-a6UX7FE3NZ9ttN7DkTc-ZH_1_jWdf9ukj9tgm1a4IhR3ZZW5yPoBuf9aZ9HEltZpLLYJJtUv6M2s-TiayNkN1yjrjoS08";

  const handleNavClick = (path: NavigationPath) => {
    onNavigate(path);
    if (onCloseMobile) onCloseMobile();
  };

  const navItemClass = (path: NavigationPath) => {
    const isActive = currentPath === path;
    if (isActive) {
      return "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all bg-[#333538] text-[#cabeff] font-semibold text-sm cursor-pointer shadow-sm border border-[#484555]/40";
    }
    return "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#c9c4d8] hover:bg-[#282a2d] hover:text-[#e2e2e6] transition-all text-sm cursor-pointer group";
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs" 
          onClick={onCloseMobile}
        />
      )}

      <aside className={`
        fixed left-0 top-0 h-full w-72 bg-[#0c0e11] border-r border-[#484555]/30 z-50 flex flex-col transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo Header */}
        <div className="p-4 flex items-center justify-between border-b border-[#484555]/30">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavClick('query')}>
            <img 
              src={logoUrl} 
              alt="QueryPilot Logo" 
              className="h-8 w-8 object-contain rounded-md"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="font-semibold text-xl text-[#e2e2e6] tracking-tight flex items-center gap-1.5 font-sans">
              QueryPilot
            </span>
          </div>
          {onCloseMobile && (
            <button 
              onClick={onCloseMobile} 
              className="lg:hidden text-[#c9c4d8] hover:text-white p-1"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
          {/* WORKSPACE */}
          <div className="px-3 py-1">
            <span className="text-[11px] font-semibold text-[#938ea1] uppercase tracking-widest">
              Workspace
            </span>
          </div>
          <a className={navItemClass('query')} onClick={() => handleNavClick('query')}>
            <span className="material-symbols-outlined text-[20px]">terminal</span>
            <span>Query Workspace</span>
          </a>
          <a className={navItemClass('database-explorer')} onClick={() => handleNavClick('database-explorer')}>
            <span className="material-symbols-outlined text-[20px]">database</span>
            <span>Database Explorer</span>
          </a>
          <a className={navItemClass('query-history')} onClick={() => handleNavClick('query-history')}>
            <span className="material-symbols-outlined text-[20px]">history</span>
            <span>Query History</span>
          </a>

          {/* SYSTEM */}
          <div className="px-3 py-1 mt-6">
            <span className="text-[11px] font-semibold text-[#938ea1] uppercase tracking-widest">
              System
            </span>
          </div>
          <a className={navItemClass('settings')} onClick={() => handleNavClick('settings')}>
            <span className="material-symbols-outlined text-[20px]">settings</span>
            <span>Settings</span>
          </a>
        </nav>

        {/* Footer Database Status */}
        <div className="p-4 space-y-2 border-t border-[#484555]/30 bg-[#0c0e11]">
          <div className="flex items-center justify-between text-[11px] text-[#c9c4d8]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4ae176] animate-pulse"></span>
              <span className="font-mono text-[11px]">SQLite Connected</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#c9c4d8]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#947dff]"></span>
              <span className="font-mono text-[11px]">Groq AI Engine</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
