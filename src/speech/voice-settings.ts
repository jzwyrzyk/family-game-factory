import {createFriendlyNarrator, friendlyLocalVoices, isEnhancedReadingVoice, preferredReadingVoice, setPreferredReadingVoice} from './friendly-narrator';
import {setIconLabel} from '../brand/icons';

/** A device preference, separate from a child's learning/profile records. */
export function installVoiceSettings(target: HTMLElement | null) {
  if (!target) return;
  const panel = document.createElement('section'); panel.className = 'jems-voice-settings';
  panel.setAttribute('aria-labelledby', 'parentReadingVoiceTitle');
  const heading = document.createElement('h3'); heading.id = 'parentReadingVoiceTitle'; heading.textContent = 'Reading voice';
  const explanation = document.createElement('p'); explanation.textContent = 'Jems uses its natural voice when it is available for this session. Choose and preview the on-device backup voice below.';
  const label = document.createElement('label'); label.htmlFor = 'parentReadingVoiceChoice'; label.textContent = 'On-device voice';
  const select = document.createElement('select'); select.id = label.htmlFor;
  const actions = document.createElement('div'); actions.className = 'jems-read-aloud';
  const naturalPreview=document.createElement('button');naturalPreview.type='button';naturalPreview.id='parentNaturalVoicePreview';naturalPreview.className='jems-read-aloud-button';
  const preview = document.createElement('button'); preview.type = 'button'; preview.id = 'parentReadingVoicePreview'; preview.className = 'jems-read-aloud-button';
  const notice = document.createElement('p'); notice.className = 'jems-reading-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const narrator = createFriendlyNarrator(() => panel.isConnected && !!panel.getClientRects().length);
  let activePreview:'natural'|'device'|null=null,playingMode:'natural'|'device'='device';
  const idle = () => { if(notice.textContent==='Tap Play preview to hear the voice.')notice.textContent='';activePreview=null;setIconLabel(preview, 'volume', 'Preview device voice'); preview.setAttribute('aria-pressed', 'false');setIconLabel(naturalPreview,'volume','Preview Jems voice');naturalPreview.setAttribute('aria-pressed','false'); };
  function refresh() {
    const chosen = preferredReadingVoice(); select.replaceChildren();
    const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Best available on this device'; select.append(automatic);
    let voices: SpeechSynthesisVoice[] = [];
    try { voices = friendlyLocalVoices(window.speechSynthesis?.getVoices() || []); } catch { /* Written instructions stay available. */ }
    for (const voice of voices) {
      const option = document.createElement('option'); option.value = voice.voiceURI || voice.name;
      option.textContent = voice.name + (isEnhancedReadingVoice(voice) ? ' · higher quality' : ' · device voice'); select.append(option);
    }
    if (chosen && voices.some(voice => (voice.voiceURI || voice.name) === chosen)) select.value = chosen;
    else select.value = '';
    if (chosen && !voices.some(voice => (voice.voiceURI || voice.name) === chosen)) notice.textContent = 'Your chosen device voice is not installed here. Jems will use the best available voice.';
    else if (!voices.length) notice.textContent = 'No suitable local voice is installed. Natural narration depends on this session’s availability; written text stays visible.';
    else if (!voices.some(isEnhancedReadingVoice)) notice.textContent = 'These device voices may sound synthetic. Preview one before choosing it.';
    else notice.textContent = 'Voice choice is saved only on this browser. Speech never turns on the microphone.';
  }
  select.onchange = () => {
    const saved = setPreferredReadingVoice(select.value);
    notice.textContent = saved ? 'Device voice saved. Preview it to hear the difference.' : 'This browser could not save the voice choice.';
  };
  function previewVoice(deviceOnly:boolean) {
    const kind=deviceOnly?'device':'natural',button=deviceOnly?preview:naturalPreview;
    if(activePreview===kind&&narrator.waitingToPlay){notice.textContent='';setIconLabel(button,'stop','Stop preview');button.setAttribute('aria-pressed','true');narrator.resume();return;}
    if(activePreview===kind&&narrator.active){narrator.cancel();return;}
    narrator.cancel();activePreview=kind;
    setIconLabel(button, 'stop', 'Stop preview'); button.setAttribute('aria-pressed', 'true');
    narrator.speak('Hi! I’m here to help. Take your time, and tell me what you would like to make.', {
      onMode: mode=>{playingMode=mode;button.dataset.voiceMode=mode;},
      onStarted:()=>{notice.textContent=playingMode==='natural'?'Now playing the Jems natural voice.':deviceOnly?'Now playing your on-device voice.':'This preview uses the device voice. Natural narration is not available for this request.';},
      onPlayRequired:()=>{setIconLabel(button,'volume','Play preview');button.setAttribute('aria-pressed','false');notice.textContent='Tap Play preview to hear the voice.';},
      onFinished: idle,
      onUnavailable: () => { notice.textContent = deviceOnly?'This device voice is not ready. Choose another voice or check the device’s speech settings.':'This voice preview is unavailable. The written text remains available.'; },
    }, {deviceOnly});
  }
  preview.onclick=()=>previewVoice(true);naturalPreview.onclick=()=>previewVoice(false);
  actions.append(naturalPreview,preview); panel.append(heading, explanation, label, select, actions, notice); target.replaceChildren(panel);
  window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
  window.addEventListener('factory-page', refresh); idle(); refresh();
}
