/** Shared explicit read-aloud. Natural narration is optional and status-gated. */
type VoiceDescription = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService' | 'voiceURI'>;
const femaleNames = [
  /\b(?:jenny|aria|ava)\b/i,
  /\b(?:samantha|allison|zoe|siri female|shelley|nicky)\b/i,
  /\b(?:sonia|susan|serena|karen|moira|tessa|fiona|catherine|linda|heera|neerja)\b/i,
  /\bzira\b/i,
];
const qualityName = /\b(?:natural|neural|enhanced|premium|hd)\b/i;
const basicName = /\b(?:zira|espeak|robot|whisper|novelty)\b/i;
const PREFERENCE_KEY = 'jems.reading-voice.v1';
export const FRIENDLY_READING_RATE = .98;
// Keep the voice's recorded pitch. Raising a synthetic voice does not make it caring.
export const FRIENDLY_READING_PITCH = 1;
export const VOICE_LOADING_TIMEOUT_MS = 1500;
export const VOICE_START_TIMEOUT_MS = 4000;

export function friendlyLocalVoices<T extends VoiceDescription>(voices: readonly T[]): T[] {
  const score = (voice: T) => {
    if (voice.localService !== true || !/^en(?:[-_]|$)/i.test(voice.lang)) return -1;
    const match = femaleNames.findIndex(pattern => pattern.test(voice.name));
    if (match < 0) return -1;
    const quality = qualityName.test(voice.name + ' ' + voice.voiceURI) ? 1000 : 0;
    return quality + (/^en[-_]US$/i.test(voice.lang) ? 100 : 0) + (femaleNames.length - match) * 10;
  };
  return voices.filter(voice => score(voice) >= 0).sort((a, b) => score(b) - score(a)
    || (a.voiceURI || a.name).localeCompare(b.voiceURI || b.name));
}
export function chooseFriendlyVoice<T extends VoiceDescription>(voices: readonly T[], preferred = ''): T | null {
  const candidates = friendlyLocalVoices(voices);
  // A grown-up can deliberately preview and choose a basic local voice. The
  // automatic policy does not silently substitute a known robotic legacy voice.
  return candidates.find(voice => !!preferred && (voice.voiceURI || voice.name) === preferred)
    || candidates.find(voice => !basicName.test(voice.name + ' ' + voice.voiceURI)) || null;
}
export function preferredReadingVoice(): string {
  try { const value = window.localStorage?.getItem(PREFERENCE_KEY); return value && value.length <= 500 ? value : ''; }
  catch { return ''; }
}
export function setPreferredReadingVoice(value: string): boolean {
  stopReadAloud();
  if (value.length > 500) return false;
  try { if (value) window.localStorage.setItem(PREFERENCE_KEY, value); else window.localStorage.removeItem(PREFERENCE_KEY); return true; }
  catch { return false; }
}
export function isEnhancedReadingVoice(voice: VoiceDescription): boolean {
  return qualityName.test(voice.name + ' ' + voice.voiceURI);
}

export interface NaturalNarrationProvider {
  /** A status check sends no child text and never initiates synthesis. */
  available(signal: AbortSignal): Promise<boolean>;
  /** One explicitly requested synthesis. The transport must never replay this POST. */
  read(text: string, signal: AbortSignal): Promise<Blob>;
}
let naturalProvider: NaturalNarrationProvider | null = null;
export function configureNaturalNarration(provider: NaturalNarrationProvider | null) {
  stopReadAloud(); naturalProvider = provider;
}
interface ReadingCallbacks {
  /** Records support only once, when actual audio starts. */
  onStarted?(): void;
  onFinished?(): void;
  onUnavailable?(reason: 'voice' | 'audio'): void;
  onMode?(mode: 'natural' | 'device'): void;
  /** Mobile playback needs another tap; retain this request without resynthesis. */
  onPlayRequired?(): void;
}
type ActiveReading = { owner: object; cancel(): void; readonly waitingToPlay?: boolean; resume?(): void };
let activeReading: ActiveReading | null = null;
const lifecycleWindows = new WeakSet<object>();
function installReadingLifecycle() {
  if (typeof window === 'undefined' || !window.addEventListener || lifecycleWindows.has(window)) return;
  lifecycleWindows.add(window);
  for (const event of ['factory-page', 'factory-profile-before-change', 'factory-profile', 'pagehide']) window.addEventListener(event, stopReadAloud);
  window.document?.addEventListener('visibilitychange', () => { if (window.document.hidden) stopReadAloud(); });
}
/** Invalidates pending status, synthesis, voice discovery and playing audio. */
export function stopReadAloud() { activeReading?.cancel(); }

export function createFriendlyNarrator(canSpeak: () => boolean) {
  installReadingLifecycle();
  const owner = {};
  function cancel() { if (activeReading?.owner === owner) activeReading.cancel(); }
  function speak(text: string, callbacks: ReadingCallbacks = {}, options: { deviceOnly?: boolean } = {}) {
    stopReadAloud();
    if (!text.trim() || !canSpeak()) { callbacks.onFinished?.(); return; }
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const controller = new AbortController();
    let settled = false, started = false, utterance: SpeechSynthesisUtterance | null = null;
    let media: HTMLAudioElement | null = null, mediaUrl = '', waitingForGesture = false;
    let deviceVoice: SpeechSynthesisVoice | null = null, deviceGestureRetry = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !settled && activeReading === request && canSpeak();
    function cleanUp() {
      if (settled) return;
      settled = true; controller.abort();
      if (timer) clearTimeout(timer);
      synth?.removeEventListener?.('voiceschanged', tryVoice);
      if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
      if (media) { media.onplaying = media.onended = media.onerror = null; media.pause(); media.removeAttribute('src'); }
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      if (activeReading === request) activeReading = null;
      callbacks.onFinished?.();
    }
    const request: ActiveReading = { owner, get waitingToPlay() { return waitingForGesture; },
      resume() {
        if (waitingForGesture && current()) {
          if (media) void playMedia();
          else { deviceGestureRetry = true; playDeviceVoice(); }
        } else if (!current()) request.cancel();
      },
      cancel() {
      if (settled) return;
      const local = !!utterance; cleanUp();
      if (local) try { synth?.cancel(); } catch { /* Written content remains available. */ }
    } };
    function fail(reason: 'voice' | 'audio') {
      if (current()) callbacks.onUnavailable?.(reason);
      request.cancel();
    }
    function onStarted() {
      if (!current()) { request.cancel(); return; }
      if (timer) clearTimeout(timer);
      waitingForGesture = false;
      if (started) return; started = true;
      try { callbacks.onStarted?.(); } catch { fail('audio'); }
    }
    function startDeadline(device = false) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (started) return;
        // Some mobile engines silently ignore speech queued after async voice
        // discovery/status. Offer one gesture-bound replay of this local text.
        if (device && !deviceGestureRetry) requireDeviceGesture();
        else fail('audio');
      }, VOICE_START_TIMEOUT_MS);
    }
    function tryVoice() {
      if (!current()) { request.cancel(); return; }
      if (utterance || !synth) return;
      try { deviceVoice = chooseFriendlyVoice(synth.getVoices(), preferredReadingVoice()); } catch { fail('voice'); return; }
      if (!deviceVoice) return;
      if (timer) clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', tryVoice);
      playDeviceVoice();
    }
    function requireDeviceGesture() {
      if (!current() || started || !utterance) { request.cancel(); return; }
      if (timer) clearTimeout(timer);
      // An ignored/denied utterance must not start after this control says Play.
      utterance.onstart = utterance.onend = utterance.onerror = null;
      try { synth?.cancel(); } catch { /* A fresh tap can try the prepared voice. */ }
      waitingForGesture = true; callbacks.onPlayRequired?.();
    }
    function isPlaybackDenied(error: unknown) {
      return !!error && typeof error === 'object' &&
        ('name' in error && error.name === 'NotAllowedError' || 'error' in error && error.error === 'not-allowed');
    }
    function playDeviceVoice() {
      if (!current() || !synth || !deviceVoice) { request.cancel(); return; }
      if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
      try {
        utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = deviceVoice; utterance.lang = deviceVoice.lang;
        utterance.rate = FRIENDLY_READING_RATE; utterance.pitch = FRIENDLY_READING_PITCH;
      } catch { fail('audio'); return; }
      const queued = utterance;
      queued.onstart = () => { if (queued === utterance && !waitingForGesture) onStarted(); };
      queued.onend = () => { if (queued === utterance && !waitingForGesture) cleanUp(); };
      queued.onerror = error => {
        if (queued !== utterance || waitingForGesture) return;
        if (!started && isPlaybackDenied(error)) requireDeviceGesture(); else fail('audio');
      };
      waitingForGesture = false; callbacks.onMode?.('device'); startDeadline(true);
      try { synth.cancel(); synth.speak(queued); }
      catch (error) { if (isPlaybackDenied(error)) requireDeviceGesture(); else fail('audio'); }
    }
    function useDeviceVoice() {
      if (!current()) { request.cancel(); return; }
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { fail('voice'); return; }
      synth.addEventListener?.('voiceschanged', tryVoice);
      timer = setTimeout(() => { if (!utterance) fail('voice'); }, VOICE_LOADING_TIMEOUT_MS);
      tryVoice();
    }
    async function playMedia() {
      if (!media || !current()) { request.cancel(); return; }
      waitingForGesture = false; startDeadline();
      try {
        // The call occurs synchronously on resume(), preserving the new tap.
        await media.play();
        if (!current()) request.cancel();
      } catch (error) {
        if (!current()) { request.cancel(); return; }
        if (isPlaybackDenied(error)) {
          if (timer) clearTimeout(timer);
          waitingForGesture = true; callbacks.onPlayRequired?.();
          return;
        }
        fail('audio');
      }
    }
    async function useNaturalVoice(provider: NaturalNarrationProvider) {
      try {
        const available = await provider.available(controller.signal);
        if (!current()) { request.cancel(); return; }
        if (!available) { useDeviceVoice(); return; }
        const audio = await provider.read(text, controller.signal);
        if (!current()) { request.cancel(); return; }
        media = new Audio(); media.preload = 'auto';
        mediaUrl = URL.createObjectURL(audio); media.src = mediaUrl;
        media.onplaying = onStarted; media.onended = cleanUp; media.onerror = () => fail('audio');
        callbacks.onMode?.('natural');
        await playMedia();
      } catch { if (current()) fail('audio'); else request.cancel(); }
    }
    activeReading = request;
    // Long passages stay complete on device; never silently truncate them or
    // turn one tap into a series of paid requests.
    const withinNaturalBudget=text.length<=2000&&new TextEncoder().encode(text).byteLength<=4000;
    const provider = options.deviceOnly||!withinNaturalBudget ? null : naturalProvider;
    if (provider) void useNaturalVoice(provider); else useDeviceVoice();
  }
  return { speak, cancel,
    resume() { if (activeReading?.owner === owner) activeReading.resume?.(); },
    get waitingToPlay() { return activeReading?.owner === owner && activeReading.waitingToPlay === true; },
    get active() { return activeReading?.owner === owner; } };
}
