export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS check
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.error('CRITICAL: GITHUB_PAT is not configured');
    return res.status(500).json({ error: 'Сервер не настроен: отсутствует GITHUB_PAT. Пожалуйста, добавьте его в переменные окружения Vercel.' });
  }

  try {
    const { base64Data, path, fileName } = req.body;

    if (!base64Data || !fileName) {
      return res.status(400).json({ error: 'Отсутствуют данные файла или имя' });
    }

    // 1. Get the authenticated user
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LabTest-Vercel-API'
      }
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error('GitHub Auth Error:', errText);
      return res.status(userRes.status).json({ error: `Ошибка авторизации GitHub: ${errText}` });
    }

    const userData = await userRes.json();
    const owner = userData.login;
    const repo = 'LabTestAssets'; 

    // 2. Prepare the payload
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}/${fileName}`;

    console.log(`Uploading to: ${apiUrl}`);

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

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      console.error('GitHub API Upload Error:', uploadData);
      return res.status(uploadRes.status).json({ error: uploadData.message || 'Ошибка загрузки в GitHub' });
    }

    return res.status(200).json({
      success: true,
      url: uploadData.content.download_url,
      path: uploadData.content.path,
      sha: uploadData.content.sha
    });

  } catch (error) {
    console.error('Global Upload Handler Error:', error);
    return res.status(500).json({ error: `Внутренняя ошибка сервера: ${error.message}` });
  }
}
