import archivedWorker from '../../server/sandbox/trusted/quality-runtime-v2.1.0/worker.js?raw';
import source from './workshop-v1.js?raw';

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Only this checked-in module and the archived worker enter the opaque frame.
 * There is intentionally no parameter for arbitrary code, URLs, or private art. */
export async function gemHuntFrame(): Promise<string> {
  const expected = '172ad1a651d14b4f7bde5c0e5ea5c33395980bd5cdb482209314eb0fe5d6293b';
  if (Array.from(await digest(archivedWorker), b => b.toString(16).padStart(2, '0')).join('') !== expected) {
    throw Error('The reviewed game runtime is unavailable.');
  }
  const code = source.replace('export function createGame()', 'function createGame()');
  const worker = '"use strict";(function(){' + archivedWorker + '\nreturn FactoryRuntime.run;})()(function(api){' +
    code + '\nreturn createGame(api);},["walker","prize"]);';
  // The relay accepts button input only from its parent. A worker frame is
  // projected into three integers here and independently checked by the host.
  const relay = `"use strict";
    const url = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {type:"text/javascript"}));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = event => {
      const result = event.data;
      if (!Array.isArray(result.commands)) { parent.postMessage("game-error","*"); return; }
      const walker = result.commands.find(c => c.key === "walker");
      const prize = result.commands.find(c => c.key === "prize");
      parent.postMessage([walker.x, prize ? prize.x : null, result.outcome.score], "*");
    };
    worker.onerror = () => parent.postMessage("game-error","*");
    addEventListener("message", event => {
      if (event.source !== parent) return;
      if (event.data === "restart") worker.postMessage({type:"start"});
      if (event.data === "left" || event.data === "right") worker.postMessage({type:"tick", steps:1, input:{pressed:[event.data], tap:null, pointer:{}}});
    });
    worker.postMessage({type:"start"});`;
  const hash = btoa(String.fromCharCode(...await digest(relay)));
  const policy = "default-src 'none'; script-src 'sha256-" + hash + "'; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script>' +
    relay + '</script>';
}
