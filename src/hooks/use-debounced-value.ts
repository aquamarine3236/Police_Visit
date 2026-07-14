'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms have
 * passed without a change. Used to keep a text input feeling instant (the raw
 * value drives the controlled input) while deferring the expensive side effect
 * (a network fetch) until the user pauses typing.
 *
 * Purely a UX / perceived-performance helper — it changes *when* a fetch fires,
 * never *what* is fetched, so business logic is untouched.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
