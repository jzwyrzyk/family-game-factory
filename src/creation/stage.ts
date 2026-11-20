import type { CreationProject } from './model';
import type { ActorSnapshot, SceneSnapshot } from './engine';
import { creationAsset, drawCreationVector, parsePrivateArtId } from './projects';
import type { PrivateArtResolver } from './private-art';

/** The trusted renderer resolves bundled art and owner-checked local references.
 * Private art never accepts an externally supplied URL. */
export class CreationStage {
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private scene: CreationProject | null = null;
  private snapshot: SceneSnapshot | null = null;
  private selected = '';
  private artEpoch=0;
  private requestedArt=new Set<string>();
  private failedArt=new Set<string>();
  constructor(readonly canvas: HTMLCanvasElement,private privateArt?:PrivateArtResolver,private artError?:(message:string)=>void) {
    this.context = canvas.getContext('2d')!;
  }
  clear() { this.artEpoch++;this.requestedArt.clear();this.failedArt.clear();this.scene = null; this.snapshot = null; this.selected = ''; this.context.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  render(scene: CreationProject, snapshot: SceneSnapshot, selected = '') {
    this.scene = scene; this.snapshot = snapshot; this.selected = selected;
    if (this.canvas.width !== scene.width) this.canvas.width = scene.width;
    if (this.canvas.height !== scene.height) this.canvas.height = scene.height;
    const c = this.context, w = scene.width, h = scene.height;
    c.clearRect(0, 0, w, h);
    this.background(scene);
    for (const actor of snapshot.actors) if (actor.visible) this.actor(actor, actor.id === selected);
    for (const actor of snapshot.actors) if (actor.visible && actor.speech) this.bubble(actor);
    let badgeX = 12;
    for (const [name, value] of Object.entries(snapshot.variables).slice(0, 6)) {
      c.font = '600 13px system-ui'; const label = name.slice(0, 18) + '  ' + value, width = c.measureText(label).width + 22;
      if (badgeX + width > w - 12) break;
      c.fillStyle = '#FFFFFFDB'; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(badgeX, 12, width, 28, 9); c.fill(); c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#4D5478'; c.fillText(label, badgeX + 11, 26); badgeX += width + 7;
    }
  }
  hit(x: number, y: number): string | null {
    const actor = [...(this.snapshot?.actors || [])].reverse().find(a => a.visible &&
      Math.abs(x - a.x) < a.size * .65 && Math.abs(y - a.y - a.jumpOffset) < a.size * .65);
    return actor?.id || null;
  }
  point(event: PointerEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: Math.round((event.clientX - bounds.left) / bounds.width * this.canvas.width),
      y: Math.round((event.clientY - bounds.top) / bounds.height * this.canvas.height) };
  }
  private background(scene: CreationProject) {
    const c = this.context, w = scene.width, h = scene.height;
    const night = scene.background === 'night', workshop = scene.background === 'workshop', sky = scene.background === 'sky';
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, night ? '#222B66' : workshop ? '#E7DEFF' : '#B9E7F5');
    gradient.addColorStop(1, night ? '#7564B8' : workshop ? '#FFF4E5' : '#FFF3DC');
    c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    c.fillStyle = night ? '#FFF4CE' : '#FFD277';
    c.beginPath(); c.arc(w * .83, h * .2, h * .074, 0, Math.PI * 2); c.fill();
    if (night) {
      c.fillStyle = '#FBEEBC';
      for (let i = 0; i < 22; i++) {
        const x = (i * 137 + 30) % w, y = (i * 47 + 22) % (h * .65);
        c.beginPath(); c.arc(x, y, i % 3 ? 1.5 : 2.5, 0, Math.PI * 2); c.fill();
      }
    } else {
      this.cloud(w * .17, h * .17, h * .07); this.cloud(w * .59, h * .28, h * .055);
    }
    if (sky) {
      this.cloud(w * .1, h * .75, h * .1); this.cloud(w * .5, h * .86, h * .13); this.cloud(w * .9, h * .72, h * .09);
      c.fillStyle = '#FFFFFF60'; c.beginPath(); c.moveTo(0, h * .96); c.bezierCurveTo(w * .3, h * .82, w * .6, h * 1.05, w, h * .89); c.lineTo(w, h); c.lineTo(0, h); c.fill();
      return;
    }
    c.fillStyle = night ? '#494B86' : workshop ? '#CDBCE8' : '#B9D9B8';
    c.beginPath(); c.moveTo(0, h * .82); c.bezierCurveTo(w * .2, h * .43, w * .31, h * .8, w * .52, h * .72);
    c.bezierCurveTo(w * .75, h * .51, w * .84, h * .65, w, h * .74); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = night ? '#363C73' : workshop ? '#B4A2D7' : '#7DBB9B';
    c.beginPath(); c.moveTo(0, h * .91); c.bezierCurveTo(w * .32, h * .7, w * .6, h * .98, w, h * .79); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.strokeStyle = night ? '#FFFFFF13' : '#FFFFFF38'; c.lineWidth = 1;
    for (let x = 40; x < w; x += 40) for (let y = 40; y < h; y += 40) {
      c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x + 2, y); c.moveTo(x, y - 2); c.lineTo(x, y + 2); c.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const x = (i * 103 + 26) % w, y = h * .91 + ((i * 11) % 30);
      c.strokeStyle = night ? '#8A8ABC' : '#3E9375'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y - 8); c.moveTo(x, y); c.lineTo(x + 4, y - 11); c.stroke();
      if (i % 3 === 0) { c.fillStyle = '#FFDE94'; c.beginPath(); c.arc(x + 4, y - 13, 3, 0, Math.PI * 2); c.fill(); }
    }
  }
  private cloud(x: number, y: number, r: number) {
    const c = this.context; c.fillStyle = '#FFFFFFBC'; c.beginPath();
    c.ellipse(x, y, r * 1.7, r * .42, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x - r * .4, y - r * .3, r * .55, 0, Math.PI * 2); c.arc(x + r * .35, y - r * .36, r * .68, 0, Math.PI * 2); c.fill();
  }
  private actor(actor: ActorSnapshot, selected: boolean) {
    const c = this.context, s = actor.size, asset = creationAsset(actor.assetId);
    c.save(); c.translate(actor.x, actor.y);
    c.fillStyle = '#152B4B15'; c.beginPath(); c.ellipse(0, s * .48, s * .38, s * .08, 0, 0, Math.PI * 2); c.fill();
    c.translate(0, actor.jumpOffset); c.rotate(actor.rotation * Math.PI / 180);
    if (selected) {
      c.strokeStyle = '#7452CF'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.roundRect(-s * .58, -s * .57, s * 1.16, s * 1.16, 15); c.stroke(); c.setLineDash([]);
    }
    if(parsePrivateArtId(actor.assetId)){
      const resolved=this.privateArt?.get(actor.assetId);
      if(resolved){
        const scale=s/Math.max(resolved.image.width,resolved.image.height);
        c.drawImage(resolved.image,-resolved.image.width*scale/2,-resolved.image.height*scale/2,resolved.image.width*scale,resolved.image.height*scale);
      }else{
        if(this.privateArt&&!this.requestedArt.has(actor.assetId)&&!this.failedArt.has(actor.assetId)){
          this.requestedArt.add(actor.assetId);const epoch=this.artEpoch;
          void this.privateArt.load(actor.assetId).then(()=>{
            if(epoch!==this.artEpoch)return;this.requestedArt.delete(actor.assetId);
            if(this.scene&&this.snapshot)this.render(this.scene,this.snapshot,this.selected);
          }).catch(error=>{
            if(epoch!==this.artEpoch)return;
            this.requestedArt.delete(actor.assetId);
            this.failedArt.add(actor.assetId);this.artError?.('Some artwork is unavailable in this profile. Open Art Studio to restore its art bundle. '+(error as Error).message);
            if(this.scene&&this.snapshot)this.render(this.scene,this.snapshot,this.selected);
          });
        }
        c.fillStyle='#F5F1FA';c.strokeStyle='#786489';c.lineWidth=2;c.setLineDash([4,4]);
        c.beginPath();c.roundRect(-s*.46,-s*.4,s*.92,s*.8,10);c.fill();c.stroke();c.setLineDash([]);
        c.fillStyle='#4C3C61';c.font='600 '+Math.max(10,Math.min(14,s*.12))+'px system-ui';c.textAlign='center';c.textBaseline='middle';
        c.fillText(this.failedArt.has(actor.assetId)?'Art unavailable':'Loading art…',0,0,s*.85);
      }
    } else if (asset?.url) {
      let img = this.images.get(asset.id);
      if (!img) {
        img = new Image(); img.onload = () => { if (this.scene && this.snapshot) this.render(this.scene, this.snapshot, this.selected); };
        img.src = new URL(asset.url, document.baseURI).href; this.images.set(asset.id, img);
      }
      if (img.complete && img.naturalWidth) {
        const scale = s / Math.max(img.naturalWidth, img.naturalHeight);
        const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
        c.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      } else this.gem(s, '#B79DE7');
    } else if (asset?.kind === 'vector') drawCreationVector(c, asset.id, 0, 0, s);
    else if (asset?.emoji) { c.font = `${s * .76}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(asset.emoji, 0, 0); }
    else this.gem(s, asset?.color || '#B095E0');
    c.restore();
  }
  private gem(s: number, color: string) {
    const c = this.context; c.fillStyle = color; c.beginPath(); c.moveTo(-s * .4, -s * .1); c.lineTo(-s * .22, -s * .35); c.lineTo(s * .22, -s * .35); c.lineTo(s * .4, -s * .1); c.lineTo(0, s * .38); c.closePath(); c.fill();
    c.fillStyle = '#FFFFFF66'; c.beginPath(); c.moveTo(-s * .22, -s * .35); c.lineTo(0, -s * .1); c.lineTo(0, s * .38); c.lineTo(-s * .4, -s * .1); c.closePath(); c.fill();
    c.strokeStyle = '#FFFFFFAA'; c.lineWidth = s * .018; c.beginPath(); c.moveTo(-s * .4, -s * .1); c.lineTo(s * .4, -s * .1); c.moveTo(0, -s * .1); c.lineTo(s * .22, -s * .35); c.stroke();
  }
  private bubble(actor: ActorSnapshot) {
    const c = this.context, w = this.canvas.width;
    c.font = '600 19px system-ui'; const words = (actor.speech || '').split(/\s+/), lines: string[] = []; let line = '';
    for (const word of words) { if (c.measureText(line + ' ' + word).width > 230 && line) { lines.push(line); line = word; } else line += (line ? ' ' : '') + word; }
    if (line) lines.push(line);
    const shown = lines.slice(0, 4), width = Math.min(260, Math.max(80, ...shown.map(t => c.measureText(t).width + 30)));
    const height = shown.length * 25 + 20, x = Math.max(8, Math.min(w - width - 8, actor.x - width / 2));
    const y = Math.max(8, actor.y + actor.jumpOffset - actor.size * .55 - height - 12);
    c.fillStyle = '#FFFFFF'; c.strokeStyle = '#D5CBEA'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x, y, width, height, 15); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(Math.max(x + 15, Math.min(x + width - 25, actor.x - 8)), y + height - 1); c.lineTo(actor.x, y + height + 10); c.lineTo(Math.max(x + 25, Math.min(x + width - 15, actor.x + 8)), y + height - 1); c.fill();
    c.fillStyle = '#283952'; c.textAlign = 'center'; c.textBaseline = 'top'; shown.forEach((text, i) => c.fillText(text, x + width / 2, y + 10 + i * 25));
  }
}
