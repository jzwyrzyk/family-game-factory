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
   c.fillStyle='#dfc594';c.fillRect(0,272,w,48);c.fillStyle='#78a184';c.fillRect(0,268,w,8);
   drawGum(c,290,190,227,238);drawGum(c,290,190,350,238);drawGum(c,290,190,290,114);drawGum(c,290,190,188,190);
   for(const [id,x,y,pw,ph,angle]of [['carton',290,190,130,100,0],['wheel',236,238,66,66,0],['wheel',344,238,66,66,0],['capsule',290,112,59,59,0],['fan',183,190,80,70,Math.PI/2]]as const){c.save();c.translate(x,y);c.rotate(angle);drawPart(c,id,pw,ph);c.restore();}
  }
 }
}
