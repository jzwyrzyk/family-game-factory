// Hide a private snapshot before the browser adds it to its back/forward cache.
window.addEventListener('pagehide',()=>{document.documentElement.hidden=true;});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
async function checkOwner(){
 try{const result=await fetch('/factory-config.json',{cache:'no-store',redirect:'error'});if(!result.ok||!(result.headers.get('content-type')||'').includes('application/json'))location.reload();}
 catch{document.documentElement.hidden=true;location.reload();}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkOwner();});
setInterval(()=>{if(!document.hidden)void checkOwner();},60000);
