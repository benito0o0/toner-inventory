import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/inventory.js': ['inventory.js', 'text/javascript'], '/transport.js': ['transport.js', 'text/javascript'], '/config.js': ['config.js', 'text/javascript'], '/cache.js': ['cache.js', 'text/javascript'], '/models.js': ['models.js', 'text/javascript'] };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('找不到頁面'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(500); res.end('無法載入頁面'); }
}).listen(port, '0.0.0.0', () => console.log(`碳粉庫存伺服器已啟動，連接埠 ${port}`));
