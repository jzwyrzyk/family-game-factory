import assert from 'node:assert/strict';
import type {BrowserContext,Page} from 'playwright';

/** WebKit can report a superseded history navigation as a policy cancellation.
 * This predicate permits checking the resulting document; it proves no access
 * boundary by itself. Every other navigation failure remains a test failure. */
export function isWebKitHistoryCancellation(engine:string,error:unknown):boolean{
 return engine==='webkit'&&error instanceof Error&&/^page\.goBack: Navigation canceled by policy check(?:\r?\n|$)/.test(error.message);
}

export async function assertEndedPlayEntry(page:Page,context:BrowserContext,expectedURL:string):Promise<void>{
 const expected=new URL(expectedURL);assert.equal(expected.pathname,'/grown-ups');
 await page.waitForURL(expectedURL,{waitUntil:'load'});
 await page.getByRole('heading',{name:'Family privacy and profiles',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>document.readyState==='complete');
 const documentState=await page.evaluate(()=>{
  const controls=document.getElementById('familyControls');
  return {url:location.href,origin:location.origin,privateBeta:!!document.querySelector('[data-private-beta]'),hasFG:'FG' in window,hasStore:!!(window as any).FG?.store,
   studio:document.querySelectorAll('#page-studio,#studioLibraryTitle,#studioWelcomeTitle,#studioLibrary,#studioGameHost').length,
   controlsHidden:!!controls&&controls.hidden&&getComputedStyle(controls).display==='none'};
 });
 assert.deepEqual(documentState,{url:expectedURL,origin:expected.origin,privateBeta:false,hasFG:false,hasStore:false,studio:0,controlsHidden:true});
 assert.equal((await context.request.get(expected.origin+'/entry/check',{maxRedirects:0})).status(),401,'Back must not restore the ended play authorization');
 const denied=await context.request.get(expected.origin+'/play/',{maxRedirects:0});
 assert.ok([303,401].includes(denied.status()),'private play remains unavailable after Back');
 if(denied.status()===303)assert.equal(denied.headers().location,'/acknowledge');
}

export async function backToEndedPlayEntry(page:Page,context:BrowserContext,engine:string,expectedURL:string):Promise<void>{
 try{await page.goBack();}catch(error){if(!isWebKitHistoryCancellation(engine,error))throw error;}
 await assertEndedPlayEntry(page,context,expectedURL);
}
