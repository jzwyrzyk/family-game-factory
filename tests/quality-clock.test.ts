import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedClock } from '../src/quality/clock';
import { createGameAudio } from '../src/quality/audio';

function replaceGlobal(name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => original ? Object.defineProperty(globalThis, name, original) : Reflect.deleteProperty(globalThis, name);
}
function browserClock() {
  const doc = Object.assign(new EventTarget(), { hidden: false, focused: true, hasFocus() { return this.focused; } });
  const win = new EventTarget(), callbacks = new Map<number, FrameRequestCallback>(); let id = 0;
  const restore = [replaceGlobal('window', win), replaceGlobal('document', doc),
    replaceGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; }),
    replaceGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key))];
  return { doc, win, callbacks, frame(now: number) {
    const entry = callbacks.entries().next().value;
    assert.ok(entry, 'a frame must be scheduled'); callbacks.delete(entry[0]); entry[1](now);
  }, restore() { restore.reverse().forEach(fn => fn()); } };
}

test('clock paints a pause once and keeps explicit pause separate from visibility and focus', () => {
  const browser = browserClock(); let updates = 0, pauses = 0, resumes = 0;
  const clock = createFixedClock({ update: () => updates++, render() {},
    onPause: () => { pauses++; clock.invalidate(); }, onResume: () => { resumes++; clock.invalidate(); } });
  try {
    clock.start(); browser.frame(0); browser.frame(1000 / 60); assert.equal(updates, 1);
    clock.pause('user'); browser.doc.hidden = true; browser.doc.dispatchEvent(new Event('visibilitychange'));
    browser.win.dispatchEvent(new Event('blur')); assert.equal(browser.callbacks.size, 1, 'pause reasons share one pending paint');
    browser.frame(5000); assert.equal(updates, 1); assert.equal(clock.stats.frames, 3);
    assert.equal(browser.callbacks.size, 0, 'a stable pause has no recurring RAF or redraw');
    browser.doc.hidden = false; browser.doc.dispatchEvent(new Event('visibilitychange')); browser.win.dispatchEvent(new Event('focus'));
    assert.equal(clock.paused, true, 'returning to the tab cannot override an explicit pause');
    assert.equal(browser.callbacks.size, 1); browser.frame(5500); assert.equal(updates, 1);
    assert.equal(browser.callbacks.size, 0, 'partial resume only refreshes the paused view');
    clock.pause('user'); assert.equal(browser.callbacks.size, 0, 'repeating an unchanged pause needs no paint');
    clock.resume('user'); clock.resume('user'); clock.start(); assert.equal(browser.callbacks.size, 1, 'resume creates exactly one RAF chain');
    browser.frame(6000); browser.frame(6000 + 1000 / 60);
    assert.equal(updates, 2, 'paused time never catches up'); assert.equal(pauses, 1); assert.equal(resumes, 1);
    assert.equal(browser.callbacks.size, 1);
  } finally { clock.dispose(); browser.restore(); }
});
test('an initially unfocused game waits for focus and disposal inside a tick stops catch-up, rendering and RAF', () => {
  const browser = browserClock(); browser.doc.focused = false; let updates = 0, renders = 0;
  const clock = createFixedClock({ update() { updates++; clock.dispose(); }, render() { renders++; } });
  try {
    clock.start(); browser.frame(0); assert.equal(updates, 0); assert.equal(clock.paused, true); assert.equal(renders, 1);
    assert.equal(browser.callbacks.size, 0, 'an initially unfocused game paints once and then waits');
    clock.invalidate(); browser.frame(100); assert.equal(updates, 0); assert.equal(renders, 2); assert.equal(browser.callbacks.size, 0);
    browser.doc.focused = true; browser.win.dispatchEvent(new Event('focus')); browser.frame(200);
    const priorRenders = renders;
    browser.frame(300); assert.equal(updates, 1); assert.equal(renders, priorRenders); assert.equal(browser.callbacks.size, 0);
    assert.equal(clock.stats.steps, 1);
  } finally { clock.dispose(); browser.restore(); }
});
test('disposal inside render does not create another frame', () => {
  const browser = browserClock();
  const clock = createFixedClock({ update() {}, render() { clock.dispose(); } });
  try { clock.start(); browser.frame(0); assert.equal(browser.callbacks.size, 0); } finally { clock.dispose(); browser.restore(); }
});

test('paused resize/edit invalidations coalesce without advancing time or simulation', () => {
  const browser = browserClock(); let updates = 0; const elapsed: number[] = [];
  const clock = createFixedClock({ update: () => updates++, render(_alpha, time) { elapsed.push(time); } });
  try {
    clock.invalidate(); assert.equal(browser.callbacks.size, 0, 'invalidation cannot start an unstarted clock');
    clock.start(); browser.frame(0); browser.frame(20);
    clock.pause(); browser.frame(30);
    const before = clock.stats, frozenTime = elapsed.at(-1);
    clock.invalidate(); clock.invalidate(); clock.invalidate();
    assert.equal(browser.callbacks.size, 1); browser.frame(120000);
    assert.equal(browser.callbacks.size, 0); assert.equal(updates, 1);
    assert.equal(elapsed.at(-1), frozenTime); assert.equal(clock.stats.frames, before.frames + 1);
    assert.equal(clock.stats.steps, before.steps); assert.equal(clock.stats.droppedSeconds, before.droppedSeconds);
    assert.equal(clock.stats.frameMs, before.frameMs, 'paused redraw gaps are not active frame intervals');
    clock.invalidate(); clock.dispose(); clock.invalidate(); clock.resume(); clock.start();
    assert.equal(browser.callbacks.size, 0, 'disposal cancels the pending paint and rejects later requests');
  } finally { clock.dispose(); browser.restore(); }
});

test('pause during an update stops catch-up and paints the latest state once', () => {
  const browser = browserClock(); const steps: number[] = [], alphas: number[] = [];
  const clock = createFixedClock({ update(dt) { steps.push(dt); if (steps.length === 1) clock.pause(); }, render(alpha) { alphas.push(alpha); } });
  try {
    clock.start(); browser.frame(0); browser.frame(100);
    assert.deepEqual(steps, [1 / 60]); assert.equal(clock.stats.steps, 1);
    assert.equal(alphas.at(-1), 1, 'the pause displays the latest complete simulation state');
    assert.equal(alphas.length, 2); assert.equal(browser.callbacks.size, 0);
    clock.resume(); browser.frame(20000); assert.equal(steps.length, 1);
    browser.frame(20000 + 1000 / 60); assert.deepEqual(steps, [1 / 60, 1 / 60]);
    assert.equal(browser.callbacks.size, 1);
  } finally { clock.dispose(); browser.restore(); }
});

test('pause during rendering receives one final paused paint and then becomes quiescent', () => {
  const browser = browserClock(); const views: boolean[] = []; let updates = 0;
  const clock = createFixedClock({ update() { updates++; }, render() { views.push(clock.paused); if (views.length === 1) clock.pause(); } });
  try {
    clock.start(); browser.frame(0); assert.equal(browser.callbacks.size, 1);
    browser.frame(5000); assert.deepEqual(views, [false, true]); assert.equal(updates, 0);
    assert.equal(browser.callbacks.size, 0); assert.equal(clock.stats.frames, 2);
  } finally { clock.dispose(); browser.restore(); }
});

test('disposal from pause or resume callbacks cannot resurrect the frame loop', () => {
  for (const disposeAt of ['pause', 'resume']) {
    const browser = browserClock(); let renders = 0;
    const clock = createFixedClock({ update() {}, render() { renders++; },
      onPause() { if (disposeAt === 'pause') clock.dispose(); }, onResume() { if (disposeAt === 'resume') clock.dispose(); } });
    try {
      clock.start(); browser.frame(0); clock.pause();
      if (disposeAt === 'resume') { browser.frame(100); clock.resume(); }
      clock.invalidate(); clock.resume(); clock.start();
      assert.equal(browser.callbacks.size, 0, disposeAt); assert.equal(renders, disposeAt === 'pause' ? 1 : 2);
    } finally { clock.dispose(); browser.restore(); }
  }
});

class Param {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}
class AudioNodeStub {
  gain = new Param(); frequency = new Param(); threshold = new Param(); ratio = new Param(); type = 'sine';
  connect() {} disconnect() {} start() {} stop() {}
}
function audioBrowser(deferredResume = false) {
  const timers = new Map<number, () => void>(); let timerId = 0;
  const contexts: ContextStub[] = [];
  class ContextStub {
    state = 'suspended'; currentTime = 0; sampleRate = 8000; destination = new AudioNodeStub(); gains: AudioNodeStub[] = [];
    completeResume: (() => void) | undefined;
    constructor() { contexts.push(this); }
    createGain() { const gain = new AudioNodeStub(); this.gains.push(gain); return gain; }
    createOscillator() { return new AudioNodeStub(); }
    createDynamicsCompressor() { return new AudioNodeStub(); }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { this.state = 'running'; return deferredResume ? new Promise<void>(resolve => { this.completeResume = resolve; }) : Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const restore = [replaceGlobal('window', { AudioContext: ContextStub }), replaceGlobal('localStorage', { getItem: () => null, setItem() {} }),
    replaceGlobal('setInterval', (fn: () => void) => { timers.set(++timerId, fn); return timerId; }), replaceGlobal('clearInterval', (key: number) => timers.delete(key))];
  return { contexts, timers, restore() { restore.reverse().forEach(fn => fn()); } };
}
test('audio pause stops its scheduler and motor, resume starts one scheduler, and dispose closes it', async () => {
  const browser = audioBrowser(), audio = createGameAudio();
  try {
    assert.equal(browser.contexts.length, 0, 'audio does not start before a gesture unlock');
    await audio.unlock(); assert.equal(browser.timers.size, 1);
    const context = browser.contexts[0], motorGain = context.gains[2];
    audio.setMotor(1); assert.ok(motorGain.gain.value > 0);
    audio.pause(); assert.equal(context.state, 'suspended'); assert.equal(browser.timers.size, 0); assert.equal(motorGain.gain.value, 0);
    audio.resume(); await Promise.resolve(); assert.equal(browser.timers.size, 1); assert.equal(motorGain.gain.value, 0);
    await audio.unlock(); assert.equal(browser.timers.size, 1);
    audio.dispose(); assert.equal(browser.timers.size, 0); assert.equal(context.state, 'closed');
    audio.resume(); await Promise.resolve(); assert.equal(browser.timers.size, 0);
  } finally { audio.dispose(); browser.restore(); }
});
test('a delayed browser audio unlock cannot resurrect a disposed game', async () => {
  const browser = audioBrowser(true), audio = createGameAudio();
  try {
    const unlocking = audio.unlock(); const context = browser.contexts[0];
    audio.dispose(); context.completeResume!(); await unlocking;
    assert.equal(context.state, 'closed'); assert.equal(browser.timers.size, 0);
  } finally { audio.dispose(); browser.restore(); }
});
