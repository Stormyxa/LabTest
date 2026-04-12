export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS check (allow all for simplicity or restrict in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { base64Data, path, fileName } = req.body;
  const token = process.env.GITHUB_PAT;

  if (!token) {
    return res.status(500).json({ error: 'GITHUB_PAT is not configured in Vercel.' });
  }

  try {
    // 1. Get the authenticated user's login to locate the repository
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LabTest-Vercel-API'
      }
    });

    if (!userRes.ok) {
      throw new Error(`Failed to authenticate GitHub token: ${await userRes.text()}`);
    }

    const userData = await userRes.json();
    const owner = userData.login;
    const repo = 'LabTestAssets'; // As requested by user

    // 2. Prepare the payload (base64, no data:image/png;base64, prefix)
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}/${fileName}`;

    // 3. Upload file
    const uploadRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'LabTest-Vercel-API'
      },
      body: JSON.stringify({
        message: `Upload image ${fileName} from LabTest`,
        content: cleanBase64
      })
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('GitHub API Error:', errText);
      throw new Error(`GitHub API Upload failed: ${errText}`);
    }

    const uploadData = await uploadRes.json();
    
    // uploadData.content.download_url gives the direct raw url
    return res.status(200).json({
      success: true,
      url: uploadData.content.download_url,
      path: uploadData.content.path,
      sha: uploadData.content.sha
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
