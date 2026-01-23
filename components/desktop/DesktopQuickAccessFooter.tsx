import React from 'react';

interface QuickAccessItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  onClick: () => void;
  showWhen?: boolean;
}

interface DesktopQuickAccessFooterProps {
  items: QuickAccessItem[];
  versionLabel?: string;
}

const DesktopQuickAccessFooter: React.FC<DesktopQuickAccessFooterProps> = ({
  items,
  versionLabel = 'versão 1.0.0'
}) => {
  const visibleItems = items.filter(item => item.showWhen !== false);

  if (visibleItems.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60]">
      <div className="quick-access-shell relative w-full border-t border-white/10 bg-black/75 shadow-[0_-18px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col px-8 pb-3 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {visibleItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  (event.currentTarget as HTMLButtonElement).blur();
                  item.onClick();
                }}
                className="shrink-0 flex h-[88px] w-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
              >
                <div className="h-10 w-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="leading-tight text-center">{item.shortLabel || item.label}</span>
              </button>
            ))}
          </div>
          <div className="pt-2 text-center text-[10px] text-zinc-400">
            {versionLabel}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopQuickAccessFooter;
