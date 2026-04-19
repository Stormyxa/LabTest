import { useEffect } from 'react';

/**
 * Robust caching utility for localStorage with TTL and Data-Driven Updates (SWR).
 */

const CACHE_PREFIX = 'labtest_cache_';
const fetchingPromises = new Map();

/**
 * Stores data in localStorage. Default TTL is basically infinite (1 year) since we use SWR.
 */
export const setCachedData = (key, data, ttlHours = 24 * 365) => {
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = {
    data,
    expiresAt
  };
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to set cache (quota exceeded?):', e);
  }
};

/**
 * Retrieves data from localStorage if it hasn't expired.
 */
export const getCachedData = (key) => {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;

    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Failed to get cache:', e);
    return null;
  }
};

/**
 * Fetches data with Stale-While-Revalidate (Data-Driven Updates).
 * - Returns cache instantly if available.
 * - Triggers background fetch.
 * - If new data differs from cache, updates cache and dispatches event.
 */
export const fetchWithCache = async (key, fetchFn, ttlHours = 24 * 365, forceUpdate = false) => {
  const cached = getCachedData(key);

  const fetchTask = async () => {
    try {
      const fresh = await fetchFn();
      if (fresh) {
        // Deep comparison stringify
        const cachedStr = JSON.stringify(cached);
        const freshStr = JSON.stringify(fresh);
        
        if (cachedStr !== freshStr) {
          setCachedData(key, fresh, ttlHours);
          window.dispatchEvent(new CustomEvent(`cache-update-${key}`, { detail: fresh }));
        }
      }
      return fresh;
    } catch (e) {
      console.error(`SWR Background Fetch Error for ${key}:`, e);
      return cached; // Return cache as fallback if server fails
    } finally {
      fetchingPromises.delete(key);
    }
  };

  // If cache exists and no forced update, return cache & fire background revalidation
  if (cached && !forceUpdate) {
    if (!fetchingPromises.has(key)) {
      fetchingPromises.set(key, fetchTask());
    }
    return cached;
  }

  // Deduplicate inflight requests if cache miss
  if (fetchingPromises.has(key)) {
    return fetchingPromises.get(key);
  }

  const promise = fetchTask();
  fetchingPromises.set(key, promise);
  return promise;
};

/**
 * React hook to listen for cache invalidation events.
 * Use this to auto-update state when background SWR detects changes.
 */
export const useCacheSync = (key, onUpdate) => {
  useEffect(() => {
    if (!key) return;
    const handler = (e) => onUpdate(e.detail);
    window.addEventListener(`cache-update-${key}`, handler);
    return () => window.removeEventListener(`cache-update-${key}`, handler);
  }, [key, onUpdate]);
};
