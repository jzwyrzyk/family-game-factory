import type {Preview} from './client';

export function openPreviewFrame(frame:HTMLIFrameElement,preview:Preview,channel:string){
 const url=new URL(preview.url);
 if(preview.grant===undefined){url.searchParams.set('channel',channel);frame.src=url.href;return;}
 if(url.pathname!=='/family-preview'||url.search||url.hash||typeof preview.grant!=='string'||preview.grant.length>3000)throw Error('UNSAFE_PREVIEW');
 frame.name='jems-'+channel;
 const form=document.createElement('form');form.method='post';form.action=url.href;form.target=frame.name;form.hidden=true;
 for(const [name,value] of Object.entries({channel,grant:preview.grant})){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.append(field);}
 document.body.append(form);form.submit();form.remove();
}
