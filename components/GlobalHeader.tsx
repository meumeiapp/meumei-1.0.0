
import React from 'react';
import { 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Building2,
  ExternalLink,
  Calculator,
  History,
  Sun,
  Moon
} from 'lucide-react';
import Logo from './Logo';
import { getInitial } from '../utils/stringUtils';
import useIsMobile from '../hooks/useIsMobile';
import MobileHeader from './MobileHeader';

interface GlobalHeaderProps {
  title?: string;
  subtitle?: string;
  companyName: string;
  username: string;
  viewDate: Date;
  onMonthChange: (increment: number) => void;
  canGoBack: boolean;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onOpenSettings: () => void;
  onOpenReports?: () => void;
  onLogout: () => void;
  onCompanyClick: () => void;
  onOpenCalculator: () => void;
  onOpenAudit: () => void;
  canAccessSettings: boolean;
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
  onLogout,
  onCompanyClick,
  onOpenCalculator,
  onOpenAudit,
  canAccessSettings
}) => {
  
  const isMobile = useIsMobile();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const safeMonthLabel = monthLabel || '';
  const capitalizedMonthLabel = safeMonthLabel
    ? `${getInitial(safeMonthLabel)}${safeMonthLabel.slice(1)}`
    : '?';
  const isDark = theme === 'dark';

  return (
    <div className="pwa-safe-top w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 rounded-b-[28px] md:rounded-b-[40px] sticky top-0 z-[999] shadow-2xl shadow-indigo-500/20 mb-8 md:mb-12 transition-all duration-300">
         {/* Background Pattern */}
         <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] rounded-b-[28px] md:rounded-b-[40px]"></div>
         
         <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-10 md:pt-6 md:pb-16 relative z-10">
             {isMobile ? (
                 <MobileHeader
                     companyName={companyName}
                     username={username}
                     theme={theme}
                     onThemeChange={onThemeChange}
                     onOpenSettings={onOpenSettings}
                     onOpenReports={onOpenReports}
                     onOpenAudit={onOpenAudit}
                     onOpenCalculator={onOpenCalculator}
                     onLogout={onLogout}
                     onCompanyClick={onCompanyClick}
                     canAccessSettings={canAccessSettings}
                 />
             ) : (
                 <div className="relative">
                     <div className="flex items-start md:items-center justify-between gap-3 md:gap-6">
                        <div className="flex items-center justify-start min-w-0 max-w-[45%] md:max-w-none">
                            <button 
                                onClick={onCompanyClick}
                                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/5 transition-all group max-w-full"
                                title="Ver dados da empresa"
                            >
                                <Building2 size={16} className="text-indigo-200 group-hover:text-white transition-colors shrink-0" />
                                <span className="text-xs md:text-sm font-semibold text-white tracking-wide truncate max-w-[180px] sm:max-w-[220px] md:max-w-[260px]">{companyName}</span>
                                <ExternalLink size={12} className="text-white/50 group-hover:text-white transition-colors ml-1 shrink-0" />
                            </button>
                        </div>

                        <div className="flex items-start justify-end min-w-0 max-w-[45%] md:max-w-none">
                            <div className="flex flex-col items-end gap-2 min-w-0">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <div className="flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md border border-white/5 p-1">
                                        <button
                                            onClick={() => onThemeChange('light')}
                                            aria-label="Ativar tema claro"
                                            className={`p-1.5 md:p-2 rounded-full transition-all ${
                                                isDark ? 'text-white/60 hover:text-white' : 'bg-white/90 text-zinc-900'
                                            }`}
                                            title="Tema claro"
                                        >
                                            <Sun size={16} />
                                        </button>
                                        <button
                                            onClick={() => onThemeChange('dark')}
                                            aria-label="Ativar tema escuro"
                                            className={`p-1.5 md:p-2 rounded-full transition-all ${
                                                isDark ? 'bg-white/90 text-zinc-900' : 'text-white/60 hover:text-white'
                                            }`}
                                            title="Tema escuro"
                                        >
                                            <Moon size={16} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={onOpenAudit}
                                        aria-label="Abrir auditoria"
                                        className="p-2 md:p-2.5 bg-white/10 hover:bg-white/20 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                        title="Auditoria do dia"
                                    >
                                        <History size={16} />
                                    </button>
                                    <button 
                                        onClick={onOpenCalculator}
                                        aria-label="Abrir calculadora"
                                        className="p-2 md:p-2.5 bg-white/10 hover:bg-white/20 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                        title="Calculadora"
                                    >
                                        <Calculator size={16} />
                                    </button>
                                    {canAccessSettings && (
                                        <button 
                                            onClick={onOpenSettings}
                                            aria-label="Abrir configurações"
                                            className="p-2 md:p-2.5 bg-white/10 hover:bg-white/20 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                            title="Configurações"
                                        >
                                            <Settings size={16} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={onLogout}
                                        aria-label="Sair da conta"
                                        className="p-2 md:p-2.5 bg-red-500/20 hover:bg-red-500/30 hover:scale-105 backdrop-blur-md rounded-xl text-white transition-all border border-white/5"
                                        title="Sair"
                                    >
                                        <LogOut size={16} />
                                    </button>
                                </div>
                                <p className="text-[11px] md:text-xs text-white/80 max-w-[180px] sm:max-w-[220px] md:max-w-[260px] truncate">
                                    {username}
                                </p>
                            </div>
                        </div>
                     </div>

                     <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <Logo size="3xl" className="text-white drop-shadow-lg sm:text-4xl md:text-5xl" />
                     </div>
                 </div>
             )}
         </div>

         {/* BOTTOM EDGE: Month Selector (Overlapping) */}
         <div id="month-selector-bar" className="absolute bottom-0 left-0 right-0 translate-y-1/2 z-20 w-full px-4">
            <div className="mx-auto w-full max-w-[320px] md:max-w-xs flex items-center justify-between bg-[#1a1a1a] dark:bg-black border border-white/10 dark:border-zinc-800 p-1 md:p-1.5 rounded-full shadow-2xl shadow-black/40">
                <button 
                    onClick={() => onMonthChange(-1)}
                    disabled={!canGoBack}
                    className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full transition-all ${!canGoBack ? 'text-zinc-600 cursor-not-allowed' : 'text-white hover:bg-zinc-800 active:scale-95'}`}
                >
                    <ChevronLeft size={18} />
                </button>
                
                <div className="flex flex-col items-center justify-center px-3 md:px-4">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest leading-none mb-0.5">Mês Atual</span>
                    <span className="text-xs md:text-sm font-bold text-white capitalize leading-none">
                        {capitalizedMonthLabel}
                    </span>
                </div>

                <button 
                    onClick={() => onMonthChange(1)}
                    className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full text-white hover:bg-zinc-800 active:scale-95 transition-all"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
         </div>
    </div>
  );
};

export default GlobalHeader;
