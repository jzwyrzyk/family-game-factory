import './brand/icons.css';
import './legacy/store.js';
import './adult-pilot/style.css';
import './learning/bootstrap';
import './legacy/bridge.js';
import './runtime/registry';
import './legacy/ui.js';
import {installProblemSolvingEvidence} from './problem-solving/bridge';
import {installProblemSolvingProgress} from './problem-solving/progress';
import {initLiveRemix} from './factory/ui';
import {initBuilder} from './builder/ui';
import {installAdultProfile} from './adult-pilot/ui';
import {installJemsDelight} from './brand/delight';
import './brand/delight.css';
import './brand/journey.css';
import {installOffline} from './offline';
import {installDrawings} from './assets/ui';
import {installQualityCards} from './quality/cards';
import {installStudio} from './studio/ui';
import {installStudioHostNavigation} from './studio/host-navigation';
import {installRewardWriteGuard,setRewardSourceMaintenance} from './rewards/write-guard';
import {installParentDashboard} from './parent/ui';
import {installRewards} from './rewards/service';
import {recoverRewardBackup,hasPendingRewardBackup,installRewardBackupControls} from './rewards/backup';

// Recovery finishes before a stale in-memory source can save or mint rewards.
setRewardSourceMaintenance(true);
void installRewardWriteGuard().then(async writable=>{
  if(!writable)return;
  await recoverRewardBackup();
  if(hasPendingRewardBackup())return; // Recovery is reloading the document.
  setRewardSourceMaintenance(false);
  installProblemSolvingEvidence();
  const rewards=installRewards();
  installRewardBackupControls(rewards);
  initLiveRemix();
  void initBuilder().then(installAdultProfile);
  installJemsDelight();installOffline();installDrawings();installQualityCards();installParentDashboard();installProblemSolvingProgress();
  await installStudio();installStudioHostNavigation();
}).catch(error=>{
  setRewardSourceMaintenance(true);
  for(const element of document.querySelectorAll<HTMLElement>('main,.site-header'))element.inert=true;
  const recovery=document.createElement('section');recovery.id='jemsStartupRecovery';recovery.setAttribute('role','alert');
  Object.assign(recovery.style,{position:'fixed',inset:'16px',zIndex:'10001',padding:'28px',background:'#fff',borderRadius:'20px',overflow:'auto'});
  const title=document.createElement('h1');title.textContent='Let’s recover your saved progress';
  const message=document.createElement('p');message.textContent=error instanceof Error?error.message:'Jems could not safely open saved progress. Your stored data has not been discarded.';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Try reloading Jems';retry.style.minHeight='48px';retry.onclick=()=>location.reload();
  recovery.append(title,message,retry);document.body.append(recovery);retry.focus();
});
