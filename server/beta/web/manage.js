import {request} from '/entry.js';
const root=document.getElementById('console'),msg=document.getElementById('message');
const labels={games:'Approved local games',learning:'Math and English',coding:'Coding studio',problemSolving:'Problem solving',conversation:'AI conversation coaching',generation:'AI game generation and revision',remoteSpeech:'Remote speech',artwork:'Reviewed adult artwork',adultImport:'Adult game importing',adultPrivate:'Adult Private development'};
function el(tag,txt){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;}
function field(form,label,type='text',value=''){const wrap=el('label',label),input=el('input');input.type=type;if(type==='checkbox'){wrap.className='check';input.checked=value===true;}else{input.value=value;input.required=true;}wrap.append(input);form.append(wrap);return input;}
function card(title){const section=el('section');section.className='ops';section.append(el('h2',title));root.append(section);return section;}
let selected='';
function button(parent,title,fn){const b=el('button',title);b.type='button';b.onclick=async()=>{b.disabled=true;try{msg.textContent='';await fn();}catch(e){msg.textContent=e.message;}finally{b.disabled=false;}};parent.append(b);return b;}
async function confirmAction(action,target,params,description){
 const dialog=el('dialog'),form=el('form');dialog.append(form);form.append(el('h2',description),el('p','Confirm this change for '+target+'.'));
 const pw=field(form,'Operator passphrase','password');pw.autocomplete='current-password';const submit=el('button','Confirm change');form.append(submit);
 button(form,'Cancel',()=>dialog.close());document.body.append(dialog);dialog.showModal();
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{
  const result=await request('/manage/action',{action,target,confirm:action+' '+target,params,passphrase:pw.value});pw.value='';dialog.close();if(result.familyId)selected=result.familyId;
  await refresh();if(result.invitation){
   const c=card('Private invitation');c.append(el('p','Send this workshop address and code separately through your approved private contact. The code is shown once.'),el('p',result.origin),el('output',result.invitation),el('p','Purpose: '+result.purpose+' · Expires '+new Date(result.expiresAt).toLocaleString()));c.scrollIntoView();
  }else msg.textContent='Change saved.';
 }catch(error){pw.value='';dialog.close();msg.textContent=error.message;}finally{submit.disabled=false;}};
 dialog.onclose=()=>dialog.remove();
}
const displayMoney=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(n/1000000);
function dollars(form,caption,micro){const input=field(form,caption,'number',(micro/1000000).toFixed(2));input.min='0';input.max='50';input.step='.01';return ()=>Math.round(Number(input.value)*100);}
async function refresh(){
 const overview=await request('/manage/state');root.replaceChildren();const platform=card('Platform controls');
 platform.append(el('p','Private Family Beta · '+(overview.policy.participation?'Family access on':'Family access paused')));
 platform.append(el('p','Global use: '+displayMoney(overview.globalUsage.used)+' · Reserved: '+displayMoney(overview.globalUsage.reserved)+' · Household budget '+(overview.householdMapped?'linked':'awaiting explicit mapping')));
 const form=el('form');platform.append(form);const invites=field(form,'Allow new invitations','checkbox',overview.policy.invitations),access=field(form,'Allow external family participation','checkbox',overview.policy.participation),stop=field(form,'Stop all beta AI spending','checkbox',overview.policy.stop),globalLimit=dollars(form,'Global monthly limit (USD)',overview.policy.monthlyLimit);
 button(form,'Save platform controls',()=>confirmAction('platform','platform',{invitations:invites.checked,participation:access.checked,stop:stop.checked,monthlyCents:globalLimit()},'Update platform controls'));
 platform.append(el('h3','Provider readiness'),el('p',overview.evidence.length?overview.evidence.map(e=>e.scope+' · '+e.provider+' · '+(e.current?'evidence current':'review expired')).join(', '):'No provider evidence is configured. Remote child processing is closed.'));
 platform.append(el('p','Before invitations open, verify private hosting, operator contact, trusted-device recovery, privacy notices and DEV/TEST acceptance in the activation checklist.'));
 const families=card('Families'),select=el('select');select.setAttribute('aria-label','Choose a family');const first=el('option','Choose a family');first.value='';select.append(first);
 for(const f of overview.families){const opt=el('option',f.contactRef+' · '+f.status);opt.value=f.id;select.append(opt);}families.append(select);select.value=selected;select.onchange=()=>{selected=select.value;refresh().catch(e=>msg.textContent=e.message);};
 const create=el('form');families.append(create);const ref=field(create,'New family’s private contact reference');ref.pattern='[-A-Za-z0-9_]{3,48}';ref.placeholder='e.g. workshop-04';
 button(create,'Create family',()=>confirmAction('create','new',{contactRef:ref.value},'Create this family'));
 if(!selected)return;const id=selected,f=await request('/manage/family/'+id);const account=card(f.contactRef);
 account.append(el('p','Status: '+f.status),el('p','Workshop: '+f.origin),el('p','Guardian participation: '+(f.verifiedAt?'verified '+new Date(f.verifiedAt).toLocaleDateString():'awaiting verification')));
 if(f.status==='invited')button(account,'Issue or replace invitation',()=>confirmAction('invite',id,{},'Issue private invitation'));
 if(f.invitation&&!f.invitation.used&&!f.invitation.revoked)button(account,'Revoke current invitation',()=>confirmAction('revoke-invite',id,{},'Revoke invitation'));
 if(f.status==='pending'){const pair=field(account,'Code provided by the independently contacted adult','password'),receipt=field(account,'External verification reference','password');button(account,'Confirm guardian participation',()=>confirmAction('verify',id,{pairingCode:pair.value,receipt:receipt.value},'Record independent verification'));}
 if(['pending','active','suspended'].includes(f.status))button(account,'Start credential recovery',()=>confirmAction('recover',id,{},'Revoke devices and issue a recovery code'));
 if(f.status==='active')button(account,'Suspend access',()=>confirmAction('suspend',id,{},'Suspend family access'));
 if(f.status==='suspended')button(account,'Resume verified family',()=>confirmAction('resume',id,{},'Resume family access'));
 if(f.status!=='revoked')button(account,'Permanently revoke access',()=>confirmAction('revoke',id,{},'Permanently revoke family access'));
 const budget=card('Features and spending'),features={};for(const [key,name] of Object.entries(labels)){features[key]=field(budget,name,'checkbox',f.capabilities[key]);if(['adultPrivate','adultImport'].includes(key))features[key].disabled=true;}
 const cap=dollars(budget,'Family monthly limit (USD)',f.allowance),pause=field(budget,'Pause all remote AI','checkbox',f.paused),gen=field(budget,'Pause generation','checkbox',f.generationPaused);
 button(budget,'Save family policy',()=>confirmAction('policy',id,{capabilities:Object.fromEntries(Object.entries(features).map(([k,v])=>[k,v.checked])),monthlyCents:cap(),paused:pause.checked,generationPaused:gen.checked},'Change features and spending'));
 const reviewed=field(budget,'SHA-256 of independently reviewed non-identifying artwork');button(budget,'Approve exact artwork',()=>confirmAction('approve-art',id,{digest:reviewed.value},'Authorize this reviewed image'));
 const usage=card('Usage and pending reservations'),table=el('table');usage.append(table);const head=el('tr');for(const title of ['Month','Used','Reserved'])head.append(el('th',title));table.append(head);for(const u of f.usage){const row=el('tr');for(const val of [u.month,displayMoney(u.used),displayMoney(u.reserved)])row.append(el('td',val));table.append(row);}
 const privacy=card('Privacy and devices');privacy.append(el('p','Consent: '+f.privacy.status+' · '+f.privacy.noticeVersion),el('p','Requested processing: '+Object.keys(f.privacy.scopes).filter(k=>f.privacy.scopes[k]).join(', ')));
 if(f.privacy.status==='pending'){const receipt=field(privacy,'Verification reference for this exact choice','password');button(privacy,'Record verified consent',()=>confirmAction('verify-consent',id,{choiceId:f.privacy.choiceId,receipt:receipt.value},'Verify the requested processing scopes'));}
 button(privacy,'Withdraw processing consent',()=>confirmAction('withdraw',id,{},'Withdraw consent and stop affected work'));
 for(const device of f.devices){const row=el('p',device.name+' · '+(device.revoked?'revoked':'expires '+new Date(device.expiresAt).toLocaleDateString())+' ');privacy.append(row);if(!device.revoked)button(row,'Revoke device',()=>confirmAction('revoke-device',id,{deviceId:device.id},'Revoke this device'));}
 if(f.request)privacy.append(el('p','Privacy request: '+f.request.kind+' · '+f.request.state+' · '+f.request.id));
 if(f.request?.state==='requested'){const ref=field(privacy,'Independent privacy-request verification reference','password');const deletion=f.request.kind==='deletion';
 button(privacy,deletion?'Confirm irreversible deletion':'Release export to guardian',()=>confirmAction(deletion?'confirm-deletion':'release-export',id,{requestId:f.request.id,receipt:ref.value},deletion?'Confirm irreversible deletion for this request':'Release family export for 24 hours'));}
 button(privacy,'Request family export',()=>confirmAction('request-export',id,{},'Start a controlled export'));
 button(privacy,'Request family deletion',()=>confirmAction('request-deletion',id,{},'Suspend access and start controlled deletion'));
}
refresh().catch(e=>msg.textContent=e.message);
addEventListener('pagehide',()=>{root.replaceChildren();for(const d of document.querySelectorAll('dialog'))d.remove();});
