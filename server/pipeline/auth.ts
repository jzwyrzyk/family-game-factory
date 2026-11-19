import { createHmac,timingSafeEqual } from 'node:crypto';
import type { VerifiedSession } from '../contracts/api';
export function signSession(session:VerifiedSession,key:string):string {
 if(key.length<32)throw Error('Session signing key must have at least 32 characters');
 const body=Buffer.from(JSON.stringify(session)).toString('base64url');return body+'.'+createHmac('sha256',key).update(body).digest('base64url');
}
export function verifySession(token:string|undefined,key:string,now=Date.now()):VerifiedSession {
 if(!token||token.length>8192||key.length<32)throw Error('UNAUTHENTICATED');const parts=token.split('.');
 if(parts.length!==2||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw Error('UNAUTHENTICATED');
 const expected=createHmac('sha256',key).update(parts[0]).digest(),received=Buffer.from(parts[1],'base64url');if(received.length!==expected.length||!timingSafeEqual(received,expected))throw Error('UNAUTHENTICATED');
 let session:VerifiedSession;
 try{session=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as VerifiedSession;}catch{throw Error('UNAUTHENTICATED');}
 if(!session||typeof session!=='object'||Array.isArray(session)||typeof session.subject!=='string'||
    !session.subject||session.subject.length>200||typeof session.familyId!=='string'||
    !/^[\w-]{1,100}$/.test(session.familyId)||!['parent','designer'].includes(session.role)||
    !Number.isSafeInteger(session.expiresAt)||session.expiresAt<=now||
    (session.deviceId!==undefined&&(typeof session.deviceId!=='string'||!/^[\w-]{1,100}$/.test(session.deviceId))))
  throw Error('UNAUTHENTICATED');
 return session;
}
