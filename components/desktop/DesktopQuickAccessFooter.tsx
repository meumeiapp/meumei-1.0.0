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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readViewportSize = () => {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  const viewport = window.visualViewport;
  return {
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight
  };
};

const computeDockScale = (width: number, height: number, itemCount: number) => {
  const safeItemCount = Math.max(itemCount, 1);
  const widthScale = clamp(width / 1760, 0.72, 1);
  const heightScale = clamp(height / 1020, 0.78, 1);
  const requiredWidth = safeItemCount * 72 + Math.max(0, safeItemCount - 1) * 12 + 40;
  const occupancyScale = clamp((width * 0.82) / requiredWidth, 0.72, 1);
  return clamp(Math.min(widthScale, heightScale, occupancyScale), 0.72, 1);
};

const DesktopQuickAccessFooter: React.FC<DesktopQuickAccessFooterProps> = ({
  items
}) => {
  const visibleItems = items.filter(item => item.showWhen !== false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dockScale, setDockScale] = useState<number>(() => {
    const { width, height } = readViewportSize();
    return computeDockScale(width, height, visibleItems.length);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateScale = () => {
      const { width, height } = readViewportSize();
      const nextScale = computeDockScale(width, height, visibleItems.length);
      setDockScale(prev => (Math.abs(prev - nextScale) > 0.004 ? nextScale : prev));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
    };
  }, [visibleItems.length]);

  const dockMetrics = useMemo(() => {
    const scaledPx = (base: number, min: number) =>
      `${Math.round(Math.max(min, base * dockScale))}px`;
    return {
      itemSize: scaledPx(72, 44),
      iconSize: scaledPx(64, 38),
      gap: scaledPx(12, 6),
      barPaddingX: scaledPx(20, 10),
      barPaddingY: scaledPx(8, 5),
      barRadius: scaledPx(26, 18),
      shellPaddingX: scaledPx(24, 8),
      shellPaddingTop: scaledPx(8, 4),
      shellPaddingBottom: '0px'
    };
  }, [dockScale]);

  const dockVars = useMemo<React.CSSProperties>(() => {
    return {
      '--mm-dock-item-size': dockMetrics.itemSize,
      '--mm-dock-icon-size': dockMetrics.iconSize,
      '--mm-dock-gap': dockMetrics.gap,
      '--mm-dock-bar-padding-x': dockMetrics.barPaddingX,
      '--mm-dock-bar-padding-y': dockMetrics.barPaddingY,
      '--mm-dock-bar-radius': dockMetrics.barRadius
    } as React.CSSProperties;
  }, [dockMetrics]);

  const shellStyle = useMemo<React.CSSProperties>(
    () => ({
      paddingLeft: dockMetrics.shellPaddingX,
      paddingRight: dockMetrics.shellPaddingX,
      paddingTop: dockMetrics.shellPaddingTop,
      paddingBottom: dockMetrics.shellPaddingBottom
    }),
    [dockMetrics]
  );

  useEffect(() => {
    if (!shellRef.current) return;
    const node = shellRef.current;
    const root = document.documentElement;

    const updateDockHeight = () => {
      const rect = node.getBoundingClientRect();
      const shellHeight = Math.max(Math.round(rect.height), 56);
      let occupiedHeight = shellHeight;

      if (barRef.current) {
        const barRect = barRef.current.getBoundingClientRect();
        root.style.setProperty('--mm-desktop-dock-width', `${Math.round(barRect.width)}px`);
        const barOffsetVisual = Math.max(Math.round(window.innerHeight - barRect.top), 56);
        const barOffset = Math.max(barOffsetVisual, 56);
        root.style.setProperty('--mm-desktop-dock-bar-offset', `${barOffset}px`);
        occupiedHeight = barOffset;
      }

      root.style.setProperty('--mm-dock-shell-height', `${shellHeight}px`);
      root.style.setProperty('--mm-desktop-dock-height', `${occupiedHeight}px`);
      root.style.setProperty('--mm-dock-height', `${occupiedHeight}px`);
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
    <div className="fixed bottom-0 left-0 right-0 z-[60]" data-mm-desktop-dock-shell="true" ref={shellRef}>
      <div className="quick-access-shell relative w-full bg-transparent">
        <div className="mx-auto w-full max-w-7xl" style={shellStyle}>
          <div
            ref={barRef}
            data-tour-anchor="desktop-dock"
            style={dockVars}
            className="mm-dock-bar flex w-full items-center justify-center border border-zinc-200/70 dark:border-zinc-800/70 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
          >
            {visibleItems.map(item => {
              const tourAnchor =
                item.id === 'accounts'
                  ? 'dashboard-dock-accounts'
                  : item.id === 'audit'
                    ? 'dashboard-dock-audit'
                    : undefined;
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
                data-dock-item-id={item.id}
                data-tour-anchor={tourAnchor}
                className={`mm-dock-button group relative shrink-0 flex items-center justify-center rounded-2xl border transition ${activeClass}`}
                style={{
                  width: 'var(--mm-dock-item-size)',
                  height: 'var(--mm-dock-item-size)'
                }}
                aria-label={item.shortLabel || item.label}
                title={item.shortLabel || item.label}
              >
                <div
                  className="mm-dock-icon rounded-xl bg-transparent flex items-center justify-center"
                  style={{
                    width: 'var(--mm-dock-icon-size)',
                    height: 'var(--mm-dock-icon-size)'
                  }}
                >
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
