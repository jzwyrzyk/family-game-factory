/**
 * One explicit, on-device speaking policy for child-facing read-aloud controls.
 * Web Speech exposes neither gender nor an expressive style setting. Use known
 * female voice names, prefer enhanced/natural variants, and never leave `voice`
 * unset (which would silently restore the browser's arbitrary default voice).
 * Actual sound and installed voice availability remain device-specific.
 */
type VoiceDescription = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService' | 'voiceURI'>;
const femaleNames = [
  /\b(?:jenny|aria|ava)\b/i,
  /\b(?:samantha|allison|zoe)\b/i,
  /\b(?:sonia|susan|serena|karen|moira|tessa|fiona|catherine|linda|heera|neerja)\b/i,
  /\bzira\b/i,
];
export const FRIENDLY_READING_RATE = .98;
export const FRIENDLY_READING_PITCH = 1.05;
export const VOICE_LOADING_TIMEOUT_MS = 1500;

export function chooseFriendlyVoice<T extends VoiceDescription>(voices: readonly T[]): T | null {
  const score = (voice: T) => {
    if (voice.localService !== true || !/^en(?:[-_]|$)/i.test(voice.lang)) return -1;
    const match = femaleNames.findIndex(pattern => pattern.test(voice.name));
    if (match < 0) return -1;
    const quality = /\b(?:natural|neural|enhanced|premium|hd)\b/i.test(voice.name + ' ' + voice.voiceURI) ? 1000 : 0;
    return quality + (/^en[-_]US$/i.test(voice.lang) ? 100 : 0) + (femaleNames.length - match) * 10;
  };
  return voices.filter(voice => score(voice) >= 0).sort((a, b) => score(b) - score(a)
    || (a.voiceURI || a.name).localeCompare(b.voiceURI || b.name))[0] || null;
}

interface ReadingCallbacks {
  /** Records support only when the browser reports that this utterance started. */
  onStarted?(): void;
  onFinished?(): void;
  onUnavailable?(reason: 'voice' | 'audio'): void;
}
type ActiveReading = { owner: object; cancel(): void };
let activeReading: ActiveReading | null = null;

/** Also invalidates a pending voice-list event before opening a microphone. */
export function stopReadAloud() { activeReading?.cancel(); }

export function createFriendlyNarrator(canSpeak: () => boolean) {
  const owner = {};
  function cancel() { if (activeReading?.owner === owner) activeReading.cancel(); }
  function speak(text: string, callbacks: ReadingCallbacks = {}) {
    stopReadAloud();
    if (!text.trim() || !canSpeak()) return;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      callbacks.onUnavailable?.('voice'); callbacks.onFinished?.(); return;
    }
    let settled = false, started = false, utterance: SpeechSynthesisUtterance | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !settled && activeReading === request && canSpeak();
    function cleanUp() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      synth!.removeEventListener?.('voiceschanged', tryVoice);
      if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
      if (activeReading === request) activeReading = null;
      callbacks.onFinished?.();
    }
    const request: ActiveReading = { owner, cancel() {
      if (settled) return;
      cleanUp();
      try { synth.cancel(); } catch { /* The written content remains available. */ }
    } };
    function fail(reason: 'voice' | 'audio') {
      if (current()) callbacks.onUnavailable?.(reason);
      request.cancel();
    }
    function tryVoice() {
      if (!current()) { request.cancel(); return; }
      if (utterance) return;
      let voice: SpeechSynthesisVoice | null;
      try { voice = chooseFriendlyVoice(synth!.getVoices()); } catch { fail('voice'); return; }
      if (!voice) return;
      if (timer) clearTimeout(timer);
      synth!.removeEventListener?.('voiceschanged', tryVoice);
      try {
        utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice; utterance.lang = voice.lang;
        utterance.rate = FRIENDLY_READING_RATE; utterance.pitch = FRIENDLY_READING_PITCH;
      } catch { fail('audio'); return; }
      utterance.onstart = () => {
        if (!current()) { request.cancel(); return; }
        if (started) return;
        started = true;
        try { callbacks.onStarted?.(); } catch { fail('audio'); }
      };
      utterance.onend = cleanUp;
      utterance.onerror = () => fail('audio');
      try { synth!.cancel(); synth!.speak(utterance); } catch { fail('audio'); }
    }
    activeReading = request;
    // Resolve synchronously when possible, preserving the original tap gesture.
    // Some browsers initially return [] and deliver voices later.
    synth.addEventListener?.('voiceschanged', tryVoice);
    timer = setTimeout(() => { if (!utterance) fail('voice'); }, VOICE_LOADING_TIMEOUT_MS);
    tryVoice();
  }
  return { speak, cancel, get active() { return activeReading?.owner === owner; } };
}
