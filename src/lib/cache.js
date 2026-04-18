/**
 * Robust caching utility for localStorage with TTL (Time-To-Live) support.
 */

const CACHE_PREFIX = 'labtest_cache_';

/**
 * Stores data in localStorage with an expiration timestamp.
 * @param {string} key - Cache key.
 * @param {any} data - Data to store.
 * @param {number} ttlHours - Time-To-Live in hours.
 */
export const setCachedData = (key, data, ttlHours = 1) => {
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = {
    data,
    expiresAt
  };
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to set cache:', e);
  }
};

/**
 * Retrieves data from localStorage if it hasn't expired.
 * @param {string} key - Cache key.
 * @returns {any|null} - Cached data or null if not found/expired.
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
 * Helper to fetch data with a caching layer.
 * @param {string} key - Cache key.
 * @param {Function} fetchFn - Async function that returns data.
 * @param {number} ttlHours - Time-To-Live in hours.
 * @returns {Promise<any>}
 */
export const fetchWithCache = async (key, fetchFn, ttlHours = 1) => {
  const cached = getCachedData(key);
  if (cached) {
    return cached;
  }

  const data = await fetchFn();
  if (data) {
    setCachedData(key, data, ttlHours);
  }
  return data;
};
