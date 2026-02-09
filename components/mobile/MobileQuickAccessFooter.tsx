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
    <div className="mobile-quick-access-footer fixed bottom-0 left-0 right-0 z-[70] bg-transparent">
      <div className="quick-access-shell relative w-full border-t border-white/10 bg-black/70 shadow-[0_-6px_16px_rgba(0,0,0,0.35)] backdrop-blur-xl px-1.5 pb-[env(safe-area-inset-bottom)] pt-2">
        <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-black/50 to-transparent" />
        <div
          className="mobile-quick-access-scroll grid gap-1"
          style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
        >
          {visibleItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => {
                (event.currentTarget as HTMLButtonElement).blur();
                item.onClick();
              }}
              className="flex h-[60px] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] text-[8px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
            >
              <div className="h-6 w-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="leading-tight text-center">{item.shortLabel || item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileQuickAccessFooter;
