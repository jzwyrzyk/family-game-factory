import type { BenchmarkJob } from './premium-quality-benchmark';
import { cases, rubricTable } from './premium-benchmark-cases';

const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Caller validates both jobs before any private bytes are placed in this sheet.
// Only fixed case text, validated PNG data, bounded trace fields and digests enter HTML.
export function blindSheet(first: BenchmarkJob, second: BenchmarkJob) {
  const item = cases.find(c => c.id === first.caseId)!;
  const ordered = [first, second].sort((a, b) => a.jobHash.localeCompare(b.jobHash));
  const columns = ordered.map((job, index) => {
    const packet = job.attempts.at(-1)!.packet;
    const heading = '<h2>Game ' + (index === 0 ? 'A' : 'B') + '</h2>';
    if (!packet) return '<section>' + heading + '<p>Final attempt has no captured play. Leave scores pending.</p></section>';
    return '<section>' + heading + '<p>Evidence <code>' + packet.review.evidenceHash + '</code></p>' +
      packet.evidence.sessions.map(s => '<h3>' + s.device + '</h3>' +
        packet.evidence.captures.filter(c => c.device === s.device).map(c =>
          '<figure><img alt="' + c.device + ' ' + c.phase + '" src="data:image/png;base64,' + c.data + '"><figcaption>' +
          escape(c.id) + ' · tick ' + c.tick + '</figcaption></figure>').join('') +
        '<table><tr><th>Input</th><th>Gesture</th><th>Ticks</th></tr>' + s.actionTrace.map(t =>
          '<tr><td>' + t.index + '</td><td><code>' + escape(JSON.stringify(t.action)) + '</code></td><td>' +
          t.startTick + '–' + t.endTick + '</td></tr>').join('') + '</table>').join('') + '</section>';
  });
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;">' +
    '<title>Paired game review</title><style>body{font:16px/1.45 Inter,system-ui,sans-serif;margin:2rem;color:#1e2630}main{display:grid;grid-template-columns:1fr 1fr;gap:2rem}section{min-width:0}img{max-width:100%;height:auto}figure{margin:.9rem 0}code{overflow-wrap:anywhere}th,td{text-align:left;border:1px solid #aaa;padding:.4rem}table{border-collapse:collapse} @media(max-width:720px){main{grid-template-columns:1fr}}</style>' +
    '<h1>Paired game review</h1><p>' + escape(item.request) + '</p><p>Record each observed, missing or unobserved check. Cite capture IDs and input indices. Score each game independently before comparing.</p><ul>' +
    Object.entries(item.checks).map(([id, text]) => '<li><b>' + escape(id) + '</b> ' + escape(text) + '</li>').join('') + '</ul>' +
    '<main>' + columns.join('') + '</main><h2>Human review rubric</h2><table><tr><th>Dimension</th>' + [1,2,3,4,5].map(n => '<th>' + n + '</th>').join('') +
    '</tr>' + rubricTable().map(r => '<tr><th>' + r.axis + '</th>' + r.anchors.map(v => '<td>' + escape(v) + '</td>').join('') + '</tr>').join('') +
    '</table><p>Fun potential is an adult reviewer judgment. Actual child enjoyment and learning require separate evidence.</p></html>';
}
