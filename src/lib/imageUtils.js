
/**
 * Utility to resolve image URLs through our proxy or external CDNs.
 */

export const resolveImgUrl = (url) => {
  if (!url) return '';
  
  let targetUrl = url;

  // 1. Handle "LabTestAssets/images/..." relative paths if they somehow landed in DB
  if (url.startsWith('LabTestAssets/')) {
    // This is a guess based on the known repo name. 
    // Usually, these should be full URLs, but we handle this as fallback.
    // We assume Stormyxa is the owner as seen in DB data.
    targetUrl = `https://raw.githubusercontent.com/Stormyxa/${url.replace('LabTestAssets/', 'LabTestAssets/main/')}`;
  }

  // 2. Only proxy GitHub raw links (to bypass potential region blocks and handle private repos)
  if (targetUrl.includes('raw.githubusercontent.com') || targetUrl.includes('github.com')) {
    // We encode the entire URL as a query parameter for our proxy API
    return `/api/get-image?url=${encodeURIComponent(targetUrl)}`;
  }

  // 3. Keep other URLs as is (unless they are known to be problematic)
  return targetUrl;
};
