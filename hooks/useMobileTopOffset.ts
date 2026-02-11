import { useEffect, useRef } from 'react';
import useIsMobile from './useIsMobile';

const DEFAULT_OFFSET = 92;
const BASE_GAP = 16;

const useMobileTopOffset = () => {
  const isMobile = useIsMobile();
  const loggedRef = useRef(false);
  const lastAppliedRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (!isMobile) {
      document.documentElement.style.removeProperty('--mm-mobile-top');
      lastAppliedRef.current = null;
      return;
    }

    const getSafeTop = () => {
      const safeTopValue = getComputedStyle(document.documentElement)
        .getPropertyValue('--mm-safe-top')
        .trim();
      const parsed = Number.parseFloat(safeTopValue);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const updateOffset = () => {
      const header = document.querySelector('.pwa-safe-top') as HTMLElement | null;
      const monthBar = document.getElementById('month-selector-bar');
      const headerRect = header?.getBoundingClientRect();
      const monthRect = monthBar?.getBoundingClientRect();
      const headerBottom = headerRect?.bottom ?? 0;
      const monthBottom = monthRect?.bottom ?? 0;
      const safeTop = getSafeTop();
      const hasMonth = monthBottom > 0;
      const measuredBottom = hasMonth ? monthBottom : headerBottom;
      const source = hasMonth ? 'month' : 'header';
      const measuredPadding = Math.round(measuredBottom + safeTop);
      const appliedPadding = measuredPadding > 0 ? measuredPadding : DEFAULT_OFFSET;

      if (lastAppliedRef.current !== appliedPadding) {
        document.documentElement.style.setProperty('--mm-mobile-top', `${appliedPadding}px`);
        lastAppliedRef.current = appliedPadding;
      }

      if (!loggedRef.current) {
        console.info('[layout][mobile-offset]', {
          isMobile,
          headerHeight: Math.round(headerRect?.height ?? 0),
          monthBarHeight: Math.round(monthRect?.height ?? 0),
          safeTop: Math.round(safeTop),
          measuredBottom: Math.round(measuredBottom),
          headerBottom: Math.round(headerBottom),
          monthBottom: Math.round(monthBottom),
          source,
          appliedPadding,
          baseGap: BASE_GAP
        });
        loggedRef.current = true;
      }
    };

    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateOffset();
      });
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;

    const attachObservers = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      const header = document.querySelector('.pwa-safe-top');
      const monthBar = document.getElementById('month-selector-bar');
      if (header) resizeObserver.observe(header);
      if (monthBar) resizeObserver.observe(monthBar);
    };

    updateOffset();
    attachObservers();

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            attachObservers();
            scheduleUpdate();
          })
        : null;

    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [isMobile]);
};

export default useMobileTopOffset;
