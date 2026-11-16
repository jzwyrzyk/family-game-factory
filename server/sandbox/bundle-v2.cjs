// Immutable, reviewed trusted packages. Never rebuild from mutable source while serving saved revisions.
const path=require('node:path');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const VERSION='quality-runtime-v2.0.0';
const APPROVED=Object.freeze({'quality-runtime-v2.0.0':'e5f8ef24b0aaba929ef933e8035f473798c719f86707979592f93d2122e0d301'}),cached=new Map();
function runtimeBundle(version=VERSION){
 if(!Object.hasOwn(APPROVED,version))throw Error('UNSUPPORTED_TRUSTED_RUNTIME');
 if(cached.has(version))return cached.get(version);
 const directory=path.join(__dirname,'trusted',version),worker=readFileSync(path.join(directory,'worker.js'),'utf8'),client=readFileSync(path.join(directory,'client.js'),'utf8');
 const hash=createHash('sha256').update(version+'\n'+worker+'\n'+client).digest('hex');if(hash!==APPROVED[version])throw Error('TRUSTED_PACKAGE_HASH_MISMATCH');
 const value=Object.freeze({version,hash,worker,client});cached.set(version,value);return value;
}
module.exports={runtimeBundle,VERSION};
