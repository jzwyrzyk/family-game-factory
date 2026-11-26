import { ILLUSTRATED_WORLDS } from './illustrated-art';
import type { CreationProject, SceneLayer } from './model';
import type { ActorSnapshot, SceneSnapshot } from './engine';
import { creationAsset, drawCreationVector, parsePrivateArtId, type CreationAsset } from './projects';
import type { PrivateArtResolver } from './private-art';
import { preparePalSceneImage } from './pal-scene-image';

const worldPictures = new Map<string, Record<'background' | 'middle' | 'foreground', CreationAsset>>(ILLUSTRATED_WORLDS.map(world => {
  const image = (layer: 'background' | 'middle' | 'foreground'): CreationAsset => ({
    id: world.id + ':' + layer, label: world.label, kind: 'image', url: world[layer],
  });
  return [world.id, { background: image('background'), middle: image('middle'), foreground: image('foreground') }] as const;
}));

function scenePictures(project: CreationProject) {
  const world = worldPictures.get(project.background);
  const pictures = [...new Set(project.actors.map(actor => actor.assetId))]
    .map(id => creationAsset(id)).filter((asset): asset is CreationAsset => !!asset?.url);
  if (world) {
    pictures.push(world.background);
    if (project.worldLayers?.middle !== false) pictures.push(world.middle);
    if (project.worldLayers?.foreground !== false) pictures.push(world.foreground);
  }
  return pictures;
}

export const CREATION_ART_LOAD_TIMEOUT_MS = 8_000;
type SceneImage = {
  image: HTMLImageElement; ready: Promise<void>; sprite: CanvasImageSource | null;
  loaded: boolean; failed: boolean; cancel(): void;
};

/** The trusted renderer resolves bundled art and owner-checked local references.
 * Private art never accepts an externally supplied URL. */
export class CreationStage {
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<string, SceneImage>();
  private scene: CreationProject | null = null;
  private snapshot: SceneSnapshot | null = null;
  private selected = '';
  private artEpoch=0;
  private requestedArt=new Set<string>();
  private failedArt=new Set<string>();
  constructor(readonly canvas: HTMLCanvasElement,private privateArt?:PrivateArtResolver,private artError?:(message:string)=>void) {
    this.context = canvas.getContext('2d')!;
  }
  clear() {
    this.artEpoch++; this.requestedArt.clear();
    for (const entry of this.images.values()) entry.cancel();
    this.images.clear(); this.failedArt.clear(); this.scene = null; this.snapshot = null; this.selected = '';
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  /** Playback/export waits for these same cached images, including hidden
   * actors that a later Show block may reveal. No alternate loads or retries. */
  async prepare(project: CreationProject, current: () => boolean = () => true): Promise<void> {
    const epoch = this.artEpoch;
    const assertCurrent = () => {
      if (epoch !== this.artEpoch || !current()) throw Error('The scene or player changed. Choose Play again when you are ready.');
    };
    assertCurrent();
    const assets = scenePictures(project);
    await Promise.all(assets.map(asset => this.loadImage(asset).ready));
    assertCurrent();
  }
  private loadImage(asset: CreationAsset): SceneImage {
    const existing = this.images.get(asset.id); if (existing) return existing;
    const image = new Image(), epoch = this.artEpoch;
    let settled = false, timer: ReturnType<typeof setTimeout> | undefined;
    let settle!: (error?: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      settle = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer);
        image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
    });
    // render() starts a load without awaiting it; prepare() observes this exact
    // promise later. Retain rejection without an unhandled background promise.
    void ready.catch(() => {});
    const entry: SceneImage = { image, ready, sprite: null, loaded: false, failed: false, cancel: () => {
      settle(Error('The scene or player changed. Choose Play again when you are ready.'));
      image.onload = null; image.onerror = null; image.removeAttribute?.('src'); entry.sprite = null;
    } };
    this.images.set(asset.id, entry);
    const active = () => epoch === this.artEpoch && this.images.get(asset.id) === entry;
    const repaint = () => { if (active() && this.scene && this.snapshot) this.render(this.scene, this.snapshot, this.selected); };
    const fail = (timedOut = false) => {
      if (!active() || settled) return;
      const message = `${asset.label}'s picture could not load${timedOut ? ' in time' : ''}. Reopen this scene to try again.`;
      entry.failed = true; this.failedArt.add(asset.id); settle(Error(message));
      if (this.scene && scenePictures(this.scene).some(picture => picture.id === asset.id)) this.artError?.(message);
      repaint();
    };
    const finish = () => {
      if (!active() || settled) return;
      if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
      try { entry.sprite = asset.palForm ? preparePalSceneImage(image, asset.url) : image; }
      catch { fail(); return; }
      entry.loaded = true; settle(); repaint();
    };
    image.decoding = 'async';
    image.onload = () => {
      if (!active() || settled) return;
      if (typeof image.decode === 'function') void image.decode().then(finish, () => fail());
      else finish();
    };
    image.onerror = () => fail();
    timer = setTimeout(() => fail(true), CREATION_ART_LOAD_TIMEOUT_MS);
    image.src = new URL(asset.url!, document.baseURI).href;
    return entry;
  }
  render(scene: CreationProject, snapshot: SceneSnapshot, selected = '') {
    this.scene = scene; this.snapshot = snapshot; this.selected = selected;
    // Approved portraits are large. Retain only this scene's pinned pictures,
    // not every Pal/form visited across the whole collection.
    const assets = new Set(scenePictures(scene).map(asset => asset.id));
    for (const [id, entry] of this.images) if (!assets.has(id)) { entry.cancel(); this.images.delete(id); this.failedArt.delete(id); }
    if (this.canvas.width !== scene.width) this.canvas.width = scene.width;
    if (this.canvas.height !== scene.height) this.canvas.height = scene.height;
    const c = this.context, w = scene.width, h = scene.height;
    c.clearRect(0, 0, w, h);
    const world = worldPictures.get(scene.background);
    if (world) {
      c.fillStyle = '#eee9f6'; c.fillRect(0, 0, w, h);
      this.worldPicture(world.background);
    } else this.background(scene);
    const drawActors = (layer: SceneLayer) => {
      for (const actor of snapshot.actors) {
        if (actor.visible && (actor.layer ?? 'middle') === layer) this.actor(actor, actor.id === selected);
      }
    };
    drawActors('backdrop');
    drawActors('back');
    if (world && scene.worldLayers?.middle !== false) this.worldPicture(world.middle);
    drawActors('middle');
    if (world && scene.worldLayers?.foreground !== false) this.worldPicture(world.foreground);
    drawActors('front');
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
    const actors = this.snapshot?.actors ?? [];
    for (const layer of ['front', 'middle', 'back']) {
      for (let i = actors.length - 1; i >= 0; i--) {
        const actor = actors[i];
        if (!actor.visible || (actor.layer ?? 'middle') !== layer) continue;
        if (Math.abs(x - actor.x) < actor.size * .65 && Math.abs(y - actor.y - actor.jumpOffset) < actor.size * .65) return actor.id;
      }
    }
    return null;
  }
  point(event: PointerEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: Math.round((event.clientX - bounds.left) / bounds.width * this.canvas.width),
      y: Math.round((event.clientY - bounds.top) / bounds.height * this.canvas.height) };
  }
  private worldPicture(asset: CreationAsset) {
    const entry = this.loadImage(asset);
    if (!entry.loaded || !entry.sprite) return;
    // Use the same centered crop for all registered layers, keeping a custom
    // stage's aspect ratio independent of its actor and input coordinates.
    const { width, height } = this.canvas, image = entry.image;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    this.context.drawImage(entry.sprite, (width - w) / 2, (height - h) / 2, w, h);
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
    if (actor.layer !== 'backdrop') { c.fillStyle = '#152B4B15'; c.beginPath(); c.ellipse(0, s * .48, s * .38, s * .08, 0, 0, Math.PI * 2); c.fill(); }
    c.translate(0, actor.jumpOffset); c.rotate(actor.rotation * Math.PI / 180);
    if (selected) {
      c.strokeStyle = '#7452CF'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.roundRect(-s * .58, -s * .57, s * 1.16, s * 1.16, 15); c.stroke(); c.setLineDash([]);
    }
    if(parsePrivateArtId(actor.assetId)){
      const resolved=this.privateArt?.get(actor.assetId);
      if(resolved){
        const scale = actor.layer === 'backdrop'
          ? Math.min(this.canvas.width / resolved.image.width, this.canvas.height / resolved.image.height) * s / 100
          : s / Math.max(resolved.image.width, resolved.image.height);
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
      const entry = this.loadImage(asset), img = entry.image;
      if (entry.loaded && entry.sprite) {
        const scale = s / Math.max(img.naturalWidth, img.naturalHeight);
        const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
        c.drawImage(entry.sprite, -iw / 2, -ih / 2, iw, ih);
      } else if (asset.palForm || asset.id.startsWith('world-prop-')) {
        // A delayed approved creature must not appear to turn into a gem token.
        c.fillStyle = '#F5F1FA'; c.strokeStyle = '#786489'; c.lineWidth = 2;
        c.beginPath(); c.roundRect(-s * .46, -s * .4, s * .92, s * .8, 10); c.fill(); c.stroke();
        c.fillStyle = '#4C3C61'; c.font = '600 ' + Math.max(10, Math.min(14, s * .12)) + 'px system-ui';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(this.failedArt.has(asset.id) ? 'Picture unavailable' : 'Loading picture…', 0, 0, s * .85);
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
