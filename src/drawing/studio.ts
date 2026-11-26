import {matchesArtSearch,originalDrawing,drawingHash,drawing,drawingPage,drawingBlob,saveDrawing,updateDrawing,deleteArtwork,type Drawing,type DrawingCategory} from '../assets/private-drawings';
import {artUsages,ART_LIMITS,type DrawingMetadata} from './library';
import {listRigs,loadDrawingDraft,type SavedRig} from './store';
import {exportArtBundle,importArtBundle,restoreArtBundle} from './transfer';
import {catalogueChoices,listCreativeAssets,mountCreativeAssetPicker} from './creative-assets';
import {createPickerArtwork} from './picker-create';
import './creative-picker.css';
import {creationAsset} from '../creation/projects';
import {createPalPortrait} from '../pals/ui';
import type {PalsView} from '../pals/model';
import {openDrawingLab} from './lab';
import {drawOnTablet} from './paint';
import {hasCrayonSource} from './crayon-source';
import {editPicture,visiblePicturePng} from './picture';
import {createIcon,iconMarkup,setIconLabel,type IconName} from '../brand/icons';
import {assertRewardSourceWritable} from '../rewards/write-guard';
import './studio.css';

type Host={enter():boolean|Promise<boolean>;home():void;openCar(rigId:string,current:()=>boolean):Promise<void>;openScene(art:{drawingId:string;rigId?:string},kind?:'picture-hunt'):Promise<void>};
const categories:Record<DrawingCategory,string>={character:'Characters',vehicle:'Vehicles',prop:'Things',world:'Worlds',other:'Other art'};
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const e=document.createElement(tag);e.className=className;e.textContent=text;return e;};

/** One private shelf connects original pictures, editable movement and exact game versions. */
export function installArtStudio(host:Host){
  const FG=(window as any).FG,owner=()=>String(FG.store.current().id);
  const page=node('section','page hidden');page.id='page-art-studio';
  page.innerHTML=`
  <header class="art-heading"><div><span class="art-eyebrow">My Art</span><h1 id="artStudioHeading" tabindex="-1">You drew it. <span>Now let’s play.</span></h1><p>Your characters, curious inventions, and worlds. Ready for their next adventure.</p></div><button id="artHome" class="art-button">${iconMarkup('arrow','jems-icon--back')} My Games</button></header>
  <p id="artStatus" class="art-status" role="status" aria-live="polite"></p>
  <section class="art-welcome" aria-labelledby="artStartTitle"><div class="art-welcome-copy"><span class="art-eyebrow">FROM YOUR IMAGINATION</span><h2 id="artStartTitle">Every great character<br> starts somewhere.</h2><p>A doodle on paper. A scribble on screen.<br> Bring yours in and see what it can do.</p><div class="art-steps" aria-label="Your art journey"><span><b>1</b> Make some art</span><span><b>2</b> Give it movement</span><span><b>3</b> Put it in play</span></div></div><img class="art-helper" src="./jems-art/character_spark_wave.webp" alt="" aria-hidden="true"><div class="art-starts"><button id="artUploadButton" class="art-start art-start-upload">${iconMarkup('add')}<span><strong>Upload a drawing</strong><small>A PNG or JPEG from this device</small></span>${iconMarkup('arrow')}</button><button id="artCameraButton" class="art-start">${iconMarkup('grid')}<span><strong>Take a photo</strong><small>Bring a paper drawing to life</small></span>${iconMarkup('arrow')}</button><button id="artDrawButton" class="art-start">${iconMarkup('edit')}<span><strong>Draw here</strong><small>A fresh page and a few crayons</small></span>${iconMarkup('arrow')}</button></div></section>
  <section class="art-collection" aria-labelledby="artLibraryHeading"><div class="art-collection-heading"><div><span class="art-eyebrow">MADE BY YOU</span><h2 id="artLibraryHeading">My art <span id="artCount" class="art-count">0</span></h2><p>Make it once. Bring it into more adventures.</p></div><div class="art-library-tools"><button type="button" id="artBrowseAssets" class="art-button">Choose artwork</button><label class="art-search">${iconMarkup('search')}<input id="artSearch" type="search" placeholder="Find my art" aria-label="Find my art" maxlength="60"></label><details class="art-library-more"><summary>${iconMarkup('menu')} Library tools</summary><div><button id="artBrowseMotion">Choose art to move</button><button id="artExport">${iconMarkup('download')} Download my art library</button><button id="artImportButton">${iconMarkup('book')} Open an art library</button><button id="artShowArchive">${iconMarkup('clock')} Show archived art</button></div></details></div></div><div id="artFilters" class="art-filters" role="group" aria-label="Filter my art"><button data-category="all" aria-pressed="true">All my art</button>${Object.entries(categories).map(([key,label])=>`<button data-category="${key}" aria-pressed="false">${label}</button>`).join('')}</div><div class="art-library-layout"><div><div id="artGrid" class="art-grid"></div><div id="artEmpty" class="art-empty"><img src="./jems-art/spot_first_idea.webp" alt="" aria-hidden="true"><h3>Your ideas belong here.</h3><p>Add your first drawing above. We’ll keep the original while you experiment.</p></div></div><aside id="artDetails" class="art-details" aria-label="Selected artwork" hidden></aside></div></section>
  <section class="art-next"><div>${iconMarkup('grid')}<h2>What will your art do?</h2></div><p>Make a character move and talk in <strong>Creative Studio</strong>. Give a drawn car real wheels in <strong>Junkyard Rally</strong>. Keep trying new versions—your saved adventures keep the art you chose.</p><p class="art-small">Saved privately for this player on this device. Download your art library to keep a portable copy. Pictures are never sent to a model by these tools.</p></section>
  <input id="artUpload" type="file" accept="image/png,image/jpeg" hidden><input id="artCamera" type="file" accept="image/png,image/jpeg" capture="environment" hidden><input id="artImport" type="file" accept="application/json,.json" hidden>`;
  document.querySelector('main')!.append(page);
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>page.querySelector<T>('#'+id)!;
  let visible=false,epoch=0,refreshRun=0,selected='',category='all',archive=false,items:DrawingMetadata[]=[],rigs:SavedRig[]=[],urls:string[]=[],nextPage:[string,string]|null=null,total=0;
  const status=(text:string,error=false)=>{$('artStatus').textContent=text;$('artStatus').classList.toggle('is-error',error);$('artStatus').setAttribute('role',error?'alert':'status');};
  const release=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
  const imageUrl=(item:Drawing|DrawingMetadata,thumbnail=false)=>{const url=URL.createObjectURL(thumbnail&&item.preview?new Blob([item.preview],{type:'image/png'}):'bytes' in item?drawingBlob(item):new Blob([],{type:'image/png'}));urls.push(url);return url;};
  function current(capturedOwner:string,capturedEpoch=epoch){return visible&&owner()===capturedOwner&&capturedEpoch===epoch;}
  function focusSelectedArtwork(artId:string,capturedOwner:string,capturedEpoch:number){
    if(!current(capturedOwner,capturedEpoch)||selected!==artId)return;
    const pane=$('artDetails'),title=pane.querySelector<HTMLElement>('#artDetailTitle');
    if(pane.hidden||!title)return;
    // Drawing and picture tools call onSaved before closing their modal. Let
    // that close finish before moving focus into the newly selected artwork.
    const editor=document.querySelector<HTMLDialogElement>('dialog.art-picture[open],dialog.drawing-paint[open]');
    if(editor){editor.addEventListener('close',()=>queueMicrotask(()=>focusSelectedArtwork(artId,capturedOwner,capturedEpoch)),{once:true});return;}
    if(innerWidth<850)pane.scrollIntoView({behavior:'auto',block:'start'});
    title.focus({preventScroll:true});
  }
  async function action(fn:()=>Promise<void>|void){const id=owner(),run=epoch;try{await fn();}catch(error){if(current(id,run))status((error as Error).message,true);}}
  const button=(label:string,icon:IconName,fn:()=>Promise<void>|void,primary=false)=>{const b=node('button','art-button'+(primary?' art-primary':''));b.type='button';setIconLabel(b,icon,label);b.onclick=()=>{if(b.disabled)return;b.disabled=true;void action(fn).finally(()=>{if(b.isConnected)b.disabled=false;});};return b;};
  function notify(savedOwner:string){window.dispatchEvent(new CustomEvent('factory-art-updated',{detail:{owner:savedOwner}}));}
  const download=(data:Blob,name:string)=>{const url=URL.createObjectURL(data),link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function refresh(focus=false):Promise<boolean>{
    const id=owner(),run=epoch,request=++refreshRun,active=()=>current(id,run)&&request===refreshRun;$('artGrid').setAttribute('aria-busy','true');
    try{const loaded=await Promise.all([drawingPage(id,{limit:24,archived:archive,...(category==='all'?{}:{category:category as DrawingCategory}),search:$<HTMLInputElement>('artSearch').value}),listRigs(id)]);if(!active())return false;items=loaded[0].items;nextPage=loaded[0].next;total=loaded[0].total;rigs=loaded[1];
      items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(!items.some(item=>item.id===selected))selected='';renderGrid();
      if(selected)await details(selected);else $('artDetails').hidden=true;
      if(!active())return false;
      if(focus)$('artStudioHeading').focus({preventScroll:true});
      return true;
    }catch(error){if(active())status((error as Error).message,true);return false;}
    finally{if(active())$('artGrid').removeAttribute('aria-busy');}
  }
  function renderGrid(){
    release();const grid=$('artGrid');grid.replaceChildren();const query=$<HTMLInputElement>('artSearch').value.trim().toLowerCase();
    const found=items.filter(item=>Boolean(item.archived)===archive&&(category==='all'||(item.category??'other')===category)&&(!query||matchesArtSearch(item,query)));
    $('artCount').textContent=String(total);
    $('artEmpty').hidden=found.length>0;
    $('artEmpty').querySelector('h3')!.textContent=archive?'Your archived art':items.length?'No art matches yet.':'Your ideas belong here.';
    $('artEmpty').querySelector('p')!.textContent=archive?'Archived pictures stay available in saved games and scenes.':items.length?'Try another name or category, or add a new drawing.':'Add your first drawing above. We’ll keep the original while you experiment.';
    for(const item of found){
      const card=node('button','art-card');card.type='button';card.dataset.artId=item.id;card.setAttribute('aria-pressed',String(item.id===selected));
      const preview=node('div','art-card-image art-checker'),img=node('img');if(item.preview)img.src=imageUrl(item,true);else{const captured=owner(),at=epoch;void drawing(captured,item.id).then(original=>{if(current(captured,at)&&img.isConnected)img.src=imageUrl(original);}).catch(()=>{});}img.alt=item.name;img.loading='lazy';preview.append(img);
      const versions=rigs.filter(r=>r.assembly.sourceId===item.id),copy=node('div','art-card-copy');
      copy.append(node('span','art-card-category',categories[item.category??'other']),node('strong','',item.name));
      const meta=node('span','art-card-meta',versions.length?`${versions.length} movement ${versions.length===1?'version':'versions'}`:item.sourceId?'Edited picture · original kept':'Original picture');
      copy.append(meta);card.append(preview,copy);card.onclick=()=>void action(async()=>{const captured=owner(),run=epoch;selected=item.id;renderGrid();await details(item.id);focusSelectedArtwork(item.id,captured,run);});grid.append(card);
    }
    if(nextPage){const more=button('Show more art','arrow',async()=>{const captured=owner(),at=epoch,after=nextPage;if(!after)return;const page=await drawingPage(captured,{limit:24,after,archived:archive,...(category==='all'?{}:{category:category as DrawingCategory}),search:$<HTMLInputElement>('artSearch').value});if(!current(captured,at))return;items.push(...page.items);nextPage=page.next;renderGrid();});more.id='artLoadMore';grid.append(more);}
    for(const filter of $('artFilters').querySelectorAll<HTMLButtonElement>('button'))filter.setAttribute('aria-pressed',String(filter.dataset.category===category));
    setIconLabel($('artShowArchive'),'clock',archive?'Show current art':'Show archived art');
  }
  async function details(id:string){
    const captured=owner(),run=epoch;if(!items.some(item=>item.id===id)||!current(captured,run))return;const item=await drawing(captured,id);if(!current(captured,run)||selected!==id)return;
    const pane=$('artDetails');pane.replaceChildren();pane.hidden=false;
    const heading=node('div','art-detail-heading'),title=node('h2','',item.name);title.id='artDetailTitle';title.tabIndex=-1;
    const close=button('Close','close',()=>{selected='';pane.hidden=true;renderGrid();});close.setAttribute('aria-label','Close artwork details');heading.append(title,close);pane.append(heading);
    const preview=node('div','art-detail-image art-checker'),img=node('img');img.src=imageUrl(item);img.alt=item.name;preview.append(img);pane.append(preview);
    const metadata=node('form','art-metadata'),label=node('label','','Name'),name=node('input');name.value=item.name;name.maxLength=60;name.setAttribute('aria-label','Artwork name');label.append(name);
    const kindLabel=node('label','','Collection'),kind=node('select');kind.setAttribute('aria-label','Artwork collection');for(const [key,text]of Object.entries(categories)){const option=node('option','',text);option.value=key;kind.append(option);}kind.value=item.category??'other';kindLabel.append(kind);
    const meaningLabel=node('label','','What is it? (optional)'),meaning=node('input');
    meaning.value=item.semantic??'';meaning.maxLength=60;meaning.placeholder='A rock, a moon cat…';meaningLabel.append(meaning);
    const metadataSave=button('Save details','check',async()=>{await updateDrawing(captured,id,{name:name.value,semantic:meaning.value,category:kind.value as DrawingCategory},()=>current(captured,run));if(!current(captured,run)||!await refresh())return;status('Artwork details saved.');notify(captured);});metadata.append(label,meaningLabel,kindLabel,metadataSave);metadata.onsubmit=e=>{e.preventDefault();metadataSave.click();};pane.append(metadata);
    const versions=rigs.filter(r=>r.assembly.sourceId===id),versionLabel=node('label','art-version-label','Movement version'),choice=node('select');choice.id='artVersion';choice.setAttribute('aria-label','Movement version');
    const original=node('option','','Original picture');original.value='';choice.append(original);
    for(const [i,rig]of versions.entries()){const count=rig.assembly.pieces.length,option=node('option','',`${versions.length-i} · ${rig.assembly.kind} · ${count} ${count===1?'part':'parts'}`);option.value=rig.id;choice.append(option);}if(versions.length)choice.value=versions[0].id;versionLabel.append(choice);pane.append(versionLabel);
    const actions=node('div','art-detail-actions');
    const editMovement=async(rigId?:string)=>{const editor=await openDrawingLab(captured,item,savedId=>host.openCar(savedId,()=>current(captured,run)),{...(rigId?{rigId}:{}),isCurrent:()=>current(captured,run),onSaved:async()=>{if(current(captured,run)&&await refresh()){status('Movement saved. Choose where it goes next.');notify(captured);}}});editor?.addEventListener('close',()=>{if(current(captured,run))void refresh();},{once:true});};
    const openEditor=button(versions.length?'Edit movement':'Make it move','play',()=>editMovement(choice.value||undefined),true);openEditor.id='artEditMovement';
    const scene=button('Use in Creative Studio','grid',async()=>{await host.openScene({drawingId:item.id,...(choice.value?{rigId:choice.value}:{})});});scene.id='artUseScene';
    const hunt=button('Make a picture hunt','play',()=>host.openScene({drawingId:item.id,...(choice.value?{rigId:choice.value}:{})},'picture-hunt'));hunt.id='artPictureHunt';
    const car=button('Make a Rally game','arrow',async()=>{const at=epoch;await host.openCar(choice.value,()=>current(captured,at));});car.id='artUseRally';
    const updateCar=()=>{car.hidden=!versions.some(r=>r.id===choice.value&&r.assembly.kind==='car');};choice.onchange=updateCar;updateCar();actions.append(openEditor,scene,hunt,car);pane.append(actions);
    const hint=node('p','art-small','This choice is copied into the new game or scene. Earlier adventures keep their chosen version.');pane.append(hint);
    if(item.mime==='image/png'&&hasCrayonSource(item.bytes))actions.append(button('Keep drawing','edit',()=>openPaper(captured,run,item)));
    const tools=node('details','art-detail-tools'),summary=node('summary','','Picture & storage tools');tools.append(summary);
    tools.append(button('Trim, turn & clean up','edit',async()=>{await editPicture(captured,item,async result=>{if(!current(captured,run))return;selected=result.id;if(!await refresh())return;status('New picture saved. Your original is still in My art.');notify(captured);focusSelectedArtwork(result.id,captured,run);},()=>current(captured,run));}));
    tools.append(button('Download visible picture','download',async()=>{
      const visiblePng=await visiblePicturePng(item);
      if(current(captured,run)&&selected===id)download(visiblePng,'my-picture.png');
    }));
    tools.append(button('Download original picture','download',async()=>{
      const original=await originalDrawing(captured,id);
      if(await drawingHash(original.bytes)!==original.sha256)throw Error('Restore your original picture from a backup.');
      if(current(captured,run)&&selected===id)download(drawingBlob(original),'my-drawing.'+(original.mime==='image/png'?'png':'jpg'));
    }));
    if(item.sourceId)tools.append(button('Download this picture version','download',()=>download(drawingBlob(item),'my-drawing-version.'+(item.mime==='image/png'?'png':'jpg'))));
    tools.append(button(item.archived?'Restore to My art':'Archive picture','clock',async()=>{await updateDrawing(captured,id,{archived:!item.archived},()=>current(captured,run));if(!current(captured,run))return;selected='';if(!await refresh())return;status(item.archived?'Picture returned to My art.':'Picture archived. Saved games and scenes can still use it.');notify(captured);}));
    tools.append(button('Delete unused picture','trash',async()=>{if(!confirm('Delete this picture and its movement versions from this device? Download your art library first to keep a copy. Pictures used by saved work cannot be deleted.'))return;await deleteArtwork(captured,id,()=>current(captured,run));if(!current(captured,run))return;selected='';if(!await refresh())return;status('Unused picture deleted.');notify(captured);}));
    if(item.sourceId)tools.append(node('p','art-small','This is an edited copy. The original picture remains saved separately.'));
    pane.append(tools);
    const [draft,usage]=await Promise.all([loadDrawingDraft(captured,id),artUsages(captured,id,true)]);if(!current(captured,run)||selected!==id)return;
    if(draft){const note=node('div','art-draft-note');note.append(node('p','','You have an unfinished movement design.'),button('Resume unfinished design','edit',()=>editMovement()));note.querySelector('button')!.id='artResumeDraft';actions.before(note);}
    if(usage.length){
      const places = new Map<string,{label:string; roles:Set<string>}>();
      for (const use of usage) {
        const label = use.title || (use.targetKind === 'game' ? 'Saved game' : 'Saved scene');
        const key = use.targetKind+':'+use.targetId;
        const roles = places.get(key)?.roles ?? new Set<string>();
        for (const context of use.contexts ?? [use.targetKind]) roles.add(context);
        places.set(key,{label,roles});
      }
      const list=node('ul','art-used-in');
      for (const {label, roles} of places.values()) list.append(node('li','',label+' · '+[...roles].join(', ')));
      pane.append(node('h3','','Where it plays'),list);
      const count=new Set(usage.map(item=>item.targetKind+':'+item.targetId)).size;pane.append(node('p','art-small',`Used in ${count} saved ${count===1?'creation':'creations'}. Archiving keeps those adventures working.`));}
  }
  async function open(id?:string){if(!await host.enter())return;visible=true;selected=id??selected;status('');await refresh(true);}
  let picker: HTMLDialogElement | undefined;
  async function browseArtwork(motion: boolean) {
    const captured = owner(), run = epoch, dialog = node('dialog','creative-picker-dialog');
    picker?.close(); picker = dialog;
    dialog.setAttribute('aria-label', motion ? 'Choose art to move' : 'Choose artwork');
    const box = node('div'), close = node('button','art-button','Back');
    close.type = 'button'; close.onclick = () => dialog.close();
    dialog.append(node('h2','',motion ? 'Choose art to move' : 'Choose artwork'), box, close);
    page.append(dialog); dialog.showModal();
    let releasePicker: (() => void) | undefined;
    const allowed = () => current(captured,run) && dialog.open && picker === dialog;
    dialog.addEventListener('close', () => { releasePicker?.(); dialog.remove(); if (picker === dialog) picker = undefined; }, {once:true});
    const use = async (item: {drawingId:string;rigId?:string}) => {
      if (!allowed()) return;
      const original = await drawing(captured,item.drawingId);
      if (!allowed()) return;
      dialog.close();
      archive = false; category = 'all'; selected = original.id;
      // Searching the exact name ensures an older selected picture is visible
      // even when it is beyond the first shelf page.
      $<HTMLInputElement>('artSearch').value = original.name;
      if (!await refresh() || !current(captured,run)) return;
      if (!items.some(picture => picture.id === original.id)) {
        const {bytes,...metadata} = original;
        items.push({...metadata,originalBytes:bytes.byteLength});
        selected = original.id; renderGrid(); await details(selected);
      }
      if (!current(captured,run) || selected !== original.id) return;
      const version = $<HTMLSelectElement>('artVersion');
      version.value = item.rigId ?? ''; version.dispatchEvent(new Event('change'));
      if (motion) $('artEditMovement').click(); else focusSelectedArtwork(original.id,captured,run);
    };
    try {
      const choices = await listCreativeAssets(captured,allowed);
      if (!allowed()) return;
      const pals = FG.pals?.view() as PalsView | null;
      const catalogue = catalogueChoices(pals?.owner === captured ? pals.owned : []);
      releasePicker = mountCreativeAssetPicker(box,choices,{
        catalogue,
        cataloguePreview: item => {
          const asset = creationAsset(item.assetId);
          if (asset?.palId && asset.palForm) return createPalPortrait(asset.palId,asset.palForm === 'mature' ? 2 : 1);
          const image = node('img'); image.alt = ''; image.src = item.imageUrl; return image;
        },
        catalogueCompatibility: () => motion ? 'Choose one of your drawings to edit its parts.' : undefined,
        onChooseCatalogue: item => {
          if (!allowed()) return;
          const start = button('Use '+item.label+' in a new scene','play',async () => {
            if (!allowed()) return;
            dialog.close(); await FG.creation.openCatalogue(item.assetId);
          });
          box.querySelector('[data-catalogue-action]')?.remove();
          start.dataset.catalogueAction = ''; box.append(start); start.focus();
        },
        onChoose: item => void action(() => use(item)),
        onCreate: () => void action(async () => {
          const saved = await createPickerArtwork(captured,allowed);
          if (saved && allowed()) await use({drawingId:saved.id});
        }),
      });
    } catch(error) { if (allowed()) box.textContent = (error as Error).message; }
  }
  $('artBrowseAssets').onclick = () => void action(() => browseArtwork(false));
  $('artBrowseMotion').onclick = () => void action(() => browseArtwork(true));
  $('artHome').onclick=()=>void action(()=>host.home());
  $('artUploadButton').onclick=()=>$<HTMLInputElement>('artUpload').click();$('artCameraButton').onclick=()=>$<HTMLInputElement>('artCamera').click();
  const upload=async(input:HTMLInputElement)=>{const file=input.files?.[0],id=owner(),run=epoch;if(!file)return;
    const controls=[$<HTMLButtonElement>('artUploadButton'),$<HTMLButtonElement>('artCameraButton')];controls.forEach(b=>b.disabled=true);
    try{assertRewardSourceWritable();status('Opening your picture…');const saved=await saveDrawing(id,file.name.replace(/\.[^.]+$/,''),file,undefined,()=>current(id,run));if(!current(id,run))return;selected=saved.id;archive=false;category='all';$<HTMLInputElement>('artSearch').value='';if(!await refresh())return;status('Your picture is saved. Give it a name, then decide what it should do.');notify(id);focusSelectedArtwork(saved.id,id,run);}
    finally{input.value='';controls.forEach(b=>b.disabled=false);}
  };
  for(const id of ['artUpload','artCamera'])$<HTMLInputElement>(id).onchange=()=>void action(()=>upload($<HTMLInputElement>(id)));
  async function openPaper(id:string,run:number,source?:Drawing){await drawOnTablet(id,async saved=>{if(!current(id,run))return;selected=saved.id;archive=false;category='all';$<HTMLInputElement>('artSearch').value='';if(!await refresh())return;status('Drawing saved. Let’s see what it can do.');notify(id);focusSelectedArtwork(saved.id,id,run);},()=>current(id,run),source);}
  $('artDrawButton').onclick=()=>void action(()=>openPaper(owner(),epoch));
  $('artSearch').oninput=()=>{void action(async()=>{await refresh();});};
  $('artFilters').onclick=e=>{const target=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');if(!target)return;category=target.dataset.category!;void action(async()=>{await refresh();});};
  $('artShowArchive').onclick=()=>{archive=!archive;selected='';$('artDetails').hidden=true;void action(async()=>{await refresh();});};
  $('artExport').onclick=()=>void action(async()=>{const id=owner(),run=epoch;status('Preparing your pictures and editable movement versions…');const bundle=await exportArtBundle(id);if(!current(id,run))return;download(new Blob([JSON.stringify(bundle)],{type:'application/json'}),'my-jems-art.json');status('Art library downloaded. It includes original pictures and editable movement versions.');});
  $('artImportButton').onclick=()=>$<HTMLInputElement>('artImport').click();
  $<HTMLInputElement>('artImport').onchange=()=>void action(async()=>{const input=$<HTMLInputElement>('artImport'),file=input.files?.[0],id=owner(),run=epoch;if(!file)return;
    try{if(file.size>ART_LIMITS.bundleBytes)throw Error('Choose an art library smaller than 64 MB.');status('Checking your art library…');const raw=await file.text();if(!current(id,run))return;const result=await importArtBundle(id,raw,()=>current(id,run));if(!current(id,run))return;selected=result.drawings[0]?.id??'';archive=false;category='all';if(!await refresh())return;status(`${result.drawings.length} pictures added to your art. Existing work was kept.`);notify(id);}finally{input.value='';}
  });
  const restoreInput=node('input');restoreInput.id='artRestore';restoreInput.type='file';restoreInput.accept='application/json,.json';restoreInput.hidden=true;page.append(restoreInput);
  const restoreButton=node('button');restoreButton.type='button';restoreButton.id='artRestoreButton';setIconLabel(restoreButton,'retry','Restore art for saved games');restoreButton.onclick=()=>restoreInput.click();$('artImportButton').after(restoreButton);
  const transferHelp=node('p','art-small','Open adds copies. Restore reconnects the original art versions used by saved games and scenes.');restoreButton.parentElement!.append(transferHelp);
  restoreInput.onchange=()=>void action(async()=>{const file=restoreInput.files?.[0],id=owner(),run=epoch;if(!file)return;
    try{if(file.size>ART_LIMITS.bundleBytes)throw Error('Choose an art library smaller than 64 MB.');status('Checking the original art versions…');const raw=await file.text();if(!current(id,run))return;const result=await restoreArtBundle(id,raw,()=>current(id,run));if(!current(id,run))return;selected=result.drawings[0]?.id??'';archive=false;category='all';if(!await refresh())return;status('Original art versions restored for this player. Their saved games and scenes can use them again.');notify(id);}finally{restoreInput.value='';}
  });
  window.addEventListener('factory-profile',()=>{picker?.close();++epoch;selected='';items=[];rigs=[];release();$('artGrid').replaceChildren();$('artDetails').replaceChildren();$('artDetails').hidden=true;status('');visible=false;});
  window.addEventListener('factory-page',event=>{const destination=(event as CustomEvent).detail;if(destination!=='art-studio'){picker?.close();visible=false;++epoch;release();$('artGrid').replaceChildren();$('artDetails').replaceChildren();}else visible=true;});
  const api={open,refresh:()=>visible?refresh():Promise.resolve(),version:1};FG.artStudio=api;
  const parentBackup=document.getElementById('importData');
  if(parentBackup){const note=node('section','art-parent-note');note.id='artParentBackup';note.append(node('h3','','Pictures & movement designs'),node('p','muted fine','Download this player’s art library as well as the family progress file when moving devices. Restore progress first, select the matching player, then choose My Art → Library tools → Restore art for saved games. A scene can also travel on its own: Download scene & artwork includes its characters.'));
    const manage=button('Open this player’s My Art','edit',()=>open());manage.id='parentArtStudio';manage.onclick=()=>{void open().catch(error=>{const target=document.getElementById('studioGlobalStatus');if(target)target.textContent=(error as Error).message;});};note.append(manage);parentBackup.after(note);}
  return api;
}
