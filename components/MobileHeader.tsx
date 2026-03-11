import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Menu, Settings, X } from 'lucide-react';
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
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
  companyName,
  username,
  onOpenSettings,
  onOpenAudit,
  onOpenCalculator,
  onLogout,
  canAccessSettings,
  versionLabel,
  entitlementBadge,
  renewalInfo,
  onRenew
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
            className="h-9 w-9 rounded-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Conta ativa</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{username}</p>
        </div>

        <div className="flex flex-col gap-2">
          {canAccessSettings && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onOpenSettings();
              }}
              className="mm-mobile-btn mm-mobile-btn-secondary flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
            >
              <span className="flex items-center gap-2">
                <Settings size={16} />
                Configurações
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onLogout();
            }}
            className="mm-mobile-btn mm-mobile-btn-danger flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/40 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <span className="flex items-center gap-2">
              <LogOut size={16} />
              Sair
            </span>
          </button>
          {versionLabel && (
            <div className="pt-2 text-center text-[10px] text-zinc-400">
              {versionLabel}
            </div>
          )}
          {entitlementBadge && (
            <div className="pt-2 text-center">
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                {entitlementBadge.label}
              </span>
            </div>
          )}
          {renewalInfo && (
            <div className="pt-2 text-center text-[10px] text-zinc-400 space-y-1">
              <div>
                {renewalInfo.label} {renewalInfo.dateLabel}
              </div>
              <div>Faltam {renewalInfo.daysLeft} dias</div>
              {onRenew && (
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onRenew();
                  }}
                  className="mx-auto mt-1 inline-flex items-center justify-center rounded-full border border-zinc-300/40 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-700"
                >
                  {renewalInfo.ctaLabel || 'Renovar'}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <div className="relative flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="h-9 w-9 rounded-[10px] bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center"
          title="Menu"
        >
          <Menu size={16} />
        </button>
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <Logo size="md" className="text-white drop-shadow-lg" />
        </div>
        <div className="h-9 min-w-[112px] flex items-center justify-end">
          <span className="text-[10px] font-semibold text-white/80 truncate max-w-[112px]">
            {companyName}
          </span>
        </div>
      </div>

      {isMenuOpen &&
        (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body))}
    </>
  );
};

export default MobileHeader;
