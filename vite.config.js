import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const vercelApiMock = () => ({
  name: 'vercel-api-mock',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/api/')) {
        try {
          const apiPath = req.url.split('?')[0];
          // Формируем абсолютный путь к файлу в папке /api
          // req.url обычно начинается с /api/..., поэтому убираем первый слеш для join
          const relativePath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
          const absolutePath = path.join(process.cwd(), relativePath + '.js');
          
          console.log(`[API Mock] Attempting to load: ${absolutePath}`);

          // Для Windows преобразуем путь в file:// URL для динамического импорта
          const fileUrl = `file://${absolutePath.replace(/\\/g, '/')}`;
          const module = await import(fileUrl + '?t=' + Date.now());
          
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
             if (body) {
               try { req.body = JSON.parse(body); } catch(e) { req.body = body; }
             }
             
             const mockRes = {
               status: (code) => { res.statusCode = code; return mockRes; },
               json: (data) => { 
                 res.setHeader('Content-Type', 'application/json'); 
                 res.end(JSON.stringify(data)); 
               },
               end: () => res.end(),
               setHeader: (k, v) => res.setHeader(k, v)
             };
             
             // Прокидываем GITHUB_PAT из переменных окружения (Vite их грузит в process.env из .env файлов)
             await module.default(req, mockRes);
          });
        } catch (e) {
          console.error('[API Mock Error]:', e.message);
          res.statusCode = 404;
          res.end('Not Found');
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), vercelApiMock()],
})
