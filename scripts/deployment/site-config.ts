import {writeFile} from 'node:fs/promises';
import {validateBuilderConfig,type BuilderConfig} from '../../src/builder/client';
/** Public URL selectors and opt-in switch only; never read private gateway configuration. */
export function siteConfig(api:string,preview:string,analytics=false):BuilderConfig {
 if(!api&&!preview)return {version:1,mode:'unavailable'};
 if(!api||!preview)throw Error('BOTH_SERVICE_ORIGINS_REQUIRED');
 for(const raw of [api,preview]){const url=new URL(raw);if(url.protocol!=='https:'||url.origin!==raw)throw Error('CANONICAL_HTTPS_ORIGINS_REQUIRED');}
 return validateBuilderConfig({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview,
  ...(analytics===true?{analytics:{version:1,enabled:true}}:{})});
}
if(process.argv.some(x=>/[/\\]site-config\.ts$/.test(x))){
 void writeFile('dist/factory-config.json',JSON.stringify(siteConfig(process.env.FACTORY_PUBLIC_GATEWAY||'',process.env.FACTORY_PUBLIC_PREVIEW||'',process.env.FACTORY_PUBLIC_ANALYTICS_ENABLED==='true'))+'\n')
 .catch(()=>{console.error('Public site config failed: supply both canonical service origins.');process.exitCode=1;});
}
