import {setIconLabel} from '../brand/icons';
import {createFriendlyNarrator} from './friendly-narrator';

export interface ReadAloudOptions {
  text(): string;
  canRead?(): boolean;
  label?: string;
  buttonClass?: string;
  onStarted?(): void;
  onDelivered?():void;
  onUnavailable?():void;
  deviceOnly?:boolean|(()=>boolean);
}
/** A visible, tap-only speaker control. Dictation keeps its separate microphone. */
export function createReadAloudControl(options: ReadAloudOptions) {
  let disposed = false;
  const element = document.createElement('div'); element.className = 'jems-read-aloud';
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'jems-read-aloud-button ' + (options.buttonClass || '');
  button.dataset.action = 'read-aloud';
  const notice = document.createElement('p'); notice.className = 'jems-reading-notice';
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  element.append(button, notice);
  const canRead = () => !disposed && element.isConnected && options.canRead?.() !== false;
  const narrator = createFriendlyNarrator(canRead);
  function showIdle() { if(notice.textContent==='Tap Play reading to hear it.')notice.textContent='';setIconLabel(button, 'volume', options.label || 'Read this to me'); button.setAttribute('aria-pressed', 'false'); }
  button.onclick = () => {
    if (narrator.waitingToPlay) { notice.textContent='';setIconLabel(button,'stop','Stop reading');button.setAttribute('aria-pressed','true');narrator.resume();return; }
    if (narrator.active) { narrator.cancel(); return; }
    if (!canRead()) return;
    const text = options.text().trim(); if (!text) return;
    notice.textContent = ''; setIconLabel(button, 'stop', 'Stop reading'); button.setAttribute('aria-pressed', 'true');
    narrator.speak(text, {
      onStarted: () => {notice.textContent='';setIconLabel(button,'stop','Stop reading');button.setAttribute('aria-pressed','true');options.onStarted?.();},
      onPlayRequired: () => {setIconLabel(button,'volume','Play reading');button.setAttribute('aria-pressed','false');notice.textContent='Tap Play reading to hear it.';},
      onMode: mode => {button.dataset.voiceMode=mode;},
      onFinished: showIdle, onDelivered: options.onDelivered,
      onUnavailable: () => { options.onUnavailable?.(); notice.textContent = 'Voice is not ready here. Ask a grown-up to read with you.'; },
    },{deviceOnly:typeof options.deviceOnly==='function'?options.deviceOnly():options.deviceOnly});
  };
  showIdle();
  return { element, button, notice,
    stop() { narrator.cancel(); },
    refresh() { if (!canRead()) narrator.cancel(); },
    dispose() { disposed = true; narrator.cancel(); button.onclick = null; element.remove(); },
  };
}
