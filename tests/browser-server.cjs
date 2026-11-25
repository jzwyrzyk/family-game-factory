const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
exports.start=(directory='dist',intercept)=>http.createServer((req,res)=>{
 if(intercept?.(req,res))return;
 const root=path.resolve(directory),relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/arcade\//,'/');
 const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found')}
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
}).listen(0,'127.0.0.1');
