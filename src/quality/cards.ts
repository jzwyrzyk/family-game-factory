import {drawLandscape,drawPart,drawGum} from './art';
/** Small static previews use the same art as the playable scenes; no home-screen loop. */
export function installQualityCards(){
 for(const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-quality-card]')){
  const c=canvas.getContext('2d');if(!c)continue;const w=600,h=320;canvas.width=w;canvas.height=h;
  drawLandscape(c,w,h);
  if(canvas.dataset.qualityCard==='hill'){
   c.fillStyle='#ceb181';c.beginPath();c.moveTo(0,280);c.bezierCurveTo(120,300,220,180,340,220);c.bezierCurveTo(450,260,500,180,600,200);c.lineTo(600,320);c.lineTo(0,320);c.fill();c.strokeStyle='#6a9c7c';c.lineWidth=10;c.beginPath();c.moveTo(0,280);c.bezierCurveTo(120,300,220,180,340,220);c.bezierCurveTo(450,260,500,180,600,200);c.stroke();
   c.save();c.translate(295,175);c.rotate(.12);c.strokeStyle='#667e7f';c.lineWidth=7;for(const x of [-62,62]){c.beginPath();c.moveTo(x,-5);c.lineTo(x,38);c.stroke();}drawPart(c,'chassis',205,90);for(const x of [-62,62]){c.save();c.translate(x,38);drawPart(c,'wheel',72,72);c.restore();}c.restore();
  }else{
   // The library card previews the actual playful sticker rocket, not the
   // optional advanced physical engineering rig.
   const sky=c.createLinearGradient(0,0,w,h);sky.addColorStop(0,'#91e8f9');sky.addColorStop(.58,'#b9c2ff');sky.addColorStop(1,'#ffe5bb');
   c.fillStyle=sky;c.fillRect(0,0,w,h);
   c.fillStyle='#fff9d1';c.beginPath();c.arc(515,67,39,0,Math.PI*2);c.fill();
   for(const [x,y,r]of [[62,43,8],[150,85,7],[485,158,8],[552,227,6]]as const){
    c.fillStyle='#fff';c.beginPath();c.moveTo(x,y-r*2);c.lineTo(x+r*.7,y-r*.6);c.lineTo(x+r*2,y);
    c.lineTo(x+r*.7,y+r*.6);c.lineTo(x,y+r*2);c.lineTo(x-r*.7,y+r*.6);c.lineTo(x-r*2,y);c.lineTo(x-r*.7,y-r*.6);c.closePath();c.fill();
   }
   c.save();c.translate(300,170);c.rotate(.21);
   c.lineWidth=8;c.strokeStyle='#5c59b7';c.lineJoin='round';
   c.beginPath();c.moveTo(-54,53);c.lineTo(-112,113);c.lineTo(-43,106);c.lineTo(43,106);c.lineTo(112,113);c.lineTo(54,53);c.closePath();c.fillStyle='#fc75ae';c.fill();c.stroke();
   c.beginPath();c.moveTo(0,-125);c.bezierCurveTo(-61,-73,-71,19,-53,109);c.lineTo(53,109);c.bezierCurveTo(71,19,61,-73,0,-125);c.closePath();c.fillStyle='#d9edff';c.fill();c.stroke();
   c.beginPath();c.moveTo(0,-125);c.quadraticCurveTo(-39,-85,-49,-48);c.lineTo(49,-48);c.quadraticCurveTo(39,-85,0,-125);c.closePath();c.fillStyle='#8065ee';c.fill();c.stroke();
   c.beginPath();c.arc(0,2,42,0,Math.PI*2);c.fillStyle='#54d4ed';c.fill();c.stroke();
   c.beginPath();c.arc(-12,-8,18,0,Math.PI*2);c.fillStyle='#d4fbff';c.fill();
   c.beginPath();c.moveTo(-38,111);c.lineTo(-22,155);c.lineTo(0,195);c.lineTo(22,155);c.lineTo(38,111);c.closePath();c.fillStyle='#ffca59';c.fill();
   c.beginPath();c.moveTo(-12,115);c.lineTo(0,174);c.lineTo(12,115);c.closePath();c.fillStyle='#fff5b1';c.fill();
   c.restore();
   // Three colorful, tactile sticker cues echo the playable target bubbles.
   for(const [x,y,col,txt]of [[193,105,'#ff81b6','♥'],[391,190,'#51d6c8','★'],[215,258,'#fbc657','✦']]as const){
    c.beginPath();c.arc(x,y,31,0,Math.PI*2);c.fillStyle='#fff';c.fill();c.lineWidth=5;c.strokeStyle=col;c.stroke();
    c.fillStyle=col;c.font='bold 33px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(txt,x,y+1);
   }
  }
 }
}
