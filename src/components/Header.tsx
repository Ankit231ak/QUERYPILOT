import React, { useState } from 'react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onSearch?: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    if (onSearch) onSearch(e.target.value);
  };

  return (
    <header className="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-[#111317]/80 backdrop-blur-xl border-b border-[#484555]/30 z-40 flex items-center justify-between px-4 lg:px-6 gap-4">
      {/* Mobile Toggle & Brand indicator */}
      <div className="flex items-center gap-3 lg:hidden">
        <button 
          onClick={onOpenMobileMenu}
          className="p-1.5 rounded-lg bg-[#1e2023] text-[#e2e2e6] hover:bg-[#282a2d] transition-colors"
          title="Open Menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
        <span className="font-bold text-lg text-[#e2e2e6]">QueryPilot</span>
      </div>

      {/* Global Search Box */}
      <div className="hidden sm:flex items-center bg-[#1e2023] px-3 py-1.5 rounded-lg border border-[#484555]/40 w-72 md:w-96 focus-within:border-[#947dff] transition-all">
        <span className="material-symbols-outlined text-[#c9c4d8] text-[20px] mr-2">search</span>
        <input 
          type="text"
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Search queries, tables, or history..."
          className="bg-transparent border-none outline-none text-xs md:text-sm text-[#e2e2e6] w-full placeholder:text-[#938ea1]"
        />
        {searchValue && (
          <button 
            onClick={() => { setSearchValue(''); if (onSearch) onSearch(''); }}
            className="text-[#938ea1] hover:text-[#e2e2e6]"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto text-xs text-[#938ea1] font-mono">
        <span className="w-2 h-2 rounded-full bg-[#4ae176]"></span>
        <span>QueryPilot Engine</span>
      </div>
    </header>
  );
};
