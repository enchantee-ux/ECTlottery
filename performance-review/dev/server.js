// 本機預覽：node dev/server.js 後開啟終端機列出的連結。資料只存在記憶體。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');

function start(port, opts) {
  const { be, tokens, call } = seed(opts);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const { action, payload } = JSON.parse(body);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(be.api.api(action, JSON.stringify(payload)));
      });
      return;
    }
    const token = (url.searchParams.get('t') || '').replace(/[^A-Za-z0-9]/g, '');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
      .replace('<?!= boot ?>', JSON.stringify({ token }));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, be, tokens, call })));
}

module.exports = { start };

if (require.main === module) {
  start(8765).then(({ tokens }) => {
    console.log('執行長   http://localhost:8765/?t=' + tokens.E000);
    console.log('主管     http://localhost:8765/?t=' + tokens.E001);
    console.log('同仁     http://localhost:8765/?t=' + tokens.E002);
  });
}
