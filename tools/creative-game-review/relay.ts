// Runs in an opaque iframe. The only generated code is inside the pinned worker.
// The two inputs are public game controls. The only reply is a bounded position.
import {validPosition, SLOT} from './contract';
declare const REVIEW_WORKER: string;

window.addEventListener('message', function connect(event:MessageEvent) {
  if (event.source !== window.parent || event.data !== 'connect' || event.ports.length !== 1) return;
  window.removeEventListener('message', connect);
  const port = event.ports[0];
  const workerUrl = URL.createObjectURL(new Blob([REVIEW_WORKER], {type:'text/javascript'}));
  const worker = new Worker(workerUrl);
  URL.revokeObjectURL(workerUrl);
  let waiting = true;
  function stop() {
    worker.terminate();
    port.postMessage(null);
    port.close();
  }
  worker.onerror = stop;
  worker.onmessage = ({data}) => {
    if (!waiting || !Array.isArray(data?.commands) || data.commands.length !== 3) { stop(); return; }
    const slot = data.commands[1];
    if (slot?.type !== 'image' || slot.key !== SLOT || slot.assetId !== SLOT ||
        slot.y !== 280 || slot.width !== 100 || slot.height !== 104 || !validPosition(slot.x)) { stop(); return; }
    waiting = false;
    port.postMessage(slot.x);
  };
  port.onmessage = ({data}) => {
    if (waiting || data !== 'left' && data !== 'right') { stop(); return; }
    waiting = true;
    const pointer = {x:0,y:0,down:false,pressed:false,released:false};
    worker.postMessage({type:'tick',steps:4,input:{pressed:[data],tap:null,pointer}});
  };
  worker.postMessage({type:'start'});
}, false);
