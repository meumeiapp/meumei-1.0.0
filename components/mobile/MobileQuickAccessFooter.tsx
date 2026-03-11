import React, { useEffect, useRef } from 'react';

interface QuickAccessItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  onClick: () => void;
  showWhen?: boolean;
  isActive?: boolean;
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
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const node = shellRef.current;
    if (!node) return;

    const updateDockHeight = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.round(rect.height);
      document.documentElement.style.setProperty('--mm-mobile-dock-height', `${height}px`);
    };

    updateDockHeight();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateDockHeight) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateDockHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateDockHeight);
    };
  }, []);

  if (visibleItems.length === 0) return null;

  return (
    <div className="mobile-quick-access-footer fixed bottom-0 left-0 right-0 z-[3000] bg-black/70">
      <div
        ref={shellRef}
        className="quick-access-shell relative w-full border-t border-white/10 bg-transparent backdrop-blur-xl px-1.5 pb-[env(safe-area-inset-bottom)] pt-2"
      >
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
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('mm:mobile-dock-click'));
                }
                item.onClick();
              }}
              className={`flex h-[60px] w-full flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-semibold shadow-sm transition-all ${
                item.isActive
                  ? 'border-indigo-400/70 bg-gradient-to-b from-indigo-500/30 to-indigo-500/10 text-white shadow-[0_10px_24px_rgba(79,70,229,0.35)]'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] text-zinc-700 dark:text-zinc-200'
              }`}
            >
              <div
                className={`h-6 w-6 rounded-[10px] flex items-center justify-center transition-all ${
                  item.isActive
                    ? 'bg-indigo-500/30 ring-1 ring-indigo-300/60'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}
              >
                {item.icon}
              </div>
              <span className={`leading-tight text-center ${item.isActive ? 'text-white' : ''}`}>
                {item.shortLabel || item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileQuickAccessFooter;
