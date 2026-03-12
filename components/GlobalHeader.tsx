
import React, { useEffect, useRef, useState } from 'react';
import { 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Building2,
  Sun,
  Moon,
  Bot,
  Bug
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
  onOpenFeedback?: () => void;
  onOpenReports?: () => void;
  onOpenAgenda?: () => void;
  onLogout: () => void;
  onCompanyClick: () => void;
  onOpenCalculator: () => void;
  onOpenAudit: () => void;
  canAccessSettings: boolean;
  onOpenProfile?: () => void;
  userPhotoDataUrl?: string | null;
  versionLabel?: string;
  entitlementBadge?: {
    label: string;
  } | null;
  renewalInfo?: {
    label: string;
    dateLabel: string;
    daysLeft: number;
    ctaLabel?: string;
  } | null;
  onRenew?: () => void;
  assistantHidden?: boolean;
  onOpenAssistant?: () => void;
  bugNotificationCount?: number;
  isMasterUser?: boolean;
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
  onOpenFeedback,
  onOpenReports,
  onOpenAgenda,
  onLogout,
  onCompanyClick,
  onOpenCalculator,
  onOpenAudit,
  canAccessSettings,
  onOpenProfile,
  userPhotoDataUrl,
  summary,
  versionLabel,
  entitlementBadge,
  renewalInfo,
  onRenew,
  assistantHidden,
  onOpenAssistant,
  bugNotificationCount = 0,
  isMasterUser = false
}) => {
  
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const formatSystemTime = () =>
    new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  const [systemTimeLabel, setSystemTimeLabel] = useState<string>(formatSystemTime);
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const safeMonthLabel = monthLabel || '';
  const capitalizedMonthLabel = safeMonthLabel
    ? `${getInitial(safeMonthLabel)}${safeMonthLabel.slice(1)}`
    : '?';
  const mobileMonthLabel = capitalizedMonthLabel.replace(' de ', ' ');
  const isDark = theme === 'dark';
  const normalizedBugNotificationCount = Number.isFinite(bugNotificationCount)
    ? Math.max(0, Math.floor(bugNotificationCount))
    : 0;
  const hasBugNotification = normalizedBugNotificationCount > 0;
  const bugNotificationLabel =
    normalizedBugNotificationCount > 99 ? '99+' : String(normalizedBugNotificationCount);
  const handleOpenFeedback = onOpenFeedback || onOpenSettings;

  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof window === 'undefined') return;
    const root = document.documentElement;
    const updateHeaderHeight = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.round(rect.height);
      root.style.setProperty('--mm-header-height', `${height}px`);
      if (isMobile) {
        root.style.setProperty('--mm-mobile-top', `${height}px`);
      }
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

  useEffect(() => {
    const syncTime = () => setSystemTimeLabel(formatSystemTime());
    syncTime();
    const intervalId = window.setInterval(syncTime, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const headerMarginClass = isCompactHeight ? 'mb-2 md:mb-3' : 'mb-3 md:mb-4';
  const headerPaddingClass = isCompactHeight ? 'pt-1 pb-2 md:pt-1.5 md:pb-3' : 'pt-1.5 pb-3 md:pt-2 md:pb-4';
  const headerActionCardClass =
    'h-8 w-8 md:h-9 md:w-9 inline-flex items-center justify-center backdrop-blur-md rounded-xl text-white transition-all border border-white/5';
  const headerNeutralCardClass = `${headerActionCardClass} bg-white/10 hover:bg-white/20 hover:scale-105`;
  const companyTooltip = companyName ? `Dados da empresa: ${companyName}` : 'Dados da empresa';
  const profileTooltip = [username, versionLabel].filter(Boolean).join(' • ') || 'Perfil';

  const monthSelector = (
    <div id="month-selector-bar" className="w-full px-4 pt-1 pb-[5px]">
      <div className="mx-auto w-full max-w-[236px] flex items-center justify-between bg-[#1a1a1a]/90 border border-white/10 p-0.5 rounded-full shadow-lg shadow-black/40">
        <button
          onClick={() => onMonthChange(-1)}
          disabled={!canGoBack}
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${!canGoBack ? 'text-zinc-600 cursor-not-allowed' : 'text-white hover:bg-zinc-800 active:scale-95'}`}
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center justify-center px-1.5">
          <span className="inline-flex w-[146px] items-center justify-center h-5 rounded-full border border-white/10 bg-white/10 px-2.5 text-[10px] font-semibold text-white capitalize leading-none whitespace-nowrap">
            {mobileMonthLabel}
          </span>
        </div>

        <button
          onClick={() => onMonthChange(1)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-white hover:bg-zinc-800 active:scale-95 transition-all"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div
        ref={headerRef}
        data-mm-global-header="true"
        className="pwa-safe-top w-full bg-black/25 backdrop-blur-md border-b border-white/10 sticky top-0 z-[999]"
      >
        <div className="px-4 pt-2 pb-1">
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
                    onOpenProfile={onOpenProfile}
                    userPhotoDataUrl={userPhotoDataUrl}
                    versionLabel={versionLabel}
                    entitlementBadge={entitlementBadge}
                    renewalInfo={renewalInfo}
                    onRenew={onRenew}
          />
        </div>
        {monthSelector}
      </div>
    );
  }

  return (
    <div
      ref={headerRef}
      data-mm-global-header="true"
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
                     onOpenAudit={onOpenAudit}
                     onOpenCalculator={onOpenCalculator}
                     onLogout={onLogout}
                     onCompanyClick={onCompanyClick}
                     canAccessSettings={canAccessSettings}
                     onOpenProfile={onOpenProfile}
                     userPhotoDataUrl={userPhotoDataUrl}
                     versionLabel={versionLabel}
                 />
             ) : (
                 <div className="relative">
                        <div className="flex items-center justify-between gap-3 md:gap-4">
                        <div className="flex items-center justify-start min-w-0 max-w-[45%] md:max-w-none">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                                onClick={onCompanyClick}
                                className={`${headerNeutralCardClass} group`}
                                title={companyTooltip}
                                aria-label="Ver dados da empresa"
                            >
                                <Building2 size={15} className="text-indigo-200 group-hover:text-white transition-colors" />
                            </button>
                            <span
                                className="text-[10px] md:text-[11px] font-semibold text-white/90 truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px]"
                                title={companyName || 'Empresa'}
                            >
                                {companyName || 'Empresa'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end min-w-0 max-w-[45%] md:max-w-none">
                            <div className="flex items-center justify-end gap-2 min-w-0">
                                {assistantHidden && onOpenAssistant && (
                                    <button
                                        onClick={onOpenAssistant}
                                        aria-label="Abrir ajudante"
                                        className={headerNeutralCardClass}
                                        title="Ajudante"
                                    >
                                        <Bot size={15} />
                                    </button>
                                )}
                                <button
                                    onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
                                    aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
                                    className={headerNeutralCardClass}
                                    title={isDark ? 'Tema claro' : 'Tema escuro'}
                                >
                                    {isDark ? <Sun size={15} /> : <Moon size={15} />}
                                </button>
                                {canAccessSettings && (
                                    <button
                                        onClick={isMasterUser ? handleOpenFeedback : onOpenSettings}
                                        aria-label={isMasterUser ? 'Bugs e melhorias' : 'Reportar bug ou melhoria'}
                                        className={`relative ${headerNeutralCardClass}`}
                                        title={isMasterUser ? 'Bugs e melhorias' : 'Reportar bug ou melhoria'}
                                    >
                                        <Bug size={15} />
                                        {isMasterUser && hasBugNotification && (
                                            <span className="pointer-events-none absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-none font-bold flex items-center justify-center border border-red-300/80 shadow-md shadow-red-900/30">
                                                {bugNotificationLabel}
                                            </span>
                                        )}
                                    </button>
                                )}
                                {canAccessSettings && (
                                    <button
                                        onClick={onOpenSettings}
                                        aria-label="Abrir configurações"
                                        className={headerNeutralCardClass}
                                        title="Configurações"
                                    >
                                        <Settings size={15} />
                                    </button>
                                )}
                                <button
                                    onClick={onLogout}
                                    aria-label="Sair da conta"
                                    className={`${headerActionCardClass} bg-red-500/20 hover:bg-red-500/30 hover:scale-105`}
                                    title="Sair"
                                >
                                    <LogOut size={15} />
                                </button>
                                {onOpenProfile ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <button
                                            type="button"
                                            onClick={onOpenProfile}
                                            className={`${headerNeutralCardClass} group overflow-hidden`}
                                            title={profileTooltip}
                                        >
                                            {userPhotoDataUrl ? (
                                                <img src={userPhotoDataUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                                            ) : (
                                                <span className="text-[11px] font-semibold text-white">
                                                    {getInitial(username || '?')}
                                                </span>
                                            )}
                                        </button>
                                        <span
                                            className="text-[10px] md:text-[11px] font-semibold text-white/90 truncate max-w-[95px] sm:max-w-[120px] md:max-w-[150px]"
                                            title={profileTooltip}
                                        >
                                            {username || 'Usuário'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`${headerActionCardClass} bg-white/10`} title={profileTooltip}>
                                            <span className="text-[11px] font-semibold text-white">
                                                {getInitial(username || '?')}
                                            </span>
                                        </div>
                                        <span
                                            className="text-[10px] md:text-[11px] font-semibold text-white/90 truncate max-w-[95px] sm:max-w-[120px] md:max-w-[150px]"
                                            title={profileTooltip}
                                        >
                                            {username || 'Usuário'}
                                        </span>
                                    </div>
                                )}
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
         <div id="month-selector-bar" className="absolute bottom-0 left-0 right-0 translate-y-[76%] md:translate-y-[68%] z-20 w-full px-4">
            <div className="mx-auto w-full max-w-[286px] md:max-w-[304px] flex items-center justify-between bg-[#1a1a1a] dark:bg-black border border-white/10 dark:border-zinc-800 p-0.5 rounded-full shadow-2xl shadow-black/40">
                <button 
                    onClick={() => onMonthChange(-1)}
                    disabled={!canGoBack}
                    className={`w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-full transition-all ${!canGoBack ? 'text-zinc-600 cursor-not-allowed' : 'text-white hover:bg-zinc-800 active:scale-95'}`}
                >
                    <ChevronLeft size={14} />
                </button>
                
                <div className="flex items-center justify-center gap-1.5 px-1.5 md:px-2">
                    <span className="inline-flex items-center justify-center h-5 md:h-6 rounded-full border border-white/10 bg-zinc-900/70 px-2.5 md:px-3 text-[9px] md:text-[10px] font-semibold text-zinc-200 tabular-nums leading-none">
                        {systemTimeLabel}
                    </span>
                    <span className="inline-flex w-[112px] md:w-[132px] items-center justify-center h-5 md:h-6 rounded-full border border-white/10 bg-white/10 px-3 md:px-3.5 text-[10px] md:text-[11px] font-bold text-white capitalize leading-none whitespace-nowrap">
                        {mobileMonthLabel}
                    </span>
                </div>

                <button 
                    onClick={() => onMonthChange(1)}
                    className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-full text-white hover:bg-zinc-800 active:scale-95 transition-all"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
         </div>
    </div>
  );
};

export default GlobalHeader;
