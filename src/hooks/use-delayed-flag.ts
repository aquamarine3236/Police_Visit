'use client';

import { useEffect, useState } from 'react';

/**
 * Delays turning a boolean flag `true` until it has stayed `true` for at least
 * `delay` ms; turning it back to `false` is immediate. Used to gate loading
 * indicators so quick operations (fast network / cache hit) never flash a
 * skeleton or dim overlay — the indicator only appears if the wait is actually
 * long enough for a human to notice.
 *
 * Perceived-performance only: it changes *when* an indicator shows, never the
 * underlying loading state or data.
 */
export function useDelayedFlag(active: boolean, delay = 150): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);

  return shown;
}
