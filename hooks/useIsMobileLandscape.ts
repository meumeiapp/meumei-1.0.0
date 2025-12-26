import { useEffect, useState } from 'react';
import useIsMobile from './useIsMobile';

const useIsMobileLandscape = () => {
  const isMobile = useIsMobile();
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobile) {
      setIsLandscape(false);
      return;
    }

    const media = window.matchMedia('(orientation: landscape)');
    const update = () => setIsLandscape(media.matches);
    update();

    if (media.addEventListener) {
      media.addEventListener('change', update);
    } else {
      media.addListener(update);
    }
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update);
      } else {
        media.removeListener(update);
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [isMobile]);

  return isMobile && isLandscape;
};

export default useIsMobileLandscape;
