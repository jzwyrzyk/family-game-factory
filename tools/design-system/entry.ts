import '../../src/brand/jems.css';
import '../../src/brand/art-library.css';
import '../../src/brand/icons.css';
import {mountDesignSystemGallery} from './gallery';
const host=document.getElementById('designSystemHost')!;
host.style.padding='var(--jems-space-4)';
const notice=document.createElement('p');notice.setAttribute('role','status');host.before(notice);
mountDesignSystemGallery(host, route=>{notice.textContent=`Open “${route}” in the standalone UI review to inspect the actual product journey. This Vite entry previews shared components only.`;notice.scrollIntoView();});
