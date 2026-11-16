/** Local, original procedural sound bank and music. No downloads or inference during play. */
type Scene = 'build' | 'run' | 'win';
interface SoundSettings { music: boolean; effects: boolean; musicVolume: number; effectsVolume: number }
const KEY = 'factory-game-sound-v1';
const initial: SoundSettings = { music: true, effects: true, musicVolume: .2, effectsVolume: .55 };
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
export function createGameAudio() {
  let settings = { ...initial };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.music === 'boolean' && typeof v.effects === 'boolean') settings = { music: v.music, effects: v.effects,
      musicVolume: clamp(v.musicVolume ?? .2), effectsVolume: clamp(v.effectsVolume ?? .55) };
  } catch { /* Sound settings are optional; a storage failure never blocks play. */ }
  let ac: AudioContext | undefined, music: GainNode, effects: GainNode, motor: OscillatorNode, motorGain: GainNode;
  let scene: Scene = 'build', timer: ReturnType<typeof setInterval> | undefined, nextBeat = 0, beat = 0, paused = false, disposed = false, voices = 0;
  const recent = new Map<string, number>();
  function startScheduler() { if (!disposed && !paused && ac && timer === undefined) timer = setInterval(schedule, 90); }
  function stopScheduler() { clearInterval(timer); timer = undefined; }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Local preference only. */ } }
  function volumes() { if (!ac) return; music.gain.setTargetAtTime(settings.music && !paused ? settings.musicVolume : 0, ac.currentTime, .08); effects.gain.setTargetAtTime(settings.effects && !paused ? settings.effectsVolume : 0, ac.currentTime, .03); }
  function note(freq: number, duration: number, volume: number, type: OscillatorType, bus: AudioNode, when = ac?.currentTime || 0, endFreq?: number) {
    if (!ac || disposed || voices >= 14) return;
    const o = ac.createOscillator(), g = ac.createGain(); voices++;
    o.type = type; o.frequency.setValueAtTime(Math.max(25, freq), when);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), when + duration);
    g.gain.setValueAtTime(.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), when + .008);
    g.gain.exponentialRampToValueAtTime(.0001, when + duration);
    o.connect(g); g.connect(bus); o.start(when); o.stop(when + duration + .02);
    o.onended = () => { o.disconnect(); g.disconnect(); voices--; };
  }
  let noiseBuffer: AudioBuffer | undefined;
  function noise(duration: number, volume: number, frequency: number) {
    if (!ac || !noiseBuffer || voices >= 12) return;
    const source = ac.createBufferSource(), filter = ac.createBiquadFilter(), g = ac.createGain(); voices++;
    source.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = frequency;
    g.gain.setValueAtTime(Math.max(.0002, volume), ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
    source.connect(filter); filter.connect(g); g.connect(effects); source.start(); source.stop(ac.currentTime + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); g.disconnect(); voices--; };
  }
  function schedule() {
    if (!ac || ac.state !== 'running' || paused || disposed) return;
    const interval = scene === 'run' ? .205 : .29;
    if (nextBeat < ac.currentTime) nextBeat = ac.currentTime;
    while (nextBeat < ac.currentTime + .12) {
      const melody = scene === 'run' ? [64, 67, 71, 74, 71, 67, 69, 71, 62, 66, 69, 74, 69, 66, 67, 69] : [64, 0, 67, 71, 0, 67, 62, 0, 59, 0, 62, 66, 0, 62, 64, 0];
      const midi = melody[beat % melody.length];
      if (settings.music) {
        if (midi) note(440 * 2 ** ((midi - 69) / 12), interval * 1.6, .12, 'sine', music, nextBeat);
        if (beat % 4 === 0) note(440 * 2 ** (((beat % 16 < 8 ? 40 : 43) - 69) / 12), interval * 3, .08, 'triangle', music, nextBeat);
        if (scene === 'run' && beat % 2 === 1) note(120, .05, .045, 'triangle', music, nextBeat, 45);
      }
      beat++; nextBeat += interval;
    }
  }
  async function unlock() {
    if (disposed) return;
    try {
      if (!ac) {
        const Constructor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Constructor) return;
        ac = new Constructor({ latencyHint: 'interactive' });
        if (!ac) return;
        music = ac.createGain(); effects = ac.createGain();
        music.gain.value = 0; effects.gain.value = 0;
        const master = ac.createDynamicsCompressor(); master.threshold.value = -12; master.ratio.value = 5;
        music.connect(master); effects.connect(master); master.connect(ac.destination);
        noiseBuffer = ac.createBuffer(1, ac.sampleRate * .5, ac.sampleRate);
        const data = noiseBuffer.getChannelData(0); let state = 271828;
        for (let i = 0; i < data.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) | 0; data[i] = (state / 2147483648) * .7; }
        motor = ac.createOscillator(); motor.type = 'triangle'; motor.frequency.value = 55;
        motorGain = ac.createGain(); motorGain.gain.value = 0; motor.connect(motorGain); motorGain.connect(effects); motor.start();
        volumes(); nextBeat = ac.currentTime + .04;
      }
      if (!paused) { await ac.resume(); startScheduler(); }
    } catch { /* A browser without audio can still play every game. */ }
  }
  function play(name: string, intensity = 1) {
    if (!ac || paused || disposed || !settings.effects || ac.state !== 'running') return;
    const power = Math.max(.08, Math.min(1.5, Number.isFinite(intensity) ? intensity : 1)), now = ac.currentTime;
    if ((recent.get(name) ?? -10) > now - (name === 'stretch' ? .3 : .045)) return;
    recent.set(name, now);
    switch (name) {
      case 'pick': note(500, .09, .08 * power, 'sine', effects, now, 750); break;
      case 'stick': note(180, .14, .16 * power, 'sine', effects, now, 80); noise(.07, .06 * power, 1300); break;
      case 'stretch': note(240, .18, .045 * power, 'triangle', effects, now, 460); break;
      case 'snap': noise(.12, .2 * power, 5500); note(420, .08, .13 * power, 'triangle', effects, now, 70); break;
      case 'metal': note(810, .25, .12 * power, 'sine', effects); note(1310, .12, .05 * power, 'sine', effects); break;
      case 'plastic': note(190, .12, .13 * power, 'triangle', effects, now, 95); break;
      case 'wood': case 'land': case 'impact': noise(.09, .2 * power, 650); note(95, .13, .16 * power, 'sine', effects, now, 40); break;
      case 'jump': note(220, .15, .12 * power, 'triangle', effects, now, 660); break;
      case 'reflect': note(850, .18, .12 * power, 'sine', effects, now, 1200); break;
      case 'win': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, .32, .13 * power, 'triangle', effects, now + i * .085)); break;
      case 'fail': note(250, .25, .09 * power, 'triangle', effects, now, 150); break;
    }
  }
  return {
    unlock, play,
    setMusic(enabled: boolean) { settings.music = !!enabled; persist(); volumes(); },
    setEffects(enabled: boolean) { settings.effects = !!enabled; persist(); volumes(); },
    setVolume(musicValue: number, effectsValue: number) { settings.musicVolume = clamp(musicValue); settings.effectsVolume = clamp(effectsValue); persist(); volumes(); },
    setScene(value: Scene) { if (scene !== value) { scene = value; beat = 0; nextBeat = (ac?.currentTime || 0) + .04; } },
    setMotor(power: number) { if (disposed || !ac || !motorGain) return; const n = Math.min(1, Math.max(0, Number.isFinite(power) ? power : 0)); motor.frequency.setTargetAtTime(45 + n * 115, ac.currentTime, .08); motorGain.gain.setTargetAtTime(paused ? 0 : n * .045, ac.currentTime, .06); },
    pause() {
      if (disposed) return;
      paused = true; stopScheduler(); volumes();
      if (ac && motorGain) { motorGain.gain.cancelScheduledValues(ac.currentTime); motorGain.gain.setValueAtTime(0, ac.currentTime); }
      void ac?.suspend().catch(() => {});
    },
    resume() {
      if (disposed) return;
      paused = false;
      if (ac) { nextBeat = ac.currentTime + .04; volumes(); void ac.resume().then(startScheduler).catch(() => {}); }
    },
    dispose() { if (disposed) return; disposed = true; stopScheduler(); recent.clear(); if (ac) void ac.close().catch(() => {}); },
    get settings() { return { ...settings }; }
  };
}
