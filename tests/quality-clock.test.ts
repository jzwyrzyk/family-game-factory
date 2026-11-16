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

test('clock starts at timestamp zero and keeps explicit pause separate from visibility and focus', () => {
  const browser = browserClock(); let updates = 0, pauses = 0, resumes = 0;
  const clock = createFixedClock({ update: () => updates++, render() {}, onPause: () => pauses++, onResume: () => resumes++ });
  try {
    clock.start(); browser.frame(0); browser.frame(1000 / 60); assert.equal(updates, 1);
    clock.pause('user'); browser.doc.hidden = true; browser.doc.dispatchEvent(new Event('visibilitychange'));
    browser.win.dispatchEvent(new Event('blur')); browser.frame(5000); assert.equal(updates, 1);
    browser.doc.hidden = false; browser.doc.dispatchEvent(new Event('visibilitychange')); browser.win.dispatchEvent(new Event('focus'));
    assert.equal(clock.paused, true, 'returning to the tab cannot override an explicit pause');
    clock.resume('user'); browser.frame(6000); browser.frame(6000 + 1000 / 60);
    assert.equal(updates, 2, 'paused time never catches up'); assert.equal(pauses, 1); assert.equal(resumes, 1);
  } finally { clock.dispose(); browser.restore(); }
});
test('an initially unfocused game waits for focus and disposal inside a tick stops catch-up, rendering and RAF', () => {
  const browser = browserClock(); browser.doc.focused = false; let updates = 0, renders = 0;
  const clock = createFixedClock({ update() { updates++; clock.dispose(); }, render() { renders++; } });
  try {
    clock.start(); browser.frame(0); browser.frame(100); assert.equal(updates, 0); assert.equal(clock.paused, true);
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
