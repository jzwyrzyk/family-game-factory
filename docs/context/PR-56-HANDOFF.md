# PR #56 — bounded recovery handoff

Observed: 2026-11-19T08:01:54-05:00. This records Batch 1 only; no game changes, tests, merge or deployment were performed.

## Verified remote state

- Repository: jzwyrzyk/family-game-factory.
- PR: https://github.com/jzwyrzyk/family-game-factory/pull/56 — open, unmerged, non-draft; API reports mergeable=false.
- PR branch: feature/mind-your-jems-wait-arcade.
- PR head: 319b2df2d3e689162d7a49a2916cecfccbe562de.
- PR metadata base SHA: 493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7. Current main was not separately refreshed in this bounded batch.
- The live PR changed-file list has 10 paths and no illustrated assets under public/art/mind-your-jems/. A remote branch search for pr56 returned no matches.
- This handoff is saved on a separate documentation branch. Its commit is not the recovered game commit and does not advance PR #56.

## Verified local source

- Newest clean recovery baseline (two older dirty files still need reconciliation): `/workspace/scratch/7beeec09c8eb/pr56-recovery`.
- Branch: `fix/pr56-batch-1`.
- Code commit: `f4ed3f9517d2cd443d71d2ae809ce966c72859af`.
- Code tree: `0f546922b72c55887959cbf37e2e3ff293ea0e47`.
- Worktree status: clean.
- Live PR head is an ancestor of the recovery commit: True.
- The older pr56-complete checkout has four unstaged modifications. Its game CSS and game TypeScript match the clean recovery baseline byte for byte. Its Studio UI and browser test differ; their intent has not been compared. Do not discard either version. The appendix preserves all four changes as a patch against ab68a88c15a5691239c0031ff97a3660ceca347c.
- Local code/assets are present and committed in the recovery checkout; remote delivery of this recovered tree is not established. Preserve these checkouts until Batch 2 verifies the upload.

| Copy | Branch | Commit | Working tree |
| --- | --- | --- | --- |
| /workspace/scratch/7beeec09c8eb/pr56-recovery | fix/pr56-batch-1 | f4ed3f9517d2cd443d71d2ae809ce966c72859af | 0 changed/untracked paths |
| /workspace/scratch/411980fa3e1b/pr56-complete | fix/pr56-complete-illustrated | ab68a88c15a5691239c0031ff97a3660ceca347c | 4 changed/untracked paths |
| /workspace/scratch/5d90b3a940aa/mind-your-jems | fix/mind-your-jems-delivery | ab68a88c15a5691239c0031ff97a3660ceca347c | 0 changed/untracked paths |
| /workspace/scratch/f9c68f25c305/game-fix | feature/mind-your-jems-wait-arcade | 3c166ac5a4df95351860af7bb222b39cb6a5abcf | 0 changed/untracked paths |

## References and assets

- Existing historical checkpoint: `docs/mind-your-jems/RECOVERY-CHECKPOINT.md` in the recovery checkout. Its older three-batch plan is superseded by this bounded sequence.
- Feature contract and design intent: `docs/mind-your-jems/README.md`; reference storyboard: `docs/mind-your-jems/reference-storyboard.png`.
- Illustrated art: `public/art/mind-your-jems/`; generation/provenance notes: `scene-art.md` and `miner-props-art.md` in that directory.
- Local font: `public/fonts/fredoka/`; reviewed browser image baselines: `tests/visual/mind-your-jems/`.
- Preserve the cheerful miner, expressive lavender rock giant, pink/mint hair, glossy crystals, purple/gold cart and floating-island world. Compare actual play to the storyboard before claiming visual acceptance.
- Tracked asset/reference paths:
  - `docs/mind-your-jems/reference-storyboard.png`
  - `public/art/mind-your-jems/cart-empty.webp`
  - `public/art/mind-your-jems/miner-poses.webp`
  - `public/art/mind-your-jems/miner-props-art.md`
  - `public/art/mind-your-jems/props-atlas.webp`
  - `public/art/mind-your-jems/rock-expressions.webp`
  - `public/art/mind-your-jems/scene-art.md`
  - `public/art/mind-your-jems/scene-sky.webp`
  - `public/fonts/fredoka/Fredoka-Variable.ttf`
  - `public/fonts/fredoka/OFL.txt`

## Evidence boundary

- This batch inspected Git state, tracked assets, local file equality, existing documentation and live PR metadata/file names.
- No build, tests, browser session, screenshot review or CI verification was run. Prior reported passing results remain historical and are not newly certified.
- There is no identified need to regenerate existing art before inspecting the recovered version. Merge conflicts/main drift still need a bounded reconciliation in the delivery batch.

## Next action — Batch 2 only

Start from the clean recovery checkout and exact code commit above. First reconcile its src/studio/ui.ts and tests/mind-your-jems-browser.cjs with the preserved older uncommitted changes; do not blindly overwrite either version. Recheck the live PR head and local status, preserve concurrent changes, and deliver the recovered source/assets to the PR branch. Reconcile current main only as needed for safe delivery. Verify the remote source tree and PR head. Do not redesign, merge or deploy.

At most 10 substantive operations, with up to 3 additional checkpoint operations. If publishing or reconciliation exceeds that budget, save the partial state and name the exact blocker. End with a final response; do not begin the next batch.

Remaining batches: 3 scene/art; 4 responsive layout/controls; 5 core mining/banking/shake/grab loop; 6 Studio return/reopen/recovery; 7 exact-commit merge readiness. Each is a separate bounded session; already-complete work needs evidence, not recreation.

## Preserved uncommitted changes

Base commit: `ab68a88c15a5691239c0031ff97a3660ceca347c`. Original checkout remains untouched. This patch preserves local deltas, not the full illustrated game or its binary assets. Inspect before applying; parts are already present in the clean recovery baseline.

Patch SHA-256: `d3a308c509e4724df95779babf0a4ee6cc8849740e488a3d6224c41a22afc024`.

<details>
<summary>Recovery patch (four modified source/test files)</summary>

```diff
diff --git a/src/games/mind-your-jems.css b/src/games/mind-your-jems.css
index bf91651..8a51ade 100644
--- a/src/games/mind-your-jems.css
+++ b/src/games/mind-your-jems.css
@@ -24,6 +24,10 @@
 @keyframes myj-breathe{50%{transform:translateY(3px) rotate(.25deg)}}@keyframes myj-glint{0%,70%,100%{opacity:.25;scale:.65}85%{opacity:1;scale:1.12}}@keyframes myj-picked{40%{transform:translate(-50%,-58%) rotate(var(--gem-tilt)) scale(.86);filter:brightness(1.3)}70%{transform:translate(-50%,-50%) rotate(var(--gem-tilt)) scale(1.1)}}@keyframes myj-strike{30%{transform:rotate(-5deg)}65%{transform:translate(4%,5%) rotate(4deg)}}@keyframes myj-cheer{50%{transform:translateY(-6px) rotate(-3deg)}}@keyframes myj-slip{20%{transform:translate(1%,10%) rotate(10deg)}70%{transform:translate(-9%,60%) rotate(-14deg)}100%{transform:translate(0,28%) rotate(-4deg)}}@keyframes myj-cart-bounce{30%{transform:translateY(5px) scale(1.02,.97)}65%{transform:translateY(-4px)}}@keyframes myj-anticipation{50%{transform:rotate(-1.2deg) translateY(-3px)}}@keyframes myj-shake{0%,100%{transform:translate(-5px,1px) rotate(-1.3deg)}50%{transform:translate(5px,-1px) rotate(1.3deg)}}@keyframes myj-fly{0%{opacity:1;transform:translate(-50%,-50%) scale(.7)}30%{opacity:1;scale:1.15}85%{opacity:1}100%{opacity:0;transform:translate(calc(var(--fly-x) - 50%),calc(var(--fly-y) - 50%)) rotate(70deg) scale(.55)}}@keyframes myj-arrive{from{opacity:0;transform:translateY(12px) scale(.95)}to{opacity:1;transform:none}}
 .myj-arcade[data-ready=true] .myj-cart-label{visibility:hidden}.myj-arcade[data-ready=true] .myj-notice{bottom:150px}
 .myj-is-paused *{animation-play-state:paused!important}
+/* Compact ready actions move out of the scene. Keep feedback below the eyes
+   and crystals instead of inheriting the desktop ready-card clearance. */
+@media(max-width:600px) and (max-height:720px) and (orientation:portrait){.myj-arcade[data-ready=true] .myj-notice{bottom:12px}}
+@media(max-height:600px) and (orientation:landscape){.myj-arcade[data-ready=true] .myj-notice{bottom:7px}}
 @media(max-width:1100px){.myj-header{gap:12px;padding:8px 16px;min-height:69px}.myj-logo{width:148px;height:48px}.myj-wait-pill{font-size:12px;padding:8px 11px}.myj-build{font-size:13px}.myj-title h2{font-size:clamp(35px,4.5vw,55px)}.myj-score>div{min-width:112px;padding:7px 8px 7px 3px;border-radius:19px}.myj-score .myj-sprite{width:38px;height:38px}.myj-score>div>span:last-child{font-size:13px}.myj-score strong{font-size:31px}.myj-controls{padding:12px 18px 9px;column-gap:12px;grid-template-columns:1fr auto 46px}.myj-action{font-size:18px!important;padding:10px 19px}.myj-head-anchor{width:min(68%,calc(100dvh - 190px));left:49%;bottom:-10%}.myj-cart-hit{width:26%;bottom:15%;right:0}.myj-notice{font-size:14px}}
 @media(max-aspect-ratio:1/1){.myj-arcade{width:calc(100vw - 20px);height:min(1100px,calc(100dvh - 20px));max-height:calc(100dvh - 20px);border-radius:24px}.myj-header{flex-wrap:wrap;gap:10px;padding:10px 16px;min-height:93px}.myj-logo{width:150px;height:45px}.myj-wait-pill{margin-left:auto}.myj-build{order:5;flex-basis:100%;justify-content:center;margin:-1px 0 0;font-size:14px}.myj-sound{margin-left:0}.myj-close{margin-left:0}.myj-title{left:5%;top:4%;width:40%}.myj-title h2{font-size:clamp(43px,6.7vw,64px)}.myj-title-spark{right:5%;top:58%}.myj-score{top:5%;right:4%;flex-direction:column;gap:9px}.myj-score>div{min-width:135px}.myj-head-anchor{width:95%;max-width:none;left:45%;bottom:-11%}.myj-cart-hit{width:32%;bottom:13%;right:-1%}.myj-cart-label{font-size:19px;padding:7px 13px}.myj-speech{top:15%;left:40%;font-size:24px;padding:15px 18px}.myj-controls{grid-template-columns:1fr auto 44px;padding:14px 18px 11px;gap:10px}.myj-action{font-size:20px!important}.myj-mission strong{font-size:13px}.myj-ready{bottom:130px;right:17px}.myj-notice{max-width:90%;font-size:15px}}
 @media(max-width:600px) and (orientation:portrait){.myj-arcade{width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:0}.myj-header{padding:8px 12px 9px;gap:8px;min-height:100px}.myj-logo{width:120px;height:40px}.myj-wait-pill{font-size:10px;padding:7px 8px;gap:4px;margin-left:auto}.myj-wait-pill svg{width:14px;height:14px}.myj-icon-button{width:44px;height:44px}.myj-icon-button svg{width:20px;height:20px}.myj-sound{position:absolute;top:52px;right:13px;width:44px;height:44px;border:0;background:transparent}.myj-build{font-size:12px;margin:0 28px 0 0}.myj-build-dot{width:7px;height:7px;box-shadow:0 0 0 4px #12bbad18}.myj-title{left:6%;top:4%;width:46%;}.myj-title h2{font-size:clamp(34px,9vw,47px);-webkit-text-stroke-width:6px}.myj-title h2 span{-webkit-text-stroke-width:6px}.myj-title h2 em{-webkit-text-stroke-width:7px}.myj-title-spark{font-size:26px;right:-5%;top:62%}.myj-score{top:4%;right:4%;gap:7px}.myj-score>div{min-width:110px;border-width:2px;border-radius:17px;padding:5px 8px 5px 2px;gap:2px}.myj-score .myj-sprite{width:34px;height:34px}.myj-score>div>span:last-child{font-size:11px}.myj-score strong{font-size:26px}.myj-score small{font-size:14px}.myj-head-anchor{width:118%;left:46%;bottom:1%}.myj-miner-anchor{width:36%;left:7%;top:0}.myj-gem{width:14%;min-width:44px;min-height:44px}.myj-gem-value{min-width:22px;font-size:11px;bottom:7%;right:0;padding:0 3px;border-width:1.5px}.myj-gem-glint{font-size:19px}.myj-ladder{left:5%;top:29%;width:33%}.myj-cart-hit{width:36%;right:-1%;bottom:8%}.myj-cart-label{font-size:15px;padding:5px 9px;gap:3px;border-width:2px;border-radius:12px}.myj-cart-label svg{width:17px;height:17px}.myj-cart-pile{top:2%}.myj-speech{display:none}.myj-notice{font-size:13px;max-width:92%;width:max-content;bottom:12px;padding:7px 12px;line-height:1.2}.myj-controls{grid-template-columns:1fr 44px;padding:10px 13px max(10px,env(safe-area-inset-bottom));column-gap:8px;row-gap:8px}.myj-mission{grid-column:1;max-width:none;gap:7px}.myj-mission-icon{width:27px;height:27px;border-radius:10px;font-size:21px;box-shadow:0 2px 0 #e9ce8e}.myj-mission strong{font-size:12px}.myj-goal-track{height:7px;margin-top:3px;max-width:240px}.myj-help-toggle{grid-column:2;grid-row:1;width:44px;height:44px;font-size:19px!important}.myj-actions{grid-column:1/-1;grid-row:2;width:100%;gap:8px}.myj-action{flex:1;min-height:52px;padding:8px 12px;border-radius:18px;font-size:20px!important;gap:7px}.myj-action svg{width:21px;height:21px}.myj-is-warning .myj-action,.myj-is-shaking .myj-action{font-size:17px!important;padding:9px 7px;gap:5px}.myj-is-warning .myj-action-bank>svg:last-child,.myj-is-shaking .myj-action-bank>svg:last-child{display:none}.myj-tips{font-size:11px;line-height:1.25;margin:2px 4px 0}.myj-ready{bottom:163px;left:12px;right:12px;width:auto;max-width:none;padding:14px 12px;border-width:3px;border-radius:20px;gap:8px}.myj-ready strong{font-size:22px}.myj-ready small{font-size:11px}.myj-ready button{font-size:16px;padding:9px 10px;min-height:50px;gap:2px}.myj-ready button svg{width:18px}.myj-ready-star{font-size:36px;top:-24px;left:17px}.myj-build-problem{bottom:163px;font-size:12px;gap:8px;padding:10px}.myj-build-problem span{max-width:185px}.myj-exit{font-size:12px!important;padding:6px 9px}.myj-exit svg{width:17px}.myj-help{right:10px;bottom:calc(100% + 10px);font-size:14px;padding:17px;line-height:1.35}}
diff --git a/src/games/mind-your-jems.ts b/src/games/mind-your-jems.ts
index 415da54..903a2ea 100644
--- a/src/games/mind-your-jems.ts
+++ b/src/games/mind-your-jems.ts
@@ -8,6 +8,7 @@ export type ArcadeLaunch = {
   status:WorkshopStatus;
   isReady:boolean;
   onPlayReady:()=>void;
+  onBackToStudio?:()=>void;
   onClose?:()=>void;
 };
 export type WaitArcade = {
@@ -218,7 +219,11 @@ export function createMindYourJems():WaitArcade {
   // Cleanup is synchronous. A delayed native close event cannot reset a reopened session.
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   dialog.addEventListener('close',()=>{if(!dialog.open&&current){const onClose=current.onClose;stop();onClose?.();}});
-  dialog.querySelectorAll<HTMLButtonElement>('.myj-close,.myj-exit').forEach(b=>b.addEventListener('click',close));
+  btn('.myj-close').addEventListener('click',close);
+  btn('.myj-exit').addEventListener('click',()=>{
+    const callback=current?.onBackToStudio;
+    close();callback?.();
+  });
   bank.addEventListener('click',()=>{
     const count=state.loose,before=state.banked;if(!move({type:'bank'}))return;
     const from=el('.myj-score-loose').getBoundingClientRect(),to=cart.getBoundingClientRect();
diff --git a/src/studio/ui.ts b/src/studio/ui.ts
index f194a89..8fc1ef7 100644
--- a/src/studio/ui.ts
+++ b/src/studio/ui.ts
@@ -170,6 +170,10 @@ export async function installStudio(){
    projectName:s.name,status:unknownJobs.has(s.id)?'reconnecting':latest.job.status as WorkshopStatus,
    isReady:!!ready,
    onClose:()=>{waitProject=null;if(activeId&&owner()===s.owner&&route==='studio')render();},
+   onBackToStudio:()=>act(async()=>{
+    if(owner()!==s.owner)return;
+    await open(s.id,false);
+   }),
    onPlayReady:()=>act(async()=>{
     if(owner()!==s.owner)return;
     const fresh=notebook.get(s.id,s.owner),candidate=readyExperiment(fresh);
diff --git a/tests/mind-your-jems-browser.cjs b/tests/mind-your-jems-browser.cjs
index d39d0c8..63fcbce 100644
--- a/tests/mind-your-jems-browser.cjs
+++ b/tests/mind-your-jems-browser.cjs
@@ -31,7 +31,15 @@ async function geometry(journey,device,review){
   // need not expose an unavailable cart through itself.
   const stage=dialog.querySelector('.myj-stage'),targets=[...dialog.querySelectorAll('button')].filter(element=>
    element.getClientRects().length&&getComputedStyle(element).visibility==='visible'&&!element.closest('[inert]'));
+  const notice=dialog.querySelector('.myj-notice-visible'),rock=rect(dialog.querySelector('.myj-rock'));
+  const compactReady=dialog.dataset.ready==='true'&&((innerWidth<=600&&innerHeight<=720&&innerHeight>=innerWidth)||(innerHeight<=600&&innerWidth>innerHeight));
+  // The illustrated eye region has stable coordinates in every atlas frame.
+  // Check visible overlap explicitly: pointer-events:none feedback can still
+  // hide a crystal while the native hit-target test reports it reachable.
+  const feedback=compactReady&&notice&&notice.textContent.trim()?{text:notice.textContent.trim(),...rect(notice),
+   eyes:{x:rock.x+rock.width*.25,y:rock.y+rock.height*.42,right:rock.x+rock.width*.8,bottom:rock.y+rock.height*.65}}:null;
   return {phase:dialog.dataset.phase,ready:!dialog.querySelector('[data-myj="ready"]').hidden,viewport:{width:innerWidth,height:innerHeight},dialog:rect(dialog),stage:rect(stage),
+   feedback,
    overflow:{horizontal:dialog.scrollWidth-dialog.clientWidth,vertical:dialog.scrollHeight-dialog.clientHeight},
    targets:targets.map(element=>{const box=rect(element),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {
     label:element.getAttribute('aria-label')||element.textContent.trim(),...box,enabled:!element.disabled,
@@ -51,6 +59,12 @@ async function geometry(journey,device,review){
   }
   if(target.crystal)assert.ok(target.x>=details.stage.x-1&&target.y>=details.stage.y-1&&target.right<=details.stage.right+1&&target.bottom<=details.stage.bottom+1,device.name+' crystal remains inside the visible scene');
  }
+ if(details.feedback){
+  const toast=details.feedback,intersects=box=>Math.min(toast.right,box.right)-Math.max(toast.x,box.x)>1&&Math.min(toast.bottom,box.bottom)-Math.max(toast.y,box.y)>1;
+  for(const target of details.targets.filter(target=>target.crystal&&target.enabled))assert.ok(!intersects(target),device.name+' ready feedback leaves active crystal art visible: '+target.label);
+  assert.ok(!intersects(toast.eyes),device.name+' ready feedback leaves the rock eyes visible');
+  review.check(device.name,'ready-feedback-clearance',{text:toast.text,crystals:details.targets.filter(target=>target.crystal&&target.enabled).length,eyesClear:true});
+ }
 }
 
 async function assertScrollRestored(journey){
@@ -177,6 +191,7 @@ async function exercise(journey,device,review){
  await journey.activate(arcade.locator('[data-myj="bank-cart"]'));
  assert.equal(await journey.score('banked'),readyScore+1,'ready notification leaves the mining and cart controls playable');
  assert.equal(await journey.score('loose'),0);
+ await geometry(journey,device,review);
  await capture('ready-playing');
  await journey.activate(arcade.locator('[data-myj="play-ready"]'));
  // The newly attached sandbox frame has its own animation frames and preview
@@ -224,6 +239,16 @@ async function recovery(journey,device,review){
   assert.equal(await arcade.locator('[data-myj="retry-art"]').isVisible(),false);
   await review.capture(page,arcade,device.name,'art-recovered');
  }
+ // Background builds also expose the arcade from My Games. Its terminal
+ // recovery action must return to the affected project, not just dismiss the
+ // dialog onto whichever library page happened to launch it.
+ await journey.activate(arcade.locator('.myj-close'));await assertScrollRestored(journey);
+ await journey.activate(page.locator('#studioNavHome'));
+ assert.equal(await page.locator('#page-studio-library').isVisible(),true,'recovery fixture starts from My Games');
+ const shelfLaunch=page.locator('#studioBuildShelf .studio-wait-arcade-button');
+ await shelfLaunch.waitFor({state:'visible'});await journey.activate(shelfLaunch);await journey.advance(50);
+ assert.equal(await arcade.isVisible(),true,'the acknowledged build can launch its arcade from the global shelf');
+ assert.equal(await journey.score('banked'),0,'a reopened shelf session starts cleanly');
  await journey.activate(arcade.locator('[data-crystal="3"]'));await journey.advance(450);
  await journey.activate(arcade.locator('[data-myj="bank"]'));
  assert.equal(await journey.score('banked'),3);
@@ -270,8 +295,11 @@ async function recovery(journey,device,review){
  }
  await journey.activate(arcade.locator('.myj-exit'));
  assert.equal(await arcade.isVisible(),false,'Back to Studio closes the mini-game');await assertScrollRestored(journey);
+ assert.equal(await page.locator('#page-studio').isVisible(),true,'Back to Studio opens the affected project from the library');
+ assert.equal(await page.locator('#page-studio-library').isVisible(),false,'Back to Studio leaves My Games');
+ assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]),journey.project.id,'terminal recovery opens the project that owns this background build');
  assert.equal(counters.previewRequests,0,'failed and cancelled builds never open a preview');
- review.check(device.name,'build-and-art-recovery',{terminal:device.recoveryTerminal,artRetries:device.artFailure?1:0,interruptedPolls:counters.interruptedPolls,buildRequests:counters.submitted,previewRequests:counters.previewRequests});
+ review.check(device.name,'build-and-art-recovery',{terminal:device.recoveryTerminal,entry:'global-build-shelf',returnedToProject:journey.project.id,artRetries:device.artFailure?1:0,interruptedPolls:counters.interruptedPolls,buildRequests:counters.submitted,previewRequests:counters.previewRequests});
 }
 
 async function profileReset(journey,device,review){
```

</details>
