export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { classNumber, oldPrefix, newPrefix } = req.body;
  const token = process.env.GITHUB_PAT;

  if (!token) return res.status(500).json({ error: 'GITHUB_PAT is not configured.' });
  if (!classNumber || !oldPrefix || !newPrefix) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'LabTest-Vercel-API' }
    });
    if (!userRes.ok) throw new Error(`User auth failed`);
    const owner = (await userRes.json()).login;
    const repo = 'LabTestAssets';
    const folderPath = `images/${classNumber}-class`;

    // 1. Плучаем список файлов в папке класса
    const dirRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'LabTest-Vercel-API' }
    });
    
    if (dirRes.status === 404) {
      // Папка не найдена, переименовывать нечего
      return res.status(200).json({ success: true, renamed: {} });
    }
    
    if (!dirRes.ok) throw new Error(`Failed to list directory: ${await dirRes.text()}`);
    
    const files = await dirRes.json();
    if (!Array.isArray(files)) throw new Error('Not a directory');

    // Находим все файлы (обычно фото), начинающиеся с oldPrefix
    const filesToRename = files.filter(f => f.type === 'file' && f.name.startsWith(oldPrefix));
    const urlMap = {}; // { old_download_url : new_download_url }

    // 2. Переименование (загрузка под новым именем + удаление старого)
    for (const file of filesToRename) {
      const newName = file.name.replace(oldPrefix, newPrefix);
      const newPath = `${folderPath}/${newName}`;

      // Скачиваем бинарник
      const imgRes = await fetch(file.download_url);
      const imgBuffer = await imgRes.arrayBuffer();
      // Преобразуем в base64
      let binary = '';
      const bytes = new Uint8Array(imgBuffer);
      for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
      const base64Content = btoa(binary);

      // Загружаем новый файл
      const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${newPath}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'LabTest-Vercel-API' },
        body: JSON.stringify({
          message: `Rename image ${file.name} to ${newName}`,
          content: base64Content
        })
      });

      if (!putRes.ok) throw new Error(`Failed to upload renamed file ${newName}: ${await putRes.text()}`);
      const newFileData = await putRes.json();
      const newDownloadUrl = newFileData.content.download_url;

      // Удаляем старый файл
      const delRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'LabTest-Vercel-API' },
        body: JSON.stringify({
          message: `Delete old image ${file.name} after rename`,
          sha: file.sha
        })
      });

      if (!delRes.ok) console.warn(`Failed to delete old file ${file.name}, but new was created.`);

      // Сохраняем в маппинг
      urlMap[file.download_url] = newDownloadUrl;
    }

    return res.status(200).json({ success: true, renamed: urlMap });

  } catch (error) {
    console.error('Rename Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
