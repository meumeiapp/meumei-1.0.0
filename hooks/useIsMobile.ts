import { useEffect, useState } from 'react';

const getIsMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);

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
  }, []);

  return isMobile;
};

export default useIsMobile;
