const http = require('node:http');
const marker = process.env.DRILL_MARKER;
if (!['baseline', 'candidate'].includes(marker)) throw new Error('Invalid synthetic release marker');
http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify({ready: true, marker}));
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
