import { useEffect, useState } from 'react';

const getViewportMetrics = () => {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  return { width, height };
};

const getIsMobileViewport = () => {
  if (typeof window === 'undefined') return false;
  const { width, height } = getViewportMetrics();
  const minSide = Math.min(width, height);
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;

  if (isCoarsePointer) {
    return minSide <= 900;
  }

  return width <= 767;
};

const getIsCompactHeight = () => {
  if (typeof window === 'undefined') return false;
  const { height } = getViewportMetrics();
  return height <= 900;
};

const useIsCompactHeight = () => {
  const [isCompactHeight, setIsCompactHeight] = useState(getIsCompactHeight);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      if (getIsMobileViewport()) {
        setIsCompactHeight(false);
        return;
      }
      setIsCompactHeight(getIsCompactHeight());
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return isCompactHeight;
};

export default useIsCompactHeight;
