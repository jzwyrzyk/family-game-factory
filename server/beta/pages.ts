import {betaNotice,participationNotice,type BetaConfig} from './model';

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const pic=(file:string,cls:string)=>`<img class="${cls}" alt="" src="/welcome-assets/art/mind-your-jems/${file}.webp">`;
function mining(){
 return `<figure class="mine" aria-label="Mind Your Jems! A little miner rides a smiling rock above a waterfall.">
 ${pic('scene-sky','sky')}<span class="rock">${pic('rock-expressions','sprite')}</span><span class="miner">${pic('miner-poses','sprite')}</span>${pic('cart-empty','cart')}
 <figcaption>Mind Your Jems!</figcaption></figure>`;
}
const label=(name:string,caption:string,type='text',attrs='')=>`<label>${caption}<input name="${name}" type="${type}" required ${attrs}></label>`;
const pass=(newPass=false)=>label('passphrase',newPass?'Choose your parent passphrase':'Parent passphrase','password','minlength="12" maxlength="128" autocomplete="'+(newPass?'new-password':'current-password')+'"');
const code=(name:string,caption:string)=>label(name,caption,'password','maxlength="100" autocomplete="off" spellcheck="false"');
const check=(name:string,caption:string)=>`<label class="check"><input type="checkbox" name="${name}" required><span>${caption}</span></label>`;
const form=(id:string,body:string,action:string)=>`<form method="post" id="${id}">${body}<button class="primary">${action}</button></form>`;
const link=(href:string,label:string,cls='secondary')=>`<a class="${cls}" href="${href}">${label}</a>`;
const terms='<p class="links"><a href="/privacy">Privacy notice</a> · <a href="/terms">Pilot participation terms</a></p>';
export function publicPage(path:string,config:Pick<BetaConfig,'operatorContact'>,family:boolean):string|undefined{
 const welcome=path==='/';let body='',title='Welcome to Jems!',art=false;
 if(welcome){
  art=true;body=`<p class="eyebrow"><span aria-hidden="true">◆</span> Private Family Beta</p><h1>Little creators.<br> <em>Limitless imagination.</em></h1>
   <p class="lead">Dream up games, bring ideas to life and discover the joy of learning.</p><h2>Welcome to Jems!</h2>
   <p>Our workshop is currently open to a small group of invited families.</p><div class="actions">${link('/login','Family login','primary')}${link('/invitation','I have an invitation')}</div>`;
 }else if((path==='/login'||path==='/invitation'||path==='/device'||path==='/recovery')&&!family){
  title='Find your family workshop';body='<h1>'+title+'</h1><p>Use the workshop code your family received privately.</p>'+form('workshop',label('code','Workshop code','text','autocomplete="off" maxlength="36"'),'Open family workshop');
 }else if(path==='/login'){
  art=true;title='Family login';body='<h1>Welcome back!</h1><p role="status" id="checking">Checking this device…</p><div id="loginChoices" hidden>'+link('/device','Connect a trusted device','primary')+' '+link('/recovery','Account recovery')+'</div>';
 }else if(path==='/invitation'||path==='/recovery'){
  art=true;title=path==='/recovery'?'Recover your family account':'Open your invitation';
  body='<h1>'+title+'</h1><p>Use the private code sent to the invited grown-up. Your operator will confirm this device with you separately.</p>'+terms+
   form('redeem',code('invitation',path==='/recovery'?'Recovery code':'New-family invitation code')+pass(true)+check('guardianAffirmed','I am the invited adult guardian. I have read the privacy notice and agree to the pilot participation terms.'),'Pair this device')+
   '<section id="paired" hidden><h2>Confirm your device</h2><p>Share this pairing code with the Jems operator through your established private contact.</p><output></output>'+link('/login','Check approval','primary')+'</section>';
 }else if(path==='/device'){
  title='Connect a trusted device';body='<h1>'+title+'</h1><p>Ask a grown-up on a connected device for a ten-minute device code.</p>'+
   form('device',code('invitation','Trusted-device code')+pass(),'Connect this device');
 }else if(path==='/acknowledge'){
  art=true;title='Parents, a quick check before we play!';body='<h1>'+title+'</h1><p>Jems is an experimental AI-powered learning and game creation experience available to invited families.</p>'+terms+
   form('ack',check('adult','I am an adult parent or legal guardian authorized to participate in this pilot.')+
    check('supervise',"I will supervise my child's use and understand that AI-generated content may contain errors.")+
    check('avoidIdentifying','I will avoid entering personal or identifying information about my child.')+pass(),'Enter Jems')+
    '<p>'+link('/grown-ups','Family privacy and profiles','textlink')+'</p>';
 }else if(path==='/grown-ups'){
  title='Family privacy and profiles';body='<h1>'+title+'</h1>'+form('parentUnlock',pass(),'Unlock family controls')+
   '<section id="familyControls" hidden><h2>Explorer profiles</h2><p>Use a workshop nickname. Jems needs no real name, age or school.</p><div id="profiles"></div><button id="addProfile">Add an explorer</button><h2>Privacy choices</h2>'+terms+
   '<form method="post" id="privacyChoice"><label class="check"><input name="generation" type="checkbox">AI game generation</label><label class="check"><input name="conversation" type="checkbox">AI conversation coaching</label><label class="check"><input name="remoteSpeech" type="checkbox">Remote speech processing</label>'+
   check('guardianAffirmed','I am the authorized parent or guardian.')+check('providerAcknowledged','I have read the processing and provider disclosures for these choices.')+'<button>Request independent verification</button></form><p id="privacyState"></p><button id="withdraw">Withdraw processing consent</button><h2>Copies on your other devices</h2><p>Local play stays on this device. Optional private copies need a separate choice for each kind of work. Turning off copies stops new transfers; existing server copies require the privacy deletion process.</p><p id="storageState"></p><form method="post" id="storageConsent" hidden><fieldset id="storageProfiles"><legend>Explorer profiles to copy</legend></fieldset><fieldset id="storageDomains"><legend>Work to copy privately</legend></fieldset><label class="check"><input type="checkbox" name="acknowledged" required>I understand these copies leave this device and are stored privately by Jems.</label><button>Save my copy choices</button></form><button id="withdrawStorage" hidden>Stop private copies</button><h2>Trusted devices</h2><div id="devices"></div><button id="inviteDevice">Create a ten-minute device code</button><output id="deviceCode"></output><h2>Family export</h2><p>Contact the operator to verify and release your server records. Local saves have a separate family backup in the workshop.</p><button id="familyExport">Download approved family export</button></section><p>'+link('/acknowledge','Continue to play','primary')+'</p>';
 }else if(path==='/about'){title='About Jems';body='<h1>About Jems</h1><p>Jems is a family workshop where children invent games, try ideas, and practice math, English and coding with a grown-up. Creators choose what to keep.</p>'+link('/','Welcome to Jems','primary');}
 else if(path==='/privacy'){title='Family privacy notice';body=`<h1>Family privacy notice</h1><p>Notice version ${betaNotice}</p><p>Your family’s workshop is private. Use nicknames. Leave out real names, birthdays, schools, addresses, photos and identifying voice details.</p>
 <h2>What stays on your device</h2><p>Local play, learning progress, drawings, saved scenes, rewards and notebooks use this browser’s storage. Other devices need an explicit transfer for those local records. If separately released for your family, private copies use only the profiles and data categories you choose in family controls. Participation and AI processing choices do not turn on these copies. Unsent edits stay on this device when you withdraw; previously copied data remains subject to the separately reviewed deletion and backup policy.</p>
 <h2>What Jems keeps</h2><p>Google Cloud hosts family access records, verified consent receipts, budgets and approved remote work in private storage. Jems keeps device credentials as digests. The operator sees access status and usage. The dashboard does not display child conversations.</p>
 <h2>Optional remote processing</h2><p>With separate guardian verification and provider approval, game prompts and selected game context can go to OpenAI through a private worker. Coaching sends the selected conversation context to the approved private coach and OpenAI. Optional remote speech sends the recording to Google Cloud Speech for transcription. Jems saves game revisions and briefly stores coaching replies on its server to recover interrupted requests. The cleanup service removes expired replies after their 15-minute recovery window. Device copies and backups have separate retention periods. Provider retention depends on the approved service and project.</p>
 <p>Participation, play acknowledgment and optional processing choices are separate. A grown-up can withdraw optional processing in family controls and contact the operator for access, export, correction or deletion. Device copies and private backups also need handling. No advertising or marketing analytics are included.</p>
 <p>${link('/contact','Contact the Jems operator','textlink')} · ${link('/terms','Pilot participation terms','textlink')}</p>`;}
 else if(path==='/terms'){title='Pilot participation terms';body='<h1>'+title+'</h1><p>Participation terms '+participationNotice+'</p><p>The workshop is an invitation-only pilot. An authorized adult holds the account, controls trusted devices and supervises every play session. Please keep your invitation and parent passphrase private.</p><p>AI can make mistakes. Review generated content with your child and stop an activity if it feels unsuitable. Share concerns or withdraw from the pilot through the operator.</p>'+terms;}
 else if(path==='/contact'){title='Contact Jems';body='<h1>Contact Jems</h1><p>Grown-ups can contact the pilot operator about a private invitation, recovery or a privacy request. Include your workshop reference and leave out child information.</p>'+link('mailto:'+esc(config.operatorContact),esc(config.operatorContact),'primary');}
 else return;
 return page(title,body,{art,footer:path==='/acknowledge'?'Invitation only · Parent-supervised experience':'Created for curious minds. Designed for families.',script:'/entry.js'});
}
export function page(title:string,body:string,options:{art?:boolean;footer?:string;script?:string}={}){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="referrer" content="no-referrer"><title>${esc(title)} · Jems</title><link rel="stylesheet" href="/entry.css"></head>
 <body><header class="mast"><a href="/" aria-label="Jems welcome"><img class="logo" src="/welcome-assets/jems-logo.svg" alt="jems"></a><nav aria-label="Information"><a href="/about">About Jems</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a></nav></header>
 <main class="${options.art?'hero':'sheet'}"><section class="copy">${body}<p role="status" aria-live="polite" id="message"></p></section>${options.art?mining():''}</main>
 <footer>${options.footer??'Invitation only · Parent-supervised experience'}</footer>${options.script?'<script type="module" src="'+options.script+'"></script>':''}</body></html>`;
}
