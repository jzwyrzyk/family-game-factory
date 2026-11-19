import {rand,shuffle,make,button,startCanvas,rounded,text} from './helpers.js';
const BLUEPRINTS=[
 {title:'Junkyard Rocket',icon:'🚀',verb:'Blast off!',complete:'The rocket BLASTS into space!',slots:[
  ['nose','Pointy nose','🚧','Traffic cone'],['body','Rocket body','🧴','Big bottle'],['left','Left wing','🥄','Spoon wing'],['right','Right wing','🏓','Paddle wing'],['engine','Engine','🌀','Old fan'],['window','Window','💿','Shiny CD']],decoys:[['d1','🧸','Stuffed bear'],['d2','🍉','Watermelon'],['d3','🧦','Old sock']]},
 {title:'Bubble Gum Submarine',icon:'🚤',verb:'Dive!',complete:'Your submarine zooms underwater!',slots:[
  ['nose','Front tip','🥣','Mixing bowl'],['body','Main cabin','🧺','Laundry basket'],['prop','Propeller','🪭','Fan blades'],['window','Window','🕰️','Round clock'],['tail','Back fin','🪚','Hand saw'],['light','Search light','🔦','Flashlight'],['cargo','Cargo hold','🧳','Suitcase']],decoys:[['d1','🧁','Cupcake'],['d2','🥕','Carrot'],['d3','🛼','Roller skate']]},
 {title:'Robot from the Attic',icon:'🤖',verb:'Power up!',complete:'Your wobbly robot starts dancing!',slots:[
  ['head','Head','💡','Lamp head'],['body','Body','📦','Cardboard box'],['left','Left arm','🪠','Plunger arm'],['right','Right arm','🧹','Broom arm'],['eye','Laser eye','📀','Tiny disc'],['foot1','Left foot','👟','Sneaker'],['foot2','Right foot','🥾','Boot'],['power','Power cell','🔋','Battery']],decoys:[['d1','🌮','Taco'],['d2','🐸','Toy frog'],['d3','🍦','Ice cream']]}
];
function Builder(mount,ctx){
 let level=1,selected=null,used=0,placed={},ended=false,root,timer=null,pieces=[];
 const current=()=>BLUEPRINTS[Math.min(level-1,BLUEPRINTS.length-1)];
 function reset(){selected=null;used=0;placed={};ended=false;const bp=current();pieces=shuffle([...bp.slots.map(([id,slot,emoji,name])=>({id,emoji,name})),...(ctx.config.extraDecoys > 0?[...bp.decoys,...Array.from({length:ctx.config.extraDecoys},(_,i)=>['extra'+i,'🧦','Space sock '+(i+1)])]:bp.decoys).map(([id,emoji,name])=>({id,emoji,name}))]);render()}
 function render(){const bp=current();root=make('div','builder-wrap');mount.replaceChildren(root);
 const head=make('div','builder-header');head.append(make('strong','',`${bp.icon} Level ${level}: ${bp.title}`));head.append(make('div','builder-counter',`🫧 Gum: ${Math.max(0,10-used)} / 10`));root.append(head);
 const message=make('p','builder-message','Choose a junk item, then a matching blueprint spot. Each attachment uses one stick of gum!');root.append(message);
 const stage=make('div','builder-work');const slots=make('div','builder-slots');stage.append(slots);root.append(stage);
 bp.slots.forEach(([id,title])=>{
  const done=pieces.find(p=>p.id===id&&placed[id]);const slot=button(done?`${done.emoji}  ${title}`:`✚  ${title}`,()=>place(id),'build-slot'+(done?' filled':''));
  if(done){const small=make('span','',`✓ ${done.name}`);small.style.display='block';slot.append(small)}else{const note=make('small','', 'Tap to attach');note.style.display='block';slot.append(note)}slots.append(slot);
 });
 const ctl=make('div','builder-controls');const info=make('span','builder-counter',`🔗 ${Object.keys(placed).length}/${bp.slots.length} parts connected`);ctl.append(info);ctl.append(button('Mix up the pile',()=>{pieces=shuffle(pieces);render()},'btn secondary small','retry'));root.append(ctl);
 const label=make('p','builder-message','YOUR JUNK PILE — pick one:');label.style.margin='14px 0 8px';root.append(label);
 const stash=make('div','builder-pieces');pieces.forEach(p=>{const taken=!!placed[p.id];const item=button(`${p.emoji} ${p.name}`,()=>{selected=p.id;render()},'builder-piece'+(selected===p.id?' selected':''));if(ctx.config.highlightMatches&&bp.slots.some(([id])=>id===p.id))item.style.borderColor='#26945e';item.disabled=taken||ended;stash.append(item)});root.append(stash);
 const foot=make('p','builder-message','Tip: matching a piece to its purpose is more important than making it look perfect. Try different inventions!');foot.style.marginTop='14px';root.append(foot);
 }
 function place(slotId){if(ended)return;const bp=current();if(!selected){hint('Pick a piece from the junk pile first.');return}if(placed[slotId])return;const p=pieces.find(x=>x.id===selected);if(!p)return;
  if(p.id!==slotId){hint(`Hmm, a ${p.name.toLowerCase()} might not work here. Try another spot!`);return}
  if(used>=10){hint('No gum left! Try the level again.');return}
  placed[slotId]=true;used++;selected=null;render();
  if(Object.keys(placed).length===bp.slots.length){ended=true;root.classList.add('launch');timer=setTimeout(()=>ctx.finish({won:true,level,title:`${bp.icon} ${bp.verb}`,description:bp.complete+` You built it with ${used} gum sticks.`}),1050)}
 }
 function hint(s){const el=root.querySelector('.builder-message');if(el)el.textContent=s}
 this.snapshot=()=>({level,connected:Object.keys(placed).length,pieceCount:pieces.length});this.next=()=>{level++;reset()};this.restart=()=>{level=1;reset()};this.unmount=()=>{if(timer)clearTimeout(timer);mount.replaceChildren()};reset();
}

export default Builder;
