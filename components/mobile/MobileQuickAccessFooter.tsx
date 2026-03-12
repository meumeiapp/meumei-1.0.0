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
  const shouldUseGridLayout = visibleItems.length > 0 && visibleItems.length <= 6;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const browserInsetBottomRef = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const node = shellRef.current;
    if (!node) return;

    const updateDockHeight = () => {
      const rect = node.getBoundingClientRect();
      const shellHeight = Math.round(rect.height);
      const totalDockOffset = shellHeight + browserInsetBottomRef.current;
      document.documentElement.style.setProperty('--mm-mobile-dock-height', `${totalDockOffset}px`);
    };

    const updateBrowserInsetBottom = () => {
      if (typeof window === 'undefined') return;
      const viewport = window.visualViewport;
      if (!viewport) {
        browserInsetBottomRef.current = 0;
        document.documentElement.style.setProperty('--mm-mobile-browser-inset-bottom', '0px');
        updateDockHeight();
        return;
      }
      const visibleBottom = viewport.offsetTop + viewport.height;
      const browserInsetBottom = Math.max(0, Math.round(window.innerHeight - visibleBottom));
      browserInsetBottomRef.current = browserInsetBottom;
      document.documentElement.style.setProperty('--mm-mobile-browser-inset-bottom', `${browserInsetBottom}px`);
      updateDockHeight();
    };

    updateBrowserInsetBottom();
    updateDockHeight();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateDockHeight) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateBrowserInsetBottom);
    window.visualViewport?.addEventListener('resize', updateBrowserInsetBottom);
    window.visualViewport?.addEventListener('scroll', updateBrowserInsetBottom);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateBrowserInsetBottom);
      window.visualViewport?.removeEventListener('resize', updateBrowserInsetBottom);
      window.visualViewport?.removeEventListener('scroll', updateBrowserInsetBottom);
      document.documentElement.style.setProperty('--mm-mobile-browser-inset-bottom', '0px');
    };
  }, []);

  if (visibleItems.length === 0) return null;

  return (
    <div
      className="mobile-quick-access-footer fixed left-0 right-0 z-[3000] bg-black/70"
      style={{ bottom: 'var(--mm-mobile-browser-inset-bottom, 0px)' }}
    >
      <div
        ref={shellRef}
        className="quick-access-shell relative w-full border-t border-white/10 bg-transparent backdrop-blur-xl px-1.5 pb-[max(env(safe-area-inset-bottom),4px)] pt-2"
      >
        <div
          className={
            shouldUseGridLayout
              ? 'mobile-quick-access-grid grid items-stretch gap-1 pb-0.5'
              : 'mobile-quick-access-scroll flex items-stretch gap-1 overflow-x-auto pb-0.5'
          }
          style={
            shouldUseGridLayout
              ? { gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }
              : undefined
          }
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
              className={`flex ${shouldUseGridLayout ? 'h-[70px] min-w-0 w-full' : 'h-[72px] min-w-[84px] max-w-[94px] shrink-0'} flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-1 text-[10px] font-semibold shadow-sm transition-all ${
                item.isActive
                  ? 'border-indigo-400/70 bg-gradient-to-b from-indigo-500/30 to-indigo-500/10 text-white shadow-[0_10px_24px_rgba(79,70,229,0.35)]'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] text-zinc-700 dark:text-zinc-200'
              }`}
            >
              <div
                className={`h-5 w-5 rounded-[10px] flex items-center justify-center transition-all ${
                  item.isActive
                    ? 'bg-indigo-500/30 ring-1 ring-indigo-300/60'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}
              >
                {item.icon}
              </div>
              <span
                className={`block max-w-full px-1 text-center leading-[1.08] whitespace-normal break-normal ${
                  item.isActive ? 'text-white' : ''
                }`}
              >
                {shouldUseGridLayout ? (item.shortLabel || item.label) : item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileQuickAccessFooter;
