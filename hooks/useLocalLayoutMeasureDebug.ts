import { useEffect } from 'react';

const DEBUG_BODY_CLASS = 'mm-local-layout-measure-enabled';
const MARK_ATTR = 'data-mm-layout-measure';
const SIZE_ATTR = 'data-mm-layout-size';
const DETAIL_ATTR = 'data-mm-layout-detail';
const OVERLAY_LAYER_ID = 'mm-layout-measure-overlay-layer';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalhost = () => {
  if (typeof window === 'undefined') return false;
  return LOCAL_HOSTS.has(window.location.hostname);
};

const isVisibleElement = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getLabel = (element: HTMLElement) => {
  const explicit = element.getAttribute('data-mm-measure-target');
  if (explicit) return explicit;
  const dashboardBlock = element.getAttribute('data-dashboard-block');
  if (dashboardBlock) return `dashboard:${dashboardBlock}`;
  const screen = element.getAttribute('data-tour-screen');
  if (screen) return `tela:${screen}`;
  if (element.classList.contains('mm-map-surface')) return 'mapa';
  const closestScreen = element.closest<HTMLElement>('[data-tour-screen]');
  if (closestScreen?.dataset.tourScreen) return `bloco:${closestScreen.dataset.tourScreen}`;
  return 'bloco';
};

const shouldMeasure = (element: HTMLElement) => {
  if (!isVisibleElement(element)) return false;
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 120 || height < 48) return false;
  const isScreenRoot = element.hasAttribute('data-tour-screen');
  if (
    !isScreenRoot &&
    width > Math.round(window.innerWidth * 0.99) &&
    height > Math.round(window.innerHeight * 0.99)
  ) {
    return false;
  }
  return true;
};

type OverlayItem = {
  label: string;
  size: string;
  detail: string;
  left: number;
  top: number;
  width: number;
  height: number;
  negativeDockGap: boolean;
};

const ensureOverlayLayer = () => {
  let layer = document.getElementById(OVERLAY_LAYER_ID) as HTMLDivElement | null;
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = OVERLAY_LAYER_ID;
  layer.style.position = 'fixed';
  layer.style.inset = '0';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '2147483646';
  layer.style.overflow = 'hidden';
  document.body.appendChild(layer);
  return layer;
};

const renderOverlayLayer = (items: OverlayItem[]) => {
  const layer = ensureOverlayLayer();
  layer.innerHTML = '';

  items.forEach((item) => {
    const box = document.createElement('div');
    box.style.position = 'fixed';
    box.style.left = `${item.left}px`;
    box.style.top = `${item.top}px`;
    box.style.width = `${item.width}px`;
    box.style.height = `${item.height}px`;
    box.style.boxSizing = 'border-box';
    box.style.border = `1.5px dashed ${item.negativeDockGap ? 'rgba(251,113,133,0.95)' : 'rgba(56,189,248,0.95)'}`;
    box.style.borderRadius = '6px';
    box.style.background = 'transparent';

    const label = document.createElement('div');
    label.textContent = `${item.label} | ${item.size} | ${item.detail}`;
    label.style.position = 'absolute';
    label.style.top = '4px';
    label.style.left = '4px';
    label.style.maxWidth = 'calc(100% - 8px)';
    label.style.padding = '3px 6px';
    label.style.borderRadius = '8px';
    label.style.fontSize = '10px';
    label.style.fontWeight = '700';
    label.style.lineHeight = '1.2';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.border = `1px solid ${item.negativeDockGap ? 'rgba(251,113,133,0.9)' : 'rgba(34,211,238,0.7)'}`;
    label.style.color = item.negativeDockGap ? 'rgb(254,205,211)' : 'rgb(186,230,253)';
    label.style.background = 'rgba(8, 15, 30, 0.92)';

    box.appendChild(label);
    layer.appendChild(box);
  });
};

const applyMeasurements = () => {
  const selectors = [
    '[data-tour-screen]',
    '.mm-map-surface',
    '[data-dashboard-block]',
    '[data-mm-measure-target]'
  ];
  const nodes = new Set<HTMLElement>();
  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => nodes.add(node));
  });

  const measured = new Set<HTMLElement>();
  const desktopDockBar = document.querySelector<HTMLElement>('.mm-dock-bar');
  const desktopDockShell = document.querySelector<HTMLElement>('[data-mm-desktop-dock-shell="true"]');
  const mobileDock = document.querySelector<HTMLElement>('.mobile-quick-access-footer');
  const dockTop = Math.round(
    (desktopDockBar || desktopDockShell || mobileDock)?.getBoundingClientRect().top || window.innerHeight
  );
  const overlays: OverlayItem[] = [];

  nodes.forEach((node) => {
    if (!shouldMeasure(node)) return;
    const rect = node.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const top = Math.round(rect.top);
    const bottom = Math.round(rect.bottom);
    const gapDock = Math.round(dockTop - rect.bottom);
    const label = getLabel(node);
    const size = `${width}×${height}`;
    const detail = `y:${top}-${bottom} dock:${gapDock}px`;
    node.setAttribute(MARK_ATTR, label);
    node.setAttribute(SIZE_ATTR, size);
    node.setAttribute(DETAIL_ATTR, detail);
    overlays.push({
      label,
      size,
      detail,
      left: Math.round(rect.left),
      top,
      width,
      height,
      negativeDockGap: gapDock < 0
    });
    measured.add(node);
  });

  document.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`).forEach((node) => {
    if (measured.has(node)) return;
    node.removeAttribute(MARK_ATTR);
    node.removeAttribute(SIZE_ATTR);
    node.removeAttribute(DETAIL_ATTR);
  });

  renderOverlayLayer(overlays);
};

const clearMeasurements = () => {
  document.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`).forEach((node) => {
    node.removeAttribute(MARK_ATTR);
    node.removeAttribute(SIZE_ATTR);
    node.removeAttribute(DETAIL_ATTR);
  });
  const layer = document.getElementById(OVERLAY_LAYER_ID);
  if (layer) layer.remove();
};

const useLocalLayoutMeasureDebug = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!isLocalhost()) return;

    document.body.classList.add(DEBUG_BODY_CLASS);
    let rafId: number | null = null;

    const scheduleApply = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyMeasurements();
      });
    };

    const observer = new MutationObserver(() => {
      scheduleApply();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    window.addEventListener('resize', scheduleApply);
    window.addEventListener('orientationchange', scheduleApply);
    window.addEventListener('scroll', scheduleApply, true);
    document.addEventListener('visibilitychange', scheduleApply);

    scheduleApply();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleApply);
      window.removeEventListener('orientationchange', scheduleApply);
      window.removeEventListener('scroll', scheduleApply, true);
      document.removeEventListener('visibilitychange', scheduleApply);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.classList.remove(DEBUG_BODY_CLASS);
      clearMeasurements();
    };
  }, []);
};

export default useLocalLayoutMeasureDebug;
