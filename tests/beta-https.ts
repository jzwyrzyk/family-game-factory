import {createServer} from 'node:http';
import {connect} from 'node:net';
import type {Duplex} from 'node:stream';
import type {AddressInfo} from 'node:net';

/** A loopback-only CONNECT tunnel keeps real browser origins/cookies for both engines.
 * Requests retain their original Host and Origin; no DNS or header rewriting occurs. */
export async function syntheticHttpsTunnel(targetPort:number,allowedHosts:string[]){
 const sockets=new Set<Duplex>();
 const server=createServer((_req,res)=>{res.writeHead(403);res.end();});
 server.on('connect',(req,client,head)=>{
  if(!allowedHosts.some(host=>req.url===host+':443')){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  const upstream=connect(targetPort,'127.0.0.1');
  for(const socket of [client,upstream]){sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{client.destroy();upstream.destroy();});}
  upstream.on('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
 });
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 return {proxy:{server:'http://127.0.0.1:'+(server.address() as AddressInfo).port},close:async()=>{
  for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));
 }};
}
