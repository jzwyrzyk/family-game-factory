/* UI orchestration: game/learning engines remain independent. */
(function(){
'use strict';
const FG=window.FG;
const $=id=>document.getElementById(id);
let activeGame=null,activeGameId=null,question=null,labStreak=0,gameSession=0,learningContext={},checkpointTimer=null;
function escapeHtml(str){return String(str).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function page(which){FG.learning?.dispose();dismiss();clearInterval(checkpointTimer);checkpointTimer=null;window.dispatchEvent(new CustomEvent('factory-page',{detail:which}));if(which!=='game'&&activeGame){gameSession++;activeGame.unmount();activeGame=null;activeGameId=null}document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$('page-'+which).classList.remove('hidden');document.querySelectorAll('.nav').forEach(n=>{const selected=n.dataset.page===which;n.classList.toggle('active',selected);if(selected)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});if(which==='lab')loadLab();if(which==='creations')renderFeedback();if(which==='feedback')loadRemix();if(which==='parent')loadParent();window.scrollTo({top:0,behavior:'auto'})}
function profiles(){const box=$('profile-choices');box.replaceChildren();FG.store.data.profiles.forEach(p=>{const b=document.createElement('button');b.className='profile-choice'+(FG.store.current().id===p.id?' active':'');b.textContent=`${p.icon||'⭐'} ${p.name}`;b.addEventListener('click',()=>{FG.store.choose(p.id);profiles();window.dispatchEvent(new Event('factory-profile'));if(!$('page-lab').classList.contains('hidden'))loadLab();if(!$('page-parent').classList.contains('hidden'))loadParent();if(!$('page-feedback').classList.contains('hidden'))loadRemix();if(activeGame)page('home')});box.append(b)})}
function gameOpen(id,options={}){if(FG.store.loadError){page('parent');return}FG.learning?.dispose();gameSession++;learningContext={gameId:id,versionId:options.stateKey||'original-'+id,projectId:options.projectId||id};const g=FG.games[id];if(!g)return;window.dispatchEvent(new CustomEvent('factory-game',{detail:{live:!!options.onOutcome}}));if(activeGame)activeGame.unmount();activeGameId=id;page('game');$('game-title').textContent=g.name;$('game-type').textContent=g.type;$('game-instructions').textContent=g.instructions;$('game-control-hint').textContent=g.controls;$('game-status').textContent=FG.store.current().icon+' '+FG.store.current().name+(id==='buckets'?' · '+(FG.store.current().punish?'Original Challenge: wrong math ends the run':'Practice: hints and recovery'):'');$('stage-overlay').classList.add('hidden');activeGame=new g.build($('game-mount'),{difficulty:FG.store.current().remixes?.[id]||'classic',config:options.config,stateKey:options.stateKey||'original-'+id,finish:result=>{finish(id,result);options.onOutcome?.(result)}});let modeBox=$('gameMathMode');if(!modeBox){modeBox=document.createElement('div');modeBox.id='gameMathMode';$('page-game').querySelector('.game-bottom').append(modeBox);}FG.learning.modeControl(modeBox,learningContext.projectId);startCheckpointClock();}
// Safe mid-round checkpoints keep open-ended play connected to learning.
function startCheckpointClock(){
 let activeSeconds=0,number=0;const session=gameSession;
 checkpointTimer=setInterval(()=>{
  if(session!==gameSession||document.hidden||FG.learning.active||!activeGame?.isPlaying?.()||!$('stage-overlay').classList.contains('hidden'))return;
  activeSeconds++;if(activeSeconds<90||!FG.math.canAsk(FG.store.current()))return;
  if(!activeGame.pause())return;activeSeconds=0;
  const el=overlayHtml('<div id="native-learning-activity" class="modal-card"></div>');
  const complete=()=>{if(session!==gameSession)return;dismiss();activeGame?.resume();};
  const asked=FG.learning.checkpoint(el.firstElementChild,learningContext,complete,{roundId:`${session}:mid:${++number}`,legacyIds:true});
  if(!asked)complete();
 },1000);
}
function overlayHtml(html){$('game-mount').inert=true;const el=$('stage-overlay');el.innerHTML=html;el.classList.remove('hidden');return el}
function dismiss(){$('game-mount').inert=false;const el=$('stage-overlay');el.classList.add('hidden');el.replaceChildren()}
function finish(game,result){
 if(activeGameId!==game)return;
 const session=gameSession,p=FG.store.current();
 const el=overlayHtml('<div id="native-learning-activity" class="modal-card"></div>');
 const asked=FG.learning.checkpoint(el.firstElementChild,learningContext,response=>{
   if(session!==gameSession)return;
   const outcome=activeGameId==='buckets'&&p.punish&&!response.independent?{...result,won:false,title:'Run complete',description:'Original Challenge: this answer ended the run. Try again when ready.'}:result;
   showResult(outcome,response.independent);
 },{legacyIds:true,challenge:activeGameId==='buckets'&&p.punish});
 if(!asked)showResult(result,true);
}
function showResult(result,mathFirstTry){if(!activeGame)return;const p=FG.store.current();const penalty=!!p.punish&&!mathFirstTry&&result.won;const won=!!result.won&&!penalty;FG.store.recordGame(activeGameId,won,result.level);let txt=penalty?'Math challenge missed on the first try. Parent challenge mode means repeating this level.':result.description;
 const el=overlayHtml(`<div class="modal-card"><div class="big-icon">${won?'🏆':'💛'}</div><div class="eyebrow">${won?'LEVEL CLEARED':'TRY AGAIN'}</div><h2>${escapeHtml(penalty?'One more try!':result.title)}</h2><p>${escapeHtml(txt||'')}</p><div class="modal-actions"><button class="btn primary" id="resultNext">${won?'Next level →':'🔁 Retry level'}</button><button class="btn secondary" id="resultHome">🏠 Arcade</button></div></div>`);
 $('resultNext').addEventListener('click',()=>{dismiss();if(won)activeGame.next();else if(typeof activeGame.retry==='function')activeGame.retry();else activeGame.restart()});$('resultHome').addEventListener('click',()=>page('home'));
}
function loadLab(){labStreak=0;question=null;renderLabReport();if(FG.store.loadError){$('lab-question').textContent=FG.store.loadError;$('lab-controls').replaceChildren();return}nextLab()}
function renderLabReport(){FG.learning.renderReport($('skill-report'));}
function nextLab(){
 $('lab-controls').replaceChildren();
 FG.learning.mount($('lab-question'),{profile:FG.store.current(),context:{gameId:'math-lab',projectId:'math-lab',mode:'both'},mode:'both',legacyIds:false,onSave:renderLabReport,onComplete:()=>{
   renderLabReport();const b=document.createElement('button');b.id='lab-next';b.className='btn primary';b.textContent='Try another →';b.onclick=nextLab;$('lab-controls').replaceChildren(b);b.focus();
 }});
}
function renderFeedback(){const box=$('feedbackList');box.replaceChildren();const list=FG.store.data.feedback;
 if(!list.length){const p=document.createElement('p');p.className='muted';p.textContent='Your treasure chest is ready! Tap Create to save your first game dream.';box.append(p);return}
 list.slice(0,30).forEach(i=>{const node=document.createElement('div');node.className='idea';const title=document.createElement('b');title.textContent=`${i.game.toUpperCase()} · ${i.type}`;const desc=document.createElement('p');desc.textContent=i.idea;const stamp=document.createElement('small');stamp.textContent=new Date(i.createdAt).toLocaleDateString();const actions=document.createElement('div');actions.className='idea-actions';
  node.append(title,desc,stamp,actions);box.append(node)})}

function populateSkills(){
 const selected=$('parentSkill').value,grade=Number($('parentGrade').value);$('parentSkill').replaceChildren();
 const all=document.createElement('option');all.value='';all.textContent='Let the learning model choose';$('parentSkill').append(all);
 for(const skill of FG.learning.skills.filter(x=>x.grade<=grade)){const o=document.createElement('option');o.value=skill.id;o.textContent=`Grade ${skill.grade} · ${skill.title}`;$('parentSkill').append(o);}
 if([...$('parentSkill').options].some(x=>x.value===selected))$('parentSkill').value=selected;
 const multiplication=grade>=3;for(const o of $('parentFocus').options)if(['times8','mul','div'].includes(o.value))o.disabled=!multiplication;
 $('parentFacts').disabled=!multiplication;if(!multiplication&&['times8','mul','div'].includes($('parentFocus').value))$('parentFocus').value='adaptive';
}
function loadParent(){
 const p=FG.store.current();$('parentFacts').value=(p.factTargets||[]).map(x=>x.replace('mul:','')).join(', ');$('parentNickname').value=p.name;$('parentGrade').value=String(p.grade||1);$('parentFocus').value=p.focus;$('parentIntensity').value=p.intensity;$('parentRate').value=String(Math.max(1,p.rate||3));$('parentRateValue').textContent=$('parentRate').value;$('parentHint').checked=!!p.hints;$('parentPunish').checked=!!p.punish;
 populateSkills();$('parentSkill').value=p.skillFocus?.[0]||'';FG.learning.renderReport($('parentStats'),p);
}
function saveParent(){
 const grade=Number($('parentGrade').value),facts=grade>=3?$('parentFacts').value.split(',').map(x=>x.trim().replace('×','x')).filter(Boolean):[];
 if(facts.length>20||facts.some(x=>!/^(?:[1-9]|1[0-2])x(?:[1-9]|1[0-2])$/.test(x))){alert('Use up to 20 facts like 8x7, with numbers from 1 to 12. Settings have not changed.');return;}
 try{FG.store.changeProfile({name:$('parentNickname').value,grade,focus:$('parentFocus').value,skillFocus:$('parentSkill').value?[$('parentSkill').value]:[],intensity:$('parentIntensity').value,rate:Number($('parentRate').value),hints:$('parentHint').checked,punish:$('parentPunish').checked,factTargets:facts.map(x=>'mul:'+x)});profiles();loadParent();alert('Settings saved on this browser. Math stays part of every game.');}catch(error){alert(error.message);}
}
function download(text,name){const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
let wizardStep=0;
function designCard(){return ['My game: '+$('inventIdea').value.trim(),'Players: '+$('inventAction').value,'Win: '+($('inventWin').value.trim()||'Find a joyful goal together'),'Surprise: '+($('inventFunny').value.trim()||'Dream one up later'),'Art: '+$('inventArt').value].join('\n')}
function showWizard(){document.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==wizardStep);$('wizardProgress').textContent=`Step ${wizardStep+1} of 3 · ${['Dream','Choose','Save'][wizardStep]}`;$('wizardBack').hidden=wizardStep===0;$('wizardNext').hidden=wizardStep===2;$('wizardSave').hidden=wizardStep!==2;$('ideaPreview').textContent=designCard();const legend=document.querySelector(`[data-step="${wizardStep}"] legend`);legend.tabIndex=-1;legend.focus()}
function loadRemix(){$('remixDifficulty').value=FG.store.current().remixes?.[$('remixGame').value]||'classic';$('remixStatus').textContent='';describeRemix()}
function describeRemix(){const descriptions={gum:{gentle:'Matching pieces glow to help you build.',classic:'Find the matching pieces yourself.',stretch:'More extra pieces in your junk pile!'},buckets:{gentle:'A star shows the safe bucket. Follow the clue!',classic:'Pick a bucket and see what happens!',stretch:'Four buckets and only one keeps you dry!'},dragon:{gentle:'More hearts and slower dragon breath.',classic:'The original dragon adventure.',stretch:'Fewer hearts and faster dragon breath!'}};$('remixDescription').textContent=descriptions[$('remixGame').value][$('remixDifficulty').value]}
function bind(){document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>gameOpen(b.dataset.game)));$('homeBtn').onclick=()=>page('home');$('playFeatured').onclick=()=>gameOpen('gum');$('exitGame').onclick=()=>page('home');$('improveThis').onclick=()=>{if(activeGameId){$('feedbackGame').value=activeGameId;$('remixGame').value=activeGameId}page('feedback')};$('gameHelp').onclick=()=>alert(FG.games[activeGameId]?.controls||'Use the controls shown in the game');
 if(FG.store.loadError){const notice=document.createElement('section');notice.id='storageRecovery';notice.className='panel learning-save-warning';notice.setAttribute('role','alert');const message=document.createElement('p');message.textContent=FG.store.loadError;const exportButton=document.createElement('button');exportButton.className='btn secondary';exportButton.textContent='Save original progress for recovery';exportButton.onclick=()=>download(FG.store.recoveryRaw,'family-game-factory-recovery.json');notice.append(message,exportButton);document.querySelector('main').prepend(notice);}
 $('parentGrade').onchange=populateSkills;$('parentRate').oninput=e=>$('parentRateValue').textContent=e.target.value;$('saveParent').onclick=saveParent;
 $('feedbackForm').onsubmit=e=>{e.preventDefault();const worked=FG.store.addFeedback({game:$('feedbackGame').value,type:$('feedbackType').value,idea:$('feedbackText').value});if(!worked)$('feedbackStatus').textContent='Could not save. Keep your idea here and try again.';if(worked){$('feedbackText').value='';$('feedbackStatus').textContent='💡 Saved! Find it in My Creations.'}};
 $('inventForm').onsubmit=e=>{e.preventDefault();if(wizardStep!==2)return;const worked=FG.store.addFeedback({game:'new',type:'new game design',idea:designCard()});if(worked){$('inventForm').reset();wizardStep=0;showWizard();page('creations')}else $('createStatus').textContent='Your idea could not be saved. Keep it here and try again.'};
 $('wizardNext').onclick=()=>{if(wizardStep===0&&!$('inventIdea').reportValidity())return;wizardStep=Math.min(2,wizardStep+1);showWizard()};$('wizardBack').onclick=()=>{wizardStep=Math.max(0,wizardStep-1);showWizard()};showWizard();
 $('remixGame').onchange=loadRemix;$('remixDifficulty').onchange=describeRemix;
 $('playRemix').onclick=()=>{const p=FG.store.current(),before=p.remixes;p.remixes={...p.remixes,[$('remixGame').value]:$('remixDifficulty').value};if(!FG.store.save()){p.remixes=before;$('remixStatus').textContent='Could not save your remix. Please try again.';return}gameOpen($('remixGame').value)};
 $('copyFeedback').onclick=async()=>{const data=FG.store.data.feedback;if(!data.length){alert('Save an idea first.');return}const txt=FG.bridge.developmentBrief(data);try{await navigator.clipboard.writeText(txt);alert('Copied! Paste into your ChatGPT game development conversation.')}catch(e){window.prompt('Copy these ideas:',txt)}};
 $('exportData').onclick=()=>download(FG.store.recoveryRaw||JSON.stringify({...FG.store.data,factoryWorkspace:FG.factory?.exportWorkspace()},null,2),'family-game-factory-progress.json');$('importData').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(!confirm('Replace the current profiles, math progress and ideas with the imported backup?'))return;try{const raw=await file.text(),backup=JSON.parse(raw);if(backup.factoryWorkspace)FG.factory?.validateWorkspace(backup.factoryWorkspace);FG.store.restore(raw);if(backup.factoryWorkspace)FG.factory?.restoreWorkspace(backup.factoryWorkspace);profiles();loadParent();$('storageRecovery')?.remove();alert('Progress restored successfully.')}catch(err){alert('Could not restore backup: '+err.message)}finally{e.target.value=''}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();profiles();page('home')});else{bind();profiles();page('home')}
FG.app={page,openGame:gameOpen};
})();
