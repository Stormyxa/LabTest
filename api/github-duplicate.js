export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_PAT is not configured' });
  }

  try {
    const { urls, path } = req.body;
    if (!urls || !Array.isArray(urls) || !path) {
      return res.status(400).json({ error: 'Отсутствуют urls или path' });
    }

    const owner = 'Stormyxa'; // Hardcoded based on project repo LabTestAssets
    const repo = 'LabTestAssets';
    const duplicatedUrls = {};

    for (const oldUrl of urls) {
      try {
        // Fetch old image
        const imgRes = await fetch(oldUrl);
        if (!imgRes.ok) {
          console.error(`Failed to fetch ${oldUrl}: ${imgRes.statusText}`);
          continue;
        }

        const arrayBuffer = await imgRes.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        
        // Extract original file name
        const fileNameMatch = oldUrl.match(/\/([^\/?#]+)$/);
        const fileName = fileNameMatch ? fileNameMatch[1] : `image_${Date.now()}.png`;

        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}/${fileName}`;

        // Upload to new path
        const uploadRes = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'LabTest-Vercel-API'
          },
          body: JSON.stringify({
            message: `Duplicate image ${fileName} to ${path}`,
            content: base64Data
          })
        });

        const uploadData = await uploadRes.json();
        if (uploadRes.ok && uploadData.content?.download_url) {
          duplicatedUrls[oldUrl] = uploadData.content.download_url;
        } else {
          console.error('Failed to upload duplicated image:', uploadData);
        }
      } catch (e) {
        console.error(`Error processing ${oldUrl}:`, e);
      }
    }

    return res.status(200).json({
      success: true,
      duplicated: duplicatedUrls
    });

  } catch (error) {
    console.error('Duplicate API Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}
