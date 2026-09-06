import { useState, useEffect } from 'react';

/**
 * Stable viewport height in px, measured via window.visualViewport
 * (falling back to window.innerHeight) with a resize/orientation listener.
 * Avoids relying on initial paint on Android Chrome before the address bar/toolbar settles — this
 * is what was causing bottom-anchored HUD panels to bunch up near the
 * top of the screen on initial load.
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined'
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 0
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = () => setHeight(window.visualViewport?.height ?? window.innerHeight);
    measure();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      vv?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return height;
}

export default useViewportHeight;
