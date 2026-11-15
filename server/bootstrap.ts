import {createServer} from 'node:http';
/** URL discovery only: no secrets, database, sessions, worker callbacks or generated code. */
export function startBootstrap(port=Number(process.env.PORT)||8080){
 return createServer((req,res)=>{
  res.writeHead(req.url==='/health'?200:503,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify({ready:false,bootstrap:true,paidExecution:false}));
 }).listen(port);
}
