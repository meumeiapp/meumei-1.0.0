import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  const [dockDensity, setDockDensity] = useState<'default' | 'compact' | 'tight'>(() => {
    if (typeof window === 'undefined') return 'default';
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    if (height <= 820 || width <= 1280) return 'tight';
    if (height <= 900 || width <= 1366) return 'compact';
    return 'default';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateDensity = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      if (height <= 820 || width <= 1280) {
        setDockDensity('tight');
        return;
      }
      if (height <= 900 || width <= 1366) {
        setDockDensity('compact');
        return;
      }
      setDockDensity('default');
    };
    updateDensity();
    window.addEventListener('resize', updateDensity);
    window.visualViewport?.addEventListener('resize', updateDensity);
    return () => {
      window.removeEventListener('resize', updateDensity);
      window.visualViewport?.removeEventListener('resize', updateDensity);
    };
  }, []);

  const dockVars = useMemo<React.CSSProperties>(() => {
    if (dockDensity === 'tight') {
      return {
        '--mm-dock-item-size': '56px',
        '--mm-dock-icon-size': '48px',
        '--mm-dock-gap': '8px',
        '--mm-dock-bar-padding-x': '12px',
        '--mm-dock-bar-padding-y': '6px',
        '--mm-dock-bar-radius': '22px',
        '--mm-dock-outer-px': '12px',
        '--mm-dock-outer-pt': '6px',
        '--mm-dock-outer-pb': '6px'
      } as React.CSSProperties;
    }
    if (dockDensity === 'compact') {
      return {
        '--mm-dock-item-size': '62px',
        '--mm-dock-icon-size': '54px',
        '--mm-dock-gap': '10px',
        '--mm-dock-bar-padding-x': '16px',
        '--mm-dock-bar-padding-y': '7px',
        '--mm-dock-bar-radius': '24px',
        '--mm-dock-outer-px': '16px',
        '--mm-dock-outer-pt': '8px',
        '--mm-dock-outer-pb': '8px'
      } as React.CSSProperties;
    }
    return {
      '--mm-dock-item-size': '72px',
      '--mm-dock-icon-size': '64px',
      '--mm-dock-gap': '12px',
      '--mm-dock-bar-padding-x': '20px',
      '--mm-dock-bar-padding-y': '8px',
      '--mm-dock-bar-radius': '26px',
      '--mm-dock-outer-px': '24px',
      '--mm-dock-outer-pt': '8px',
      '--mm-dock-outer-pb': '8px'
    } as React.CSSProperties;
  }, [dockDensity]);

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
        <div className="mm-dock-inner mx-auto flex w-full max-w-7xl flex-col px-6 pb-2 pt-2" style={dockVars}>
          <div
            ref={barRef}
            className="mm-dock-bar flex w-full items-center justify-center border border-white/20 bg-white/5 shadow-[0_10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl dark:border-white/20 dark:bg-white/5"
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
                className={`mm-dock-button group relative shrink-0 flex items-center justify-center rounded-2xl border transition ${activeClass}`}
                aria-label={item.shortLabel || item.label}
                title={item.shortLabel || item.label}
              >
                <div className="mm-dock-icon h-16 w-16 rounded-xl bg-transparent flex items-center justify-center">
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
