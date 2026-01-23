import React from 'react';

interface QuickAccessItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  onClick: () => void;
  showWhen?: boolean;
}

interface MobileQuickAccessFooterProps {
  items: QuickAccessItem[];
  versionLabel?: string;
}

const MobileQuickAccessFooter: React.FC<MobileQuickAccessFooterProps> = ({
  items,
  versionLabel = 'versão 1.0.0'
}) => {
  const visibleItems = items.filter(item => item.showWhen !== false);

  if (visibleItems.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70]">
      <div className="quick-access-shell relative w-full border-t border-white/10 bg-black/75 shadow-[0_-18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl px-3 pb-[env(safe-area-inset-bottom)] pt-2">
        <div className="mobile-quick-access-scroll flex items-center gap-2 overflow-x-auto">
          {visibleItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => {
                (event.currentTarget as HTMLButtonElement).blur();
                item.onClick();
              }}
              className="shrink-0 flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] text-[9px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
            >
              <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="leading-tight text-center">{item.shortLabel || item.label}</span>
            </button>
          ))}
        </div>
        <div className="pt-2 text-center text-[10px] text-zinc-500 dark:text-zinc-400">
          {versionLabel}
        </div>
      </div>
    </div>
  );
};

export default MobileQuickAccessFooter;
