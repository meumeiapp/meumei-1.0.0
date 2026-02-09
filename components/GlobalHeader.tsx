
import React, { useEffect, useRef } from 'react';
import { 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Building2,
  ExternalLink,
  Sun,
  Moon
} from 'lucide-react';
import Logo from './Logo';
import { getInitial } from '../utils/stringUtils';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileHeader from './MobileHeader';

interface GlobalHeaderProps {
  title?: string;
  subtitle?: string;
  companyName: string;
  username: string;
  viewDate: Date;
  summary?: {
    income: number;
    expenses: number;
    available: number;
  };
  onMonthChange: (increment: number) => void;
  canGoBack: boolean;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onOpenSettings: () => void;
  onOpenReports?: () => void;
  onOpenAgenda?: () => void;
  onLogout: () => void;
  onCompanyClick: () => void;
  onOpenCalculator: () => void;
  onOpenAudit: () => void;
  canAccessSettings: boolean;
  versionLabel?: string;
}

const GlobalHeader: React.FC<GlobalHeaderProps> = ({ 
  companyName, 
  username, 
  viewDate, 
  onMonthChange, 
  canGoBack,
  theme,
  onThemeChange,
  onOpenSettings,
  onOpenReports,
  onOpenAgenda,
  onLogout,
  onCompanyClick,
  onOpenCalculator,
  onOpenAudit,
  canAccessSettings,
  summary,
  versionLabel
}) => {
  
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const safeMonthLabel = monthLabel || '';
  const capitalizedMonthLabel = safeMonthLabel
    ? `${getInitial(safeMonthLabel)}${safeMonthLabel.slice(1)}`
    : '?';
  const isDark = theme === 'dark';

  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof window === 'undefined') return;
    const root = document.documentElement;
    const updateHeaderHeight = () => {
      const rect = node.getBoundingClientRect();
      root.style.setProperty('--mm-header-height', `${Math.round(rect.height)}px`);
    };
    updateHeaderHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeaderHeight) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  const headerMarginClass = isCompactHeight ? 'mb-2 md:mb-3' : 'mb-3 md:mb-4';
  const headerPaddingClass = isCompactHeight ? 'pt-1 pb-2 md:pt-1.5 md:pb-3' : 'pt-1.5 pb-3 md:pt-2 md:pb-4';

  return (
    <div
      ref={headerRef}
      className={`pwa-safe-top w-full bg-gradient-to-r from-blue-600/80 via-indigo-600/80 to-pink-600/80 rounded-b-[18px] md:rounded-b-[20px] sticky top-0 z-[999] shadow-xl shadow-indigo-500/10 ${headerMarginClass} transition-all duration-300 backdrop-blur-xl`}
    >
         {/* Background Pattern */}
         <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] rounded-b-[18px] md:rounded-b-[20px]"></div>
         
         <div className={`max-w-7xl mx-auto px-4 sm:px-6 ${headerPaddingClass} relative z-10`}>
             {isMobile ? (
             <MobileHeader
                     companyName={companyName}
                     username={username}
                     theme={theme}
                     onThemeChange={onThemeChange}
                     onOpenSettings={onOpenSettings}
                     onOpenReports={onOpenReports}
                     onOpenAgenda={onOpenAgenda}
                     onOpenAudit={onOpenAudit}
                     onOpenCalculator={onOpenCalculator}
                     onLogout={onLogout}
                     onCompanyClick={onCompanyClick}
                     canAccessSettings={canAccessSettings}
                     versionLabel={versionLabel}
                 />
             ) : (
                 <div className="relative">
                        <div className="flex items-center justify-between gap-3 md:gap-4">
                        <div className="flex flex-col items-start justify-center gap-1 min-w-0 max-w-[45%] md:max-w-none">
                            <button 
                                onClick={onCompanyClick}
                                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-2.5 py-0.5 md:px-3 md:py-1 rounded-full border border-white/5 transition-all group max-w-full"
                                title="Ver dados da empresa"
                            >
                                <Building2 size={14} className="text-indigo-200 group-hover:text-white transition-colors shrink-0" />
                                <span className="text-[11px] md:text-xs font-semibold text-white tracking-wide truncate max-w-[180px] sm:max-w-[220px] md:max-w-[260px]">{companyName}</span>
                                <ExternalLink size={11} className="text-white/50 group-hover:text-white transition-colors ml-1 shrink-0" />
                            </button>
                            {versionLabel && (
                                <span className="text-[10px] text-white/60 leading-none">
                                    {versionLabel}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center justify-end min-w-0 max-w-[45%] md:max-w-none">
                            <div className="flex flex-col items-end gap-2 min-w-0">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                        onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
                                        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
                                        className="p-1.5 md:p-2 bg-white/10 hover:bg-white/20 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                        title={isDark ? 'Tema claro' : 'Tema escuro'}
                                    >
                                        {isDark ? <Sun size={15} /> : <Moon size={15} />}
                                    </button>
                                    {canAccessSettings && (
                                        <button 
                                            onClick={onOpenSettings}
                                            aria-label="Abrir configurações"
                                            className="p-1.5 md:p-2 bg-white/10 hover:bg-white/20 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                            title="Configurações"
                                        >
                                            <Settings size={15} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={onLogout}
                                        aria-label="Sair da conta"
                                        className="p-1.5 md:p-2 bg-red-500/20 hover:bg-red-500/30 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                        title="Sair"
                                    >
                                        <LogOut size={15} />
                                    </button>
                                </div>
                                <p className="text-[10px] md:text-[11px] text-white/80 max-w-[180px] sm:max-w-[220px] md:max-w-[260px] truncate">
                                    {username}
                                </p>
                            </div>
                        </div>
                     </div>

                     <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <Logo size="3xl" className="text-white drop-shadow-lg sm:text-3xl md:text-4xl" />
                     </div>
                 </div>
             )}

         </div>

         {/* BOTTOM EDGE: Month Selector (Overlapping) */}
         <div id="month-selector-bar" className="absolute bottom-0 left-0 right-0 translate-y-1/2 z-20 w-full px-4">
            <div className="mx-auto w-full max-w-[300px] md:max-w-[280px] flex items-center justify-between bg-[#1a1a1a] dark:bg-black border border-white/10 dark:border-zinc-800 p-0.5 md:p-1 rounded-full shadow-2xl shadow-black/40">
                <button 
                    onClick={() => onMonthChange(-1)}
                    disabled={!canGoBack}
                    className={`w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full transition-all ${!canGoBack ? 'text-zinc-600 cursor-not-allowed' : 'text-white hover:bg-zinc-800 active:scale-95'}`}
                >
                    <ChevronLeft size={18} />
                </button>
                
                <div className="flex flex-col items-center justify-center px-2 md:px-3">
                    <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest leading-none mb-0.5">Mês Atual</span>
                    <span className="text-[11px] md:text-xs font-bold text-white capitalize leading-none">
                        {capitalizedMonthLabel}
                    </span>
                </div>

                <button 
                    onClick={() => onMonthChange(1)}
                    className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full text-white hover:bg-zinc-800 active:scale-95 transition-all"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
         </div>
    </div>
  );
};

export default GlobalHeader;
