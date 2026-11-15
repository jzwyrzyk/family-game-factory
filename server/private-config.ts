import {readFile} from 'node:fs/promises';
import {createPrivateKey} from 'node:crypto';
import {isAbsolute} from 'node:path';
import type {GatewayConfig} from './gateway';
/** Resolve only an explicitly mounted private file. Never inspect/log credential contents. */
export async function loadGatewayConfig(path:string):Promise<GatewayConfig>{
 const config=JSON.parse(await readFile(path,'utf8')) as GatewayConfig;
 if(config.githubPrivateKeyFile){
  if(config.githubPrivateKey||!isAbsolute(config.githubPrivateKeyFile))throw Error('AMBIGUOUS_OR_INVALID_GITHUB_KEY_SOURCE');
  config.githubPrivateKey=await readFile(config.githubPrivateKeyFile,'utf8');
 }
 if(typeof config.githubPrivateKey!=='string'||config.githubPrivateKey.length>32768)throw Error('GITHUB_PRIVATE_KEY_REQUIRED');
 const key=createPrivateKey(config.githubPrivateKey);if(key.asymmetricKeyType!=='rsa')throw Error('RSA_GITHUB_APP_KEY_REQUIRED');
 return config;
}
