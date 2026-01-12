import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Calculator,
  History,
  LogOut,
  Menu,
  Settings,
  Sun,
  Moon,
  X
} from 'lucide-react';
import Logo from './Logo';

interface MobileHeaderProps {
  companyName: string;
  username: string;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onOpenSettings: () => void;
  onOpenReports?: () => void;
  onOpenAudit: () => void;
  onOpenCalculator: () => void;
  onLogout: () => void;
  onCompanyClick: () => void;
  canAccessSettings: boolean;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
  companyName,
  username,
  theme,
  onThemeChange,
  onOpenSettings,
  onOpenReports,
  onOpenAudit,
  onOpenCalculator,
  onLogout,
  onCompanyClick,
  canAccessSettings
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDark = theme === 'dark';

  const setMenuOpen = (open: boolean) => {
    setIsMenuOpen(open);
    console.info('[mobile-drawer] open', { open });
  };
  const closeMenu = () => setMenuOpen(false);

  const drawer = (
    <div className="fixed inset-0 z-[1200]">
      <button
        type="button"
        onClick={closeMenu}
        className="absolute inset-0 z-[1200] bg-black/40 backdrop-blur-sm"
        aria-label="Fechar menu"
      />
      <aside className="absolute right-0 top-0 z-[1210] h-full w-[86%] max-w-[320px] bg-white dark:bg-[#0f0f12] text-zinc-900 dark:text-white shadow-2xl p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Logo size="lg" className="text-zinc-900 dark:text-white" />
          <button
            type="button"
            onClick={closeMenu}
            aria-label="Fechar menu"
            className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Conta ativa</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{username}</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Tema</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                isDark
                  ? 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-300'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
              }`}
            >
              <Sun size={16} />
              Claro
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                isDark
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-300'
              }`}
            >
              <Moon size={16} />
              Escuro
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {canAccessSettings && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onOpenSettings();
              }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
            >
              <span className="flex items-center gap-2">
                <Settings size={16} />
                Configurações
              </span>
            </button>
          )}
          {onOpenReports && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onOpenReports();
              }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
            >
              <span className="flex items-center gap-2">
                <BarChart3 size={16} />
                Relatórios
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onOpenAudit();
            }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
          >
            <span className="flex items-center gap-2">
              <History size={16} />
              Auditoria do dia
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onOpenCalculator();
            }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
          >
            <span className="flex items-center gap-2">
              <Calculator size={16} />
              Calculadora
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onLogout();
            }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 dark:border-red-900/40 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <span className="flex items-center gap-2">
              <LogOut size={16} />
              Sair
            </span>
          </button>
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <div className="relative">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center"
            title="Menu"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1 flex items-center justify-center pointer-events-none">
            <Logo size="xl" className="text-white drop-shadow-lg" />
          </div>
          <div className="h-10 w-10" />
        </div>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onCompanyClick}
            className="max-w-full px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-[11px] font-semibold text-white/90 truncate"
            title="Ver dados da empresa"
          >
            {companyName}
          </button>
        </div>
      </div>

      {isMenuOpen &&
        (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body))}
    </>
  );
};

export default MobileHeader;
