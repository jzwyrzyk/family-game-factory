// Only the single downloaded file is served when a managed browser blocks file URLs.
const {createReadStream} = require('node:fs');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {pathToFileURL} = require('node:url');

async function standaloneInput(file) {
  if (process.env.UI_REVIEW_INLINE_HARNESS !== '1') return {url:pathToFileURL(file).href, close:async()=>{}};
  const server = createServer((req,res) => {
    if (req.method !== 'GET' || req.url !== '/') {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type','text/html');
    const stream = createReadStream(file);
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {url:'http://127.0.0.1:'+server.address().port+'/', close:()=>new Promise(resolve=>server.close(resolve))};
}

module.exports = {standaloneInput};
