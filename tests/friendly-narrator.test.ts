import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {chooseFriendlyVoice, createFriendlyNarrator, stopReadAloud,
  FRIENDLY_READING_PITCH, FRIENDLY_READING_RATE, VOICE_LOADING_TIMEOUT_MS} from '../src/speech/friendly-narrator';

const voice = (name: string, lang = 'en-US', localService = true): SpeechSynthesisVoice =>
  ({name, lang, localService, voiceURI: name, default: false});
class Utterance {
  voice: SpeechSynthesisVoice | null = null; lang = ''; rate = 1; pitch = 1;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
class Synth extends EventTarget {
  voices: SpeechSynthesisVoice[] = []; spoken: Utterance[] = []; cancellations = 0;
  getVoices() { return this.voices; }
  speak(utterance: Utterance) { this.spoken.push(utterance); }
  cancel() { this.cancellations++; }
  load(voices: SpeechSynthesisVoice[]) { this.voices = voices; this.dispatchEvent(new Event('voiceschanged')); }
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
function setup(voices: SpeechSynthesisVoice[] = []) {
  const synth = new Synth(); synth.voices = voices;
  Object.defineProperty(globalThis, 'window', {value: {speechSynthesis: synth}, configurable: true});
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {value: Utterance, configurable: true});
  return synth;
}
afterEach(() => {
  stopReadAloud();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete (globalThis as any).window;
  if (originalUtterance) Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', originalUtterance); else delete (globalThis as any).SpeechSynthesisUtterance;
});

test('named female English voices are selected instead of default male, unknown or remote voices', () => {
  const zira = voice('Microsoft Zira Desktop - English (United States)');
  const voices = [voice('Microsoft David'), voice('Microsoft Jenny Online (Natural)', 'en-US', false),
    voice('Default English'), voice('Samantha', 'fr-FR'), zira];
  assert.equal(chooseFriendlyVoice(voices), zira);
  assert.equal(chooseFriendlyVoice(voices.slice(0, -1)), null);
});

test('enhanced female voices rank ahead of basic voices consistently across browser list order', () => {
  const premium = voice('Samantha (Enhanced)'), natural = voice('Microsoft Jenny (Natural)');
  const voices = [voice('Microsoft Zira'), premium, voice('Samantha'), natural];
  assert.equal(chooseFriendlyVoice(voices), natural);
  assert.equal(chooseFriendlyVoice([...voices].reverse()), natural);
  assert.equal(chooseFriendlyVoice(voices.slice(0, -1)), premium);
});

test('speech remains explicit, uses modest natural settings and records only a real start once', () => {
  const preferred = voice('Samantha (Enhanced)'), synth = setup([preferred]);
  const reader = createFriendlyNarrator(() => true);
  let starts = 0, finishes = 0;
  assert.equal(synth.spoken.length, 0, 'creating a narrator must not autoplay');
  reader.speak('Which word has three letters?', {onStarted: () => starts++, onFinished: () => finishes++});
  const utterance = synth.spoken[0];
  assert.equal(utterance.voice, preferred); assert.equal(utterance.lang, 'en-US');
  assert.equal(utterance.rate, FRIENDLY_READING_RATE); assert.equal(utterance.pitch, FRIENDLY_READING_PITCH);
  assert.equal(starts, 0, 'queueing speech alone is not listening evidence');
  utterance.onstart?.(); utterance.onstart?.(); assert.equal(starts, 1);
  utterance.onend?.(); assert.equal(finishes, 1); assert.equal(reader.active, false);
});

test('an initially empty browser voice list is loaded without silently selecting a default', () => {
  const synth = setup(), reader = createFriendlyNarrator(() => true);
  reader.speak('Read the clue.');
  assert.equal(synth.spoken.length, 0); assert.equal(reader.active, true);
  synth.load([voice('David'), voice('Samantha')]);
  assert.equal(synth.spoken.length, 1); assert.equal(synth.spoken[0].voice?.name, 'Samantha');
  synth.dispatchEvent(new Event('voiceschanged')); assert.equal(synth.spoken.length, 1);
});

test('leaving or stopping while voices load prevents delayed speech and support credit', () => {
  const synth = setup(), reader = createFriendlyNarrator(() => true); let starts = 0;
  reader.speak('Private words.', {onStarted: () => starts++}); reader.cancel();
  synth.load([voice('Samantha')]);
  assert.equal(synth.spoken.length, 0); assert.equal(starts, 0); assert.equal(reader.active, false);
});

test('changing owner or activity before queued audio starts prevents stale playback and evidence', () => {
  const synth = setup([voice('Samantha')]); let current = true, starts = 0;
  const reader = createFriendlyNarrator(() => current);
  reader.speak('First child question.', {onStarted: () => starts++});
  current = false; synth.spoken[0].onstart?.();
  assert.equal(starts, 0); assert.equal(reader.active, false); assert.ok(synth.cancellations >= 2);
});

test('a new reader replaces the prior request, and stale callbacks cannot cancel the new voice', () => {
  const synth = setup([voice('Samantha')]), first = createFriendlyNarrator(() => true), second = createFriendlyNarrator(() => true);
  let oldStarts = 0, newStarts = 0;
  first.speak('Old question.', {onStarted: () => oldStarts++});
  const stale = synth.spoken[0].onstart;
  second.speak('New question.', {onStarted: () => newStarts++});
  const cancelCount = synth.cancellations;
  stale?.();
  assert.equal(synth.cancellations, cancelCount, 'late old events must not cancel the new request');
  synth.spoken[1].onstart?.();
  assert.equal(oldStarts, 0); assert.equal(newStarts, 1); assert.equal(second.active, true);
});

test('no known local female voice produces an honest fallback with no speech or support', async () => {
  const synth = setup([voice('David'), voice('Jenny Online', 'en-US', false)]);
  const reader = createFriendlyNarrator(() => true); let starts = 0, unavailable = '';
  reader.speak('Question.', {onStarted: () => starts++, onUnavailable: reason => unavailable = reason});
  await new Promise(resolve => setTimeout(resolve, VOICE_LOADING_TIMEOUT_MS + 20));
  assert.equal(unavailable, 'voice'); assert.equal(synth.spoken.length, 0); assert.equal(starts, 0); assert.equal(reader.active, false);
});

test('a synthesis failure before start produces no support credit and is recoverable', () => {
  const synth = setup([voice('Samantha')]), reader = createFriendlyNarrator(() => true); let starts = 0, unavailable = '';
  reader.speak('Question.', {onStarted: () => starts++, onUnavailable: reason => unavailable = reason});
  synth.spoken[0].onerror?.();
  assert.equal(starts, 0); assert.equal(unavailable, 'audio'); assert.equal(reader.active, false);
  reader.speak('Try again.'); assert.equal(synth.spoken.length, 2);
});
