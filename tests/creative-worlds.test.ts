import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createStarterProject, validateGeneratedCreationManifest, validateEditableProject} from '../src/creation/projects';
import {SCENE_WORLDS, EARLIER_PROPS, sceneAssetSlots,worldView,type CreationProject} from '../src/creation/model';
import {privateArtReferences} from '../src/creation/private-art';
import {SceneEngine} from '../src/creation/engine';
// Exercise the shared runtime registry and render selections with the historical records.
function worldLayerIds(scene:CreationProject) {
  const w=worldView(scene),asset=SCENE_WORLDS.find(a=>a.id===w.assetId)!;
  return [asset.id+':background',...(asset.middle && w.middle?[asset.id+':middle']:[]),...(asset.foreground && w.foreground?[asset.id+':foreground']:[])];
}

const image='art:image:my-rock:'+ 'a'.repeat(64);
const rock={id:'my-rock-spot', name:'My rock', assetId:image,x:50,y:60,size:30,plane:'front' as const};

test('versioned studio artwork matches its reviewed files',()=>{
  const pins={
    'world:jem-gardens:v1':'1b1460063ff8d1d3c353b0952731f3a73059c500800d3118ba558fd76300be84',
    'world:cloud-islands:v1':'9b2446de258abe52782287ea620d65a0ac7abd5bbc210938439b02658d4d132f',
    'world:gem-factory:v1':'b6e81f59ab4d1e05475b85817264645ecda30ed105eb7934fcc69b956f065afe',
    'prop:jem-chest:v1':'915a3ffda75bb546b93fecd102f51a5f341fb5d4b479c4c90a24ef2b80e03712',
    'prop:coral-jem:v1':'e6739ccfe866733dd2beefc47d8d8d961f1e8fb1a50c54ce027d4f3d663cc970',
    'prop:mine-cart:v1':'5f8b8297b699f8cbfd2ddb0297e8f72da89876734bc03583711ae4bcf35a16a3',
  };
  for(const [id,hash] of Object.entries(pins)){
    const url=new URL('../public/'+[...SCENE_WORLDS,...EARLIER_PROPS].find(a=>a.id===id)!.url,import.meta.url);
    assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'),hash,id);
  }
});

test('private world and scene placements share pin extraction, remapping and the generated boundary',()=>{
  const scene=createStarterProject('blank');
  scene.world={backdrop:image,fit:'contain',decorations:[{...rock}, {...rock,id:'another-spot'}]};
  const original=validateEditableProject(scene);
  assert.deepEqual(privateArtReferences(scene),[image]);
  assert.equal(sceneAssetSlots(scene).filter(slot=>slot.assetId===image).length,3);
  assert.throws(()=>validateGeneratedCreationManifest(scene),/Private artwork/);
  const replacement=image.replace('my-rock','copied-rock');
  for (const slot of sceneAssetSlots(scene)) if (slot.assetId===image) slot.assetId=replacement;
  assert.deepEqual(privateArtReferences(scene),[replacement]);
  assert.equal(worldView(original).assetId,image);
  assert.deepEqual(new SceneEngine(original).snapshot(),new SceneEngine(scene).snapshot());
  scene.world.backdrop='world:gem-factory:v1';
  assert.throws(()=>validateGeneratedCreationManifest(scene),/Private artwork/);
});

test('legacy scenes open unchanged and invalid world placements fail closed',()=>{
  const scene=createStarterProject('buckets');delete scene.world;
  assert.deepEqual(validateEditableProject(scene),scene);
  const oldNight={backdrop:'world:classic-night:v1',fit:'cover' as const,decorations:[rock]};
  const reused=validateEditableProject({...scene,background:'meadow',world:oldNight});
  assert.equal(worldView(reused).classic,'night','Copying a decorated classic night scene preserves its exact backdrop.');
  const valid={backdrop:'world:cloud-islands:v1',fit:'cover',decorations:[rock]};
  for(const world of [{...valid,backdrop:'https://example.org/image'}, {...valid,fit:'stretch'}, {...valid,extra:true},
    {...valid,decorations:[{...rock,assetId:'blob:untrusted'}]}, {...valid,decorations:[{...rock,x:-1}]},
    {...valid,decorations:[{...rock,size:101}]}, {...valid,decorations:[{...rock,physics:true}]},
    {...valid,decorations:[rock,rock]}, {...valid,decorations:Array.from({length:9},(_,i)=>({...rock,id:'r'+i}))}])
    assert.throws(()=>validateEditableProject({...scene,world}));
});


test('painted worlds keep their immutable layer sequence and bounded per-scene visibility',()=>{
  const scene=createStarterProject('blank');
  scene.world={backdrop:'world-moon-v1',fit:'cover',decorations:[]};
  assert.equal(worldView(scene).assetId,'world-moon-v1');
  assert.deepEqual(worldLayerIds(scene),['world-moon-v1:background','world-moon-v1:middle','world-moon-v1:foreground']);
  scene.world.middle=false;
  assert.deepEqual(worldLayerIds(validateEditableProject(scene)),['world-moon-v1:background','world-moon-v1:foreground']);
  scene.world.backdrop=image;
  assert.throws(()=>validateEditableProject(scene),/layer/);
});
