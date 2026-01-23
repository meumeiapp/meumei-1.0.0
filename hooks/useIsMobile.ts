import { useEffect, useState } from 'react';

const getViewportMetrics = () => {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  return { width, height };
};

const getIsMobile = () => {
  if (typeof window === 'undefined') return false;
  const { width, height } = getViewportMetrics();
  const minSide = Math.min(width, height);
  return minSide <= 767;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsMobile(getIsMobile());

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

  return isMobile;
};

export default useIsMobile;
