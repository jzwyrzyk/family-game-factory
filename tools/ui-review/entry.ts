import {mountDesignSystemGallery} from '../design-system/gallery';
import '../../src/style.css';
import {parentDashboardFixture} from '../../tests/parent-dashboard-fixture';
import {StudioNotebook} from '../../src/studio/notebook';
import {CREATION_KEY} from '../../src/creation/storage';
import {RevisionStore} from '../../src/factory/workspace';
import {defaults} from '../../src/runtime/manifests';
import {RewardsStore, REWARDS_DB_NAME} from '../../src/rewards/store';
import {createRewardFact} from '../../src/rewards/model';
import {PalsStore, PALS_DB_NAME} from '../../src/pals/store';
import {PAL_CATALOG} from '../../src/pals/catalog';
import {palSnapshotFromRewards} from '../../src/pals/service';
import {PROBLEM_SOLVING_KEY} from '../../src/problem-solving/model';
const w=window as any,config=w.__reviewConfig;
const fixture=parentDashboardFixture(Date.now());
const empty=['first-time','empty'].includes(config.scenario);
if(!localStorage.getItem('family-game-factory-state-v1')){
 for(const p of fixture.state.profiles as any[]){p.name=p.id==='player1'?'Demo Explorer':'Demo Sibling';p.grade=Number(config.grade);p.learningSetupComplete=config.scenario!=='first-time';p.allowSubjectSwitch=true;if(empty){delete p.learning;delete p.language;p.skills={};p.stats={};}}
 localStorage.setItem('family-game-factory-state-v1',JSON.stringify(fixture.state));
 if(!empty){localStorage.setItem(CREATION_KEY,JSON.stringify(fixture.creation));localStorage.setItem(PROBLEM_SOLVING_KEY,JSON.stringify(fixture.problemSolving));}
 const book=new StudioNotebook(localStorage);
 if(config.scenario!=='first-time'){book.setAvatar('player1','spark');book.dismissGuideTip('player1','studio-intro');}
 if(['populated','long-content','unlocked'].includes(config.scenario)){
  const games=new RevisionStore(localStorage);
  const count=config.scenario==='long-content'?16:3;
  for(let i=0;i<count;i++){const game=(['factory','hill','buckets'] as const)[i%3];const name=(config.scenario==='long-content'?'A wonderfully long demonstration title for our saved workshop experiment ': 'Demo creation ')+(i+1);const p=games.create('player1',game,name,defaults(game));const session=book.create('player1',game,name,p.id);book.update(session.id,'player1',s=>{s.draft='A saved synthetic idea to continue.';});}
 }

}
// Dynamic import is bundled into this same IIFE; initialization follows fixtures.
async function boot(){
 if(['unlocked','populated'].includes(config.scenario)){
  const rewards=new RewardsStore(REWARDS_DB_NAME),pals=new PalsStore(PALS_DB_NAME);
  const before=palSnapshotFromRewards(await rewards.export(),'player1');
  await pals.chooseStarter('player1',PAL_CATALOG[0].id,before);
  const facts=Array.from({length:config.scenario==='unlocked'?200:8},(_,i)=>createRewardFact({owner:'player1',kind:'math.completed',sourceId:'ui-review-'+i,occurredAt:Date.now()+i}));
  await rewards.project('player1',facts);
  await pals.sync('player1',palSnapshotFromRewards(await rewards.export(),'player1'));
 }
 await import('../../src/main');
 w.__reviewDesignSystem=()=>{ for(const page of document.querySelectorAll('.page'))page.classList.add('hidden'); const gallery=mountDesignSystemGallery(document.querySelector('main')!,route=>w.__reviewNavigate(route)); gallery.page.classList.remove('hidden'); gallery.page.querySelector<HTMLElement>('.jems-page-title')?.focus(); };
 const timer=setInterval(()=>{if(w.FG?.studio&&w.FG?.creation){clearInterval(timer);parent.postMessage({type:'review-ready'},'*');}},40);
}
void boot();
