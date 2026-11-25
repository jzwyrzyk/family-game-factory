import type {IncomingMessage,ServerResponse} from 'node:http';
import {uuid} from './model';
export async function previewForm(req:IncomingMessage){
 if(req.method!=='POST'||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')throw Error('INVALID_PREVIEW');
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Error('INVALID_PREVIEW');chunks.push(Buffer.from(chunk));}
 const form=new URLSearchParams(Buffer.concat(chunks).toString()),channel=form.get('channel'),grant=form.get('grant');
 if([...form.keys()].sort().join(',')!=='channel,grant'||!uuid(channel)||!grant)throw Error('INVALID_PREVIEW');
 return {channel,grant};
}
export function sendPreview(res:ServerResponse,origin:string,artifact:{html:string;csp:string}){
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':artifact.csp.replace(/frame-ancestors [^;]+/,'frame-ancestors '+origin)});
 res.end(artifact.html);
}
