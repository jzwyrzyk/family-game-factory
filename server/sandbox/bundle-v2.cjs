// Immutable, reviewed trusted packages. Never rebuild from mutable source while serving saved revisions.
const path=require('node:path');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const VERSION='quality-runtime-v2.1.1';
const APPROVED=Object.freeze({'quality-runtime-v2.0.0':'e5f8ef24b0aaba929ef933e8035f473798c719f86707979592f93d2122e0d301','quality-runtime-v2.0.1':'300e11e35c71a916f9271e5c212dec38b8c1d85aa915d2544a9f78e33c9448b4','quality-runtime-v2.0.2':'de7384ee5ca4b32a49c13ce02ceedda1eae862252e03a3785e3043b0fda40def','quality-runtime-v2.0.3':'247eb42dc3fe9330f904edfc7071a91df562c8b8ad07ffd73db25a0bfc6e7d1d','quality-runtime-v2.1.0':'6a214bbed95e8ec138f78bad2f86a26dee9fc271587a223c97b738b36c289fc0','quality-runtime-v2.1.1':'7f0de54d4c30aa6e026f9bcc29bffd0e911069b70c8b73686a9ecf23ffd58a5c'}),cached=new Map();
function runtimeBundle(version=VERSION){
 if(!Object.hasOwn(APPROVED,version))throw Error('UNSUPPORTED_TRUSTED_RUNTIME');
 if(cached.has(version))return cached.get(version);
 const directory=path.join(__dirname,'trusted',version),worker=readFileSync(path.join(directory,'worker.js'),'utf8'),client=readFileSync(path.join(directory,'client.js'),'utf8');
 const hash=createHash('sha256').update(version+'\n'+worker+'\n'+client).digest('hex');if(hash!==APPROVED[version])throw Error('TRUSTED_PACKAGE_HASH_MISMATCH');
 const value=Object.freeze({version,hash,worker,client,assets:['quality-runtime-v2.1.0','quality-runtime-v2.1.1'].includes(version)});cached.set(version,value);return value;
}
module.exports={runtimeBundle,VERSION};
