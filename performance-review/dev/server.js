// 本機預覽：node dev/server.js 後開啟終端機列出的連結。資料只存在記憶體。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');

function start(port, opts) {
  const { be, tokens, call, lastCode } = seed(opts);
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
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, be, tokens, call, lastCode })));
}

module.exports = { start };

if (require.main === module) {
  start(8765).then(({ be }) => {
    console.log('開啟 http://localhost:8765/ ，用 e000@example.com（執行長）、e001@example.com（主管）、e002@example.com（同仁）登入');
    console.log('驗證碼會顯示在這裡：');
    let seen = be.outbox.length;
    setInterval(() => { for (; seen < be.outbox.length; seen++) console.log(' ', be.outbox[seen].to, be.outbox[seen].subject); }, 500);
  });
}
