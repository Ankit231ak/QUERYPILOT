import React from 'react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
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

      <div className="flex items-center gap-2 ml-auto text-xs text-[#938ea1] font-mono">
        <span className="w-2 h-2 rounded-full bg-[#4ae176]"></span>
        <span>QueryPilot Engine Active</span>
      </div>
    </header>
  );
};
