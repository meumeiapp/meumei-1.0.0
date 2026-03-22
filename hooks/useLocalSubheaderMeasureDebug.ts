import { useEffect } from 'react';

const DEBUG_BODY_CLASS = 'mm-local-subheader-measure-enabled';
const MARK_ATTR = 'data-mm-subheader-measure';
const SIZE_ATTR = 'data-mm-subheader-size';
const DETAIL_ATTR = 'data-mm-subheader-detail';
const ITEM_VALUE = 'item';
const ROOT_VALUE = 'root';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalhost = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith('.local');
};

const isVisibleElement = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getVisibleChildren = (element: HTMLElement) =>
  Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter(isVisibleElement);

const unwrapSubheaderRoot = (subheader: HTMLElement) => {
  let node: HTMLElement = subheader;
  for (let i = 0; i < 4; i += 1) {
    const children = getVisibleChildren(node);
    if (children.length !== 1) break;
    const onlyChild = children[0];
    if (onlyChild.matches('button, a, input, select, textarea')) break;
    node = onlyChild;
  }
  return node;
};

const shouldExpandContainer = (container: HTMLElement) => {
  const children = getVisibleChildren(container);
  if (children.length < 2 || children.length > 12) return false;
  const display = window.getComputedStyle(container).display;
  return (
    container.classList.contains('mm-header-actions') ||
    display.includes('grid') ||
    display.includes('flex')
  );
};

const isReasonableMeasureTarget = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 42 || height < 24) return false;
  if (width > Math.round(window.innerWidth * 0.96) && height > 120) return false;
  return true;
};

const parsePx = (raw: string) => {
  const value = Number.parseFloat(raw || '');
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
};

const compactNumber = (value: number | null) => {
  if (value === null) return '--';
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
};

const readFontMetrics = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const fontSize = parsePx(style.fontSize);
  const lineHeight = parsePx(style.lineHeight);
  const fontWeightRaw = Number.parseInt(style.fontWeight || '400', 10);
  const fontWeight = Number.isFinite(fontWeightRaw) ? fontWeightRaw : 400;
  return {
    fontSize,
    lineHeight,
    fontWeight
  };
};

const findNumberMetrics = (element: HTMLElement) => {
  const targets = new Set<HTMLElement>();
  if (/\d/.test(element.textContent || '')) {
    targets.add(element);
  }

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        /\d/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  );

  let seen = 0;
  while (seen < 120) {
    const current = walker.nextNode();
    if (!current) break;
    seen += 1;
    const parent = (current as Text).parentElement;
    if (!parent || !isVisibleElement(parent)) continue;
    targets.add(parent);
  }

  let chosen: { fontSize: number | null; lineHeight: number | null; fontWeight: number } | null = null;
  targets.forEach((target) => {
    const metrics = readFontMetrics(target);
    if (!chosen) {
      chosen = metrics;
      return;
    }
    const chosenSize = chosen.fontSize ?? 0;
    const targetSize = metrics.fontSize ?? 0;
    if (targetSize > chosenSize) {
      chosen = metrics;
    }
  });

  return chosen;
};

const buildDetailLabel = ({
  width,
  height,
  verticalOffset,
  fontSize,
  lineHeight,
  fontWeight,
  numberMetrics
}: {
  width: number;
  height: number;
  verticalOffset: number;
  fontSize: number | null;
  lineHeight: number | null;
  fontWeight: number;
  numberMetrics: { fontSize: number | null; lineHeight: number | null; fontWeight: number } | null;
}) => {
  const base = `w${width} h${height} y${verticalOffset}`;
  const font = `f${compactNumber(fontSize)}/${compactNumber(lineHeight)}/${fontWeight}`;
  const num = numberMetrics
    ? `n${compactNumber(numberMetrics.fontSize)}/${compactNumber(numberMetrics.lineHeight)}/${numberMetrics.fontWeight}`
    : 'n--';
  return `${base} | ${font} | ${num}`;
};

const applyMeasurements = () => {
  const subheaders = Array.from(document.querySelectorAll<HTMLElement>('.mm-subheader'));
  const measured = new Set<HTMLElement>();

  subheaders.forEach((subheader) => {
    const subheaderRect = subheader.getBoundingClientRect();
    const subheaderFont = readFontMetrics(subheader);
    const subheaderNumbers = findNumberMetrics(subheader);
    const subheaderDetail = buildDetailLabel({
      width: Math.round(subheaderRect.width),
      height: Math.round(subheaderRect.height),
      verticalOffset: Math.round(subheaderRect.top),
      fontSize: subheaderFont.fontSize,
      lineHeight: subheaderFont.lineHeight,
      fontWeight: subheaderFont.fontWeight,
      numberMetrics: subheaderNumbers
    });
    subheader.setAttribute(MARK_ATTR, ROOT_VALUE);
    subheader.setAttribute(SIZE_ATTR, `${Math.round(subheaderRect.width)}×${Math.round(subheaderRect.height)}`);
    subheader.setAttribute(DETAIL_ATTR, subheaderDetail);
    measured.add(subheader);

    const root = unwrapSubheaderRoot(subheader);
    const topLevel = getVisibleChildren(root);
    const candidates = new Set<HTMLElement>();

    const addCandidate = (element: HTMLElement) => {
      if (!isVisibleElement(element)) return;
      if (element.dataset.mmMeasureIgnore === 'true') return;
      candidates.add(element);
    };

    topLevel.forEach((item) => {
      addCandidate(item);

      if (shouldExpandContainer(item)) {
        getVisibleChildren(item).forEach(addCandidate);
      }

      item.querySelectorAll<HTMLElement>('.mm-header-actions > *').forEach(addCandidate);
    });

    subheader
      .querySelectorAll<HTMLElement>('.mm-header-actions > *, [data-mm-subheader-item="true"]')
      .forEach(addCandidate);

    candidates.forEach((element) => {
      if (!isReasonableMeasureTarget(element)) return;
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const offsetY = Math.round(rect.top - subheaderRect.top);
      const font = readFontMetrics(element);
      const numbers = findNumberMetrics(element);
      const detail = buildDetailLabel({
        width,
        height,
        verticalOffset: offsetY,
        fontSize: font.fontSize,
        lineHeight: font.lineHeight,
        fontWeight: font.fontWeight,
        numberMetrics: numbers
      });
      element.setAttribute(MARK_ATTR, ITEM_VALUE);
      element.setAttribute(SIZE_ATTR, `${width}×${height}`);
      element.setAttribute(DETAIL_ATTR, detail);
      measured.add(element);
    });
  });

  document.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`).forEach((node) => {
    if (measured.has(node)) return;
    node.removeAttribute(MARK_ATTR);
    node.removeAttribute(SIZE_ATTR);
    node.removeAttribute(DETAIL_ATTR);
  });
};

const clearMeasurements = () => {
  document.querySelectorAll<HTMLElement>(`[${MARK_ATTR}]`).forEach((node) => {
    node.removeAttribute(MARK_ATTR);
    node.removeAttribute(SIZE_ATTR);
    node.removeAttribute(DETAIL_ATTR);
  });
};

const useLocalSubheaderMeasureDebug = () => {
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

    const mutationObserver = new MutationObserver(() => {
      scheduleApply();
    });

    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    window.addEventListener('resize', scheduleApply);
    window.addEventListener('orientationchange', scheduleApply);
    document.addEventListener('visibilitychange', scheduleApply);

    scheduleApply();

    return () => {
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleApply);
      window.removeEventListener('orientationchange', scheduleApply);
      document.removeEventListener('visibilitychange', scheduleApply);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.classList.remove(DEBUG_BODY_CLASS);
      clearMeasurements();
    };
  }, []);
};

export default useLocalSubheaderMeasureDebug;
