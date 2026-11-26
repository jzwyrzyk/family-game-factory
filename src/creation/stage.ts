import { pointerPoint } from '../drawing/pointer-input';
import { orderedPlacements } from './world-tools';
import type { SceneLayer } from './model';
import { SCENE_WORLDS, sceneAssetSlots, worldView, sceneryPlacements, type CreationProject } from './model';
import type { ActorSnapshot, SceneSnapshot } from './engine';
import { creationAsset, drawCreationVector, parsePrivateArtId, type CreationAsset } from './projects';
import type { PrivateArtResolver } from './private-art';
import { preparePalSceneImage } from './pal-scene-image';

// Layer IDs live only in the renderer. The scene keeps one immutable world pin.
const worldImages = new Map(SCENE_WORLDS.map(world => {
  const picture = (id: string, url: string): CreationAsset => ({id, url, label:world.label, kind:'image'});
  return [world.id, {
    plate: picture(world.id, world.url),
    middle: world.middle && picture(world.id + ':middle', world.middle),
    foreground: world.foreground && picture(world.id + ':front', world.foreground),
  }];
}));

function worldArt(project: CreationProject) {
  return worldImages.get(worldView(project).assetId ?? '');
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
  private allowResize = false;
  private grip: {id:string; x:number; y:number} | null = null;
  private readonly backdropArt?:PrivateArtResolver;
  private artEpoch=0;
  private requestedArt=new Set<string>();
  private failedArt=new Set<string>();
  constructor(readonly canvas: HTMLCanvasElement,private privateArt?:PrivateArtResolver,private artError?:(message:string)=>void) {
    this.context = canvas.getContext('2d')!;
    this.backdropArt = privateArt?.backdropResolver();
  }
  clear() {
    this.backdropArt?.clear(); this.grip = null; this.artEpoch++; this.requestedArt.clear();
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
    const assets = [...new Set(sceneAssetSlots(project).map(slot => slot.assetId))]
      .map(id => creationAsset(id)).filter((asset): asset is CreationAsset => !!asset?.url);
    const world = worldArt(project);
    if (world) {
      assets.push(world.plate);
      if (world.middle) assets.push(world.middle);
      if (world.foreground) assets.push(world.foreground);
    }
    const backdrop = project.actors.find(actor => actor.layer === 'backdrop')?.assetId ?? worldView(project).assetId;
    await Promise.all([...assets.map(asset => this.loadImage(asset).ready),
      ...(backdrop && parsePrivateArtId(backdrop) && this.backdropArt ? [this.backdropArt.load(backdrop)] : [])]);
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
    const repaint = () => { if (active() && this.scene && this.snapshot) this.render(this.scene, this.snapshot, this.selected, this.allowResize); };
    const fail = (timedOut = false) => {
      if (!active() || settled) return;
      const message = `${asset.label}'s picture could not load${timedOut ? ' in time' : ''}. Reopen this scene to try again.`;
      entry.failed = true; this.failedArt.add(asset.id); settle(Error(message));
      if (this.scene && (sceneAssetSlots(this.scene).some(slot => slot.assetId === asset.id)
        || Object.values(worldArt(this.scene) ?? {}).includes(asset))) this.artError?.(message);
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
  render(scene: CreationProject, snapshot: SceneSnapshot, selected = '', allowResize = false) {
    this.allowResize = allowResize;
    this.grip = null;
    this.scene = scene; this.snapshot = snapshot; this.selected = selected;
    // Approved portraits are large. Retain only this scene's pinned pictures,
    // not every Pal/form visited across the whole collection.
    const assets = new Set(sceneAssetSlots(scene).map(slot => slot.assetId));
    const world = worldArt(scene);
    if (world) assets.add(world.plate.id);
    if (world?.middle) assets.add(world.middle.id);
    if (world?.foreground) assets.add(world.foreground.id);
    for (const [id, entry] of this.images) if (!assets.has(id)) { entry.cancel(); this.images.delete(id); this.failedArt.delete(id); }
    if (this.canvas.width !== scene.width) this.canvas.width = scene.width;
    if (this.canvas.height !== scene.height) this.canvas.height = scene.height;
    const c = this.context, w = scene.width, h = scene.height;
    c.clearRect(0, 0, w, h);
    this.background(scene);
    const placements = orderedPlacements(snapshot.actors);
    const version = worldView(scene);
    const scenery = sceneryPlacements(scene);
    const drawActors = (layer: SceneLayer) => {
      for (const actor of placements) {
        if (actor.visible && (actor.layer ?? 'middle') === layer) this.actor(actor, actor.id === selected);
      }
    };
    drawActors('backdrop');
    drawActors('back');
    if (world?.middle && version.middle) {
      const layer = this.loadImage(world.middle);
      if (layer.loaded) this.paintWorldImage(scene, layer.image);
    }
    this.paintScenery(scenery, false);
    drawActors('middle');
    if (world?.foreground && version.foreground) {
      const layer = this.loadImage(world.foreground);
      if (layer.loaded) this.paintWorldImage(scene, layer.image);
    }
    this.paintScenery(scenery, true);
    drawActors('front');
    const placement = allowResize && selected ? snapshot.actors.find(actor => actor.id === selected && actor.visible && actor.layer !== 'backdrop') : undefined;
    if (placement) {
      const x = placement.x + placement.size * .58, y = placement.y + placement.size * .57;
      this.grip = {id:placement.id,x,y};
      c.save(); c.translate(x,y); c.fillStyle = '#50318c'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(0,0,10,0,Math.PI*2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-4,-4); c.lineTo(4,4); c.lineTo(4,-1); c.moveTo(4,4); c.lineTo(-1,4); c.stroke(); c.restore();
    }
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
    const actors = orderedPlacements(this.snapshot?.actors ?? []);
    for (const layer of ['front', 'middle', 'back']) {
      for (let i = actors.length - 1; i >= 0; i--) {
        const actor = actors[i];
        if (!actor.visible || (actor.layer ?? 'middle') !== layer) continue;
        if (Math.abs(x - actor.x) < actor.size * .65 && Math.abs(y - actor.y - actor.jumpOffset) < actor.size * .65) return actor.id;
      }
    }
    return null;
  }
  resizeHit(x:number, y:number):string | null {
    if (!this.grip) return null;
    const radius = 14 * this.canvas.width / Math.max(1, this.canvas.getBoundingClientRect().width);
    return Math.hypot(x-this.grip.x,y-this.grip.y) <= radius ? this.grip.id : null;
  }
  point(event: PointerEvent) {
    return pointerPoint(this.canvas,event,'position');
  }
  private privatePicture(id: string, resolver = this.privateArt, key = id) {
    const cached = resolver?.get(id);
    if (cached || !resolver || this.requestedArt.has(key) || this.failedArt.has(key)) return cached;
    this.requestedArt.add(key);
    const epoch = this.artEpoch;
    void resolver.load(id).catch(error => {
      if (epoch !== this.artEpoch) return;
      this.failedArt.add(key);
      if (this.scene && sceneAssetSlots(this.scene).some(slot => slot.assetId === id)) {
        this.artError?.('Some artwork is unavailable in this profile. Open My Art to restore it. '+(error as Error).message);
      }
    }).finally(() => {
      if (epoch !== this.artEpoch) return;
      this.requestedArt.delete(key);
      if (this.scene && this.snapshot) this.render(this.scene, this.snapshot, this.selected, this.allowResize);
    });
    return undefined;
  }
  private paintScenery(placements: ReturnType<typeof sceneryPlacements>, front: boolean) {
    for (const piece of placements) {
      if (piece.front !== front) continue;
      const asset = creationAsset(piece.assetId);
      const bundled = asset && this.loadImage(asset);
      const image = bundled ? (bundled.loaded ? bundled.image : undefined) : this.privatePicture(piece.assetId)?.image;
      if (!image) continue;
      const scale = piece.size / Math.max(image.width, image.height);
      const width = image.width * scale, height = image.height * scale;
      this.context.drawImage(image, piece.x - width / 2, piece.y - height / 2, width, height);
    }
  }
  private paintWorldImage(scene: CreationProject, image: HTMLImageElement | HTMLCanvasElement) {
    const scale = (worldView(scene).framing === 'fit' ? Math.min : Math.max)(scene.width / image.width, scene.height / image.height);
    const width = image.width * scale, height = image.height * scale;
    this.context.drawImage(image, (scene.width - width) / 2, (scene.height - height) / 2, width, height);
  }
  private background(scene: CreationProject) {
    const version = worldView(scene);
    if ((scene.world || worldArt(scene)) && !version.classic) {
      const context = this.context, assetId = version.assetId ?? scene.background;
      const bundled = worldArt(scene);
      const entry = bundled && this.loadImage(bundled.plate);
      const image = bundled ? (entry?.loaded ? entry.image : undefined) : this.privatePicture(assetId, this.backdropArt, "backdrop:"+assetId)?.image;
      context.fillStyle = '#f7f4ee';
      context.fillRect(0, 0, scene.width, scene.height);
      if (image) {
        this.paintWorldImage(scene, image);
      } else {
        context.font = '600 18px system-ui'; context.fillStyle = '#37304a';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(this.failedArt.has(assetId) ? 'World picture unavailable' : 'Loading world…', scene.width/2, scene.height*.16);
      }
      return;
    }
    if (scene.background === 'blank') {
      this.context.fillStyle = '#fff'; this.context.fillRect(0,0,scene.width,scene.height); return;
    }
    // Retained scenes without a world pin keep their original visual design.
    const c = this.context, w = scene.width, h = scene.height;
    const background = version.classic ?? scene.background;
    const night = background === 'night', workshop = background === 'workshop', sky = background === 'sky';
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
    c.translate(0, actor.jumpOffset); c.rotate((actor.rotation + (actor.angle ?? 0)) * Math.PI / 180);
    if (selected) {
      c.strokeStyle = '#7452CF'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.roundRect(-s * .58, -s * .57, s * 1.16, s * 1.16, 15); c.stroke(); c.setLineDash([]);
    }
    if(parsePrivateArtId(actor.assetId)){
      const backdrop = actor.layer === 'backdrop';
      const resolved = backdrop ? this.privatePicture(actor.assetId,this.backdropArt,'backdrop:'+actor.assetId) : this.privatePicture(actor.assetId);
      if(resolved){
        const fit = actor.backdropFit === 'cover' ? Math.max : Math.min;
        const scale = backdrop ? fit(this.canvas.width/resolved.image.width,this.canvas.height/resolved.image.height)*s/100 : s/Math.max(resolved.image.width,resolved.image.height);
        c.drawImage(resolved.image,-resolved.image.width*scale/2,-resolved.image.height*scale/2,resolved.image.width*scale,resolved.image.height*scale);
      }else{
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
      } else if (asset.palForm) {
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
