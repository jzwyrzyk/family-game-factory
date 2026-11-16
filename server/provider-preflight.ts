/** Read-only entitlement check. Run only in the authorized generation environment. */
export async function checkProviderModel(model:string,key:string,transport:typeof fetch=fetch){
 if(!/^[a-zA-Z0-9._-]{1,100}$/.test(model)||key.length<16)throw Error('PROVIDER_CONFIGURATION_REQUIRED');
 const response=await transport('https://api.openai.com/v1/models/'+encodeURIComponent(model),{
  headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('PROVIDER_MODEL_NOT_AUTHORIZED');
 const value=await response.json();if(value.id!==model)throw Error('PROVIDER_MODEL_ID_MISMATCH');
 return {model,authorized:true,generationTested:false};
}
if(process.argv.some(x=>/[/\\]provider-preflight\.ts$/.test(x))){
 void checkProviderModel(process.env.FACTORY_MODEL||'',process.env.FACTORY_OPENAI_API_KEY||'')
 .then(result=>console.log(JSON.stringify(result)))
 .catch(()=>{console.error('PROVIDER_PREFLIGHT_FAILED: check model authorization in the generation environment; no generation attempted.');process.exitCode=1;});
}
