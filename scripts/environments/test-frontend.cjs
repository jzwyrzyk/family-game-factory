// Compare protected household responses against the reproducible protected-main build.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readdir,readFile} = require('node:fs/promises');
const path = require('node:path');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = /^(?:assets\/index-[\w-]+\.(?:js|css)|[\w/-]+\.(?:webp|gif|svg|jpg|png|mp3|wav|woff2?)|jems-pals\/manifest\.json)$/;
function servedIndex(html) {
  return html.replace('<html lang="en">','<html lang="en" data-household-protected>')
    .replace(/<link rel="manifest"[^>]*>/g,'').replace('</head>','<script defer src="/owner-session.js"></script></head>');
}
async function expectedFiles(root) {
  const result=[];
  async function walk(prefix) {
    for (const item of await readdir(path.join(root,prefix),{withFileTypes:true})) {
      const name=prefix+item.name;
      if(item.isDirectory()) await walk(name+'/');
      else if(item.isFile()&&asset.test(name)) {
        result.push([name,name]);
        if (/^(?:fonts|art)\/[\w/-]+\.(?:webp|gif|svg|jpg|png|woff2?)$/.test(name)) result.push(['play/'+name,name]);
      }
    }
  }
  await walk('');
  result.push(['','index.html'],['index.html','index.html'],['owner-session.js','entry/owner-session.js']);
  return result.sort(([a],[b])=>a<b?-1:a>b?1:0);
}
async function fingerprint(root,source,read) {
  const routes=await expectedFiles(root);
  assert(routes.some(([p])=>/^assets\/index-.*\.js$/.test(p))&&routes.some(([p])=>p==='jems-pals/manifest.json'),'TEST_BUILD_INCOMPLETE');
  const rows=new Array(routes.length);
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<routes.length) {
      const i=next++, [route,file]=routes[i];
      let bytes=await readFile(path.join(root,file));
      if(file==='index.html') bytes=Buffer.from(servedIndex(bytes.toString('utf8')));
      const response=await read('/'+route,bytes.length);
      assert(bytes.equals(response),'TEST_FRONTEND_DIFFERS:'+route);
      rows[i]={bytes:bytes.length,path:'/'+route,sha256:sha(bytes)};
    }
  }));
  return {schemaVersion:1,sourceSha:source,environment:'test',scope:'iap-household-served-files',frontendSha256:sha(JSON.stringify(rows)),files:rows};
}
async function observation(target,token) {
  const origin='https://'+target.household;
  async function read(relative,limit) {
    const url=new URL(relative,origin);
    assert.equal(url.origin,origin);
    const res=await fetch(url,{headers:{authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(30000)});
    assert.equal(res.status,200,'PRIVATE_TEST_FETCH_FAILED');
    const data=[]; let size=0;
    for await (const chunk of res.body) {size+=chunk.length;assert(size<=limit,'TEST_FILE_OVERSIZE');data.push(chunk);}
    return Buffer.concat(data);
  }
  const denied=await fetch(origin+'/factory-config.json',{redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert([401,403].includes(denied.status)||([302,303,307].includes(denied.status)&&new URL(denied.headers.get('location')).origin==='https://accounts.google.com'),'ANONYMOUS_HOUSEHOLD_ACCESS');
  assert.deepEqual(JSON.parse(await read('/factory-config.json',4096)),{version:1,mode:'remote',apiBaseUrl:origin,previewOrigin:'https://'+target.preview});
  return fingerprint('dist-family-beta',target.source,read);
}
module.exports={fingerprint,observation,servedIndex,sha};
