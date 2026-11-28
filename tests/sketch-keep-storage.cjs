// Runs inside Chromium with the actual art store and PNG codec.
module.exports = async function sketchKeepStorage() {
  let owner = 'test-keep-owner';
  window.FG = {store:{current:()=>({id:owner})}};
  const check = (condition,label) => {if (!condition) throw Error(label);};
  const reject = async (f,label) => {try {await f();} catch {return;} throw Error(label);};
  const guard = () => true;
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 560;
  const sheet = {version:1,transparent:true,marks:[{tool:'circle',size:8,color:'#285fe1',points:[{x:80,y:100},{x:140,y:160}]}]};
  art.renderPaper(canvas.getContext('2d'),sheet);
  const source = await art.saveDrawing(owner,'Original moon',await new Promise(resolve => canvas.toBlob(resolve,'image/png')));
  const draft = {token:crypto.randomUUID(),sheet,name:'Moon glow',category:'other',sourceId:source.id,sourceSha256:source.sha256};
  const file = await art.stageSketchKeep(owner,draft,guard,canvas);
  await art.verifySketchKeep(owner,draft.token);
  const renamedFile = await art.stageSketchKeep(owner,{...draft,name:'Moon lantern'},guard,canvas);
  check(await art.drawingHash(await renamedFile.arrayBuffer())===await art.drawingHash(await file.arrayBuffer()),'renaming a recovered page changed its protected pixels');
  await reject(()=>art.stageSketchKeep(owner,{...draft,sourceSha256:'f'.repeat(64)},guard,canvas),'unmatched source accepted');
  await reject(()=>art.stageSketchKeep(owner,{...draft,token:crypto.randomUUID()},guard,canvas),'pending page was overwritten');
  await reject(()=>art.deleteArtwork(owner,source.id,guard),'pending source erased');
  const scoped = await art.exportArtBundle(owner,{drawingIds:[source.id]});
  check(scoped.drawings.length===1,'selective scene export included an unrelated pending page');
  const full = await art.exportArtBundle(owner);
  const pending = full.drawings.find(i=>i.id!==source.id);
  check(pending && pending.sha256===await art.drawingHash(await file.arrayBuffer()) && pending.sourceSha256===source.sha256,'full backup omitted exact pending pixels or lineage');
  owner = 'test-other-keep';
  check(await art.readSketchKeep(owner)===null,'sibling saw an unfinished page');
  await reject(()=>art.discardSketchKeep('test-keep-owner',draft.token,guard),'sibling discarded a pending page');
  owner = 'test-keep-owner';
  await art.restoreFamilyArtBundles([{owner,bundle:full}],[owner],guard);
  check(await art.readSketchKeep(owner)===null && (await art.drawings(owner)).length===2,'complete restore did not consume the matching journal atomically');
  await reject(()=>art.saveDrawing(owner,draft.name,file,source.id,guard,'other',draft.token),'stale callback created a second image');
  const second = {...draft,token:crypto.randomUUID()};
  await art.stageSketchKeep(owner,second,guard,canvas);
  await reject(()=>art.discardSketchKeep(owner,draft.token,guard),'stale discard removed a new save');
  await art.discardSketchKeep(owner,second.token,guard);
  check(await art.readSketchKeep(owner)===null,'confirmed discard retained private bytes');

  // Leave one owner slot available. A paused Keep reserves it against other saves.
  await art.withArtTransaction(['drawingMetadata'],'readwrite',tx=>{
    const metadata=tx.objectStore('drawingMetadata');
    for(let i=0;i<97;i++) metadata.add({id:'quota-'+i,owner,originalBytes:10});
  });
  await art.stageSketchKeep(owner,second,guard,canvas);
  await reject(()=>art.saveDrawing(owner,'Intervening page',file),'an intervening write consumed the reserved image slot');
  const finished=await art.finishSketchKeep(owner,second.token,guard);
  check(finished.sha256===pending.sha256 && await art.readSketchKeep(owner)===null,'finish did not preserve exactly the staged bytes');
};
