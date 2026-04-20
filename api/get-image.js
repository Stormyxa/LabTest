
export default async function handler(req, res) {
  const { url } = req.query;
  const token = process.env.GITHUB_PAT;

  if (!url) {
    return res.status(400).json({ error: 'Missing image URL' });
  }

  // Security: only allow images from raw.githubusercontent.com or our own LabTestAssets paths
  const isGithubLink = url.includes('raw.githubusercontent.com') || url.includes('github.com');
  
  if (!isGithubLink) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Target responded with ' + response.status);
      
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/png';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(Buffer.from(buffer));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    const fetchWithAuth = async (targetUrl) => {
      const headers = {
        'Accept': 'application/vnd.github.v3.raw',
        'User-Agent': 'LabTest-Image-Proxy'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return await fetch(targetUrl, { headers });
    };

    let response = await fetchWithAuth(url);
    
    // Fallback: if it's a raw.githubusercontent.com URL and it's 404, maybe branch is wrong?
    if (!response.ok && response.status === 404 && url.includes('/main/')) {
       console.log('Main branch not found, trying master fallback...');
       const masterUrl = url.replace('/main/', '/master/');
       const masterResponse = await fetchWithAuth(masterUrl);
       if (masterResponse.ok) response = masterResponse;
    }

    if (!response.ok) {
       const errBody = await response.text().catch(() => 'No error body');
       throw new Error(`GitHub responded with ${response.status}: ${errBody}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Proxy Error:', error);
    // If we can't return the image, we return a 500 JSON, but img tags will just show broken icon.
    return res.status(500).json({ error: error.message });
  }
}
