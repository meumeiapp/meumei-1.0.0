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

interface DesktopQuickAccessFooterProps {
  items: QuickAccessItem[];
  versionLabel?: string;
}

const DesktopQuickAccessFooter: React.FC<DesktopQuickAccessFooterProps> = ({
  items
}) => {
  const visibleItems = items.filter(item => item.showWhen !== false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shellRef.current) return;
    const node = shellRef.current;
    const root = document.documentElement;

    const updateDockHeight = () => {
      const rect = node.getBoundingClientRect();
      const rawHeight = Math.round(rect.height);
      const clampedHeight = Math.min(Math.max(rawHeight, 72), 120);
      root.style.setProperty('--mm-desktop-dock-height', `${clampedHeight}px`);
      if (barRef.current) {
        const barRect = barRef.current.getBoundingClientRect();
        root.style.setProperty('--mm-desktop-dock-width', `${Math.round(barRect.width)}px`);
        const barOffset = Math.round(window.innerHeight - barRect.top);
        root.style.setProperty('--mm-desktop-dock-bar-offset', `${barOffset}px`);
      }
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
    <div className="fixed bottom-0 left-0 right-0 z-[60]">
      <div className="quick-access-shell relative w-full bg-transparent" ref={shellRef}>
        <div className="mm-dock-inner mx-auto flex w-full max-w-7xl flex-col px-6 pb-2 pt-2">
          <div
            ref={barRef}
            className="flex w-full items-center justify-center gap-3 rounded-[26px] border border-white/20 bg-white/5 px-5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl dark:border-white/20 dark:bg-white/5"
          >
            {visibleItems.map(item => {
              const activeClass = item.isActive
                ? 'scale-[1.06] border-white/90 bg-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.6),0_18px_28px_rgba(0,0,0,0.55)]'
                : 'border-white/35 bg-transparent shadow-[0_8px_18px_rgba(0,0,0,0.35)]';
              return (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  (event.currentTarget as HTMLButtonElement).blur();
                  item.onClick();
                }}
                className={`group relative shrink-0 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border transition ${activeClass}`}
                aria-label={item.shortLabel || item.label}
                title={item.shortLabel || item.label}
              >
                <div className="h-16 w-16 rounded-xl bg-transparent flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="pointer-events-none absolute -top-6 whitespace-nowrap rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-md transition group-hover:opacity-100">
                  {item.shortLabel || item.label}
                </span>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopQuickAccessFooter;
