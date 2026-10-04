const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'fixtures');
const port = Number(process.env.MOCK_PORT || 8765);

function startMockServer() {
  const server = http.createServer((req, res) => {
    let filePath = req.url?.split('?')[0] || '/';
    if (filePath === '/') filePath = '/mock-binance-profile.html';
    const base = path.basename(filePath);
    const full = path.join(root, base);
    if (!full.startsWith(root) || !fs.existsSync(full)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(full).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

module.exports = { startMockServer, port, root };
