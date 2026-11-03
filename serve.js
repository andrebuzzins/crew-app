// Mini server locale per provare l'app: node serve.js  ->  http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(5173, () => console.log('Crew App su http://localhost:5173'));
