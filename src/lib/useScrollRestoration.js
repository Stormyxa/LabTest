import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const useScrollRestoration = (isLoading = false) => {
  const { pathname } = useLocation();

  // Read the saved target immediately at mount — before any scroll events fire.
  // We store it in a ref so it survives re-renders and cannot be affected by
  // user scrolling that happens while the skeleton is visible.
  const targetScrollRef = useRef(() => {
    const saved = sessionStorage.getItem(`scroll_${pathname}`);
    return saved ? parseInt(saved, 10) : null;
  });

  // Resolve the factory only once
  const resolvedTarget = useRef(null);
  if (resolvedTarget.current === null && typeof targetScrollRef.current === 'function') {
    resolvedTarget.current = targetScrollRef.current();
    targetScrollRef.current = resolvedTarget.current; // replace factory with value
  }

  // Whether we've finished restoring and it's safe to start saving new positions
  const readyToSave = useRef(false);

  // Save scroll — but ONLY after restoration is done
  useEffect(() => {
    if (isLoading) {
      readyToSave.current = false;
      return;
    }

    let timeout;
    const handleScroll = () => {
      if (!readyToSave.current) return;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sessionStorage.setItem(`scroll_${pathname}`, window.scrollY.toString());
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isLoading, pathname]);

  // Restore scroll once loading is complete
  useEffect(() => {
    if (isLoading) return;

    const target = targetScrollRef.current; // already a number or null

    if (target !== null && target > 0) {
      // Small delay to let React finish painting the real content
      const timer = setTimeout(() => {
        window.scrollTo({ top: target, behavior: 'instant' });
        // Allow saving only after we've finished restoring
        setTimeout(() => { readyToSave.current = true; }, 150);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      window.scrollTo(0, 0);
      readyToSave.current = true;
    }
  }, [isLoading, pathname]);
};
