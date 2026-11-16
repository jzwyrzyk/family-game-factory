/** Trusted, local vector artwork. Physics uses simplified colliders, never image pixels.
 * Drawing importers can later map a part's spriteId/pivot to a private reviewed asset.
 */
export const ART_VERSION = 'toy-world-1';
export const palette = { ink: '#243c4c', cream: '#fff8e8', teal: '#258d82', orange: '#f28b49', gum: '#ed78a3', sky: '#d8efed', grass: '#6ca58b', sand: '#d9bd89' };
export interface PartPaint {
    selected?: boolean;
    preview?: 'valid' | 'invalid';
    time?: number;
    power?: number;
    damage?: number;
    tint?: string;
}
const line = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
const box = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = palette.ink) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
} };
const ellipse = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = '') => { c.beginPath(); c.ellipse(x, y, Math.max(.001, rx), Math.max(.001, ry), 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
} };
const poly = (c: CanvasRenderingContext2D, points: number[][], fill: string, stroke = palette.ink) => { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
} };
/** Paint a recognizable toy part centered at (0,0), in caller-defined units. */
export function drawPart(c: CanvasRenderingContext2D, id: string, w: number, h: number, o: PartPaint = {}) {
    c.save();
    c.lineWidth = Math.max(w, h) * .028;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = palette.ink;
    if (o.preview) {
        c.save();
        c.lineWidth = Math.max(2, Math.max(w, h) * .045);
        c.strokeStyle = o.preview === 'valid' ? '#238976' : '#c46b4a';
        c.setLineDash([5, 4]);
        c.beginPath();
        c.roundRect(-w * .61, -h * .61, w * 1.22, h * 1.22, Math.min(w, h) * .18);
        c.stroke();
        c.restore();
    }
    if (o.selected) {
        c.save();
        c.lineWidth = Math.max(w, h) * .055;
        c.strokeStyle = '#f8b94d';
        c.setLineDash([Math.max(w, h) * .07, Math.max(w, h) * .04]);
        c.beginPath();
        c.roundRect(-w * .58, -h * .58, w * 1.16, h * 1.16, Math.min(w, h) * .18);
        c.stroke();
        c.restore();
    }
    switch (id) {
        case 'bottle': {
            const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
            g.addColorStop(0, '#71b9ae');
            g.addColorStop(.45, '#b0e4c8');
            g.addColorStop(1, '#5b9f9b');
            c.beginPath();
            c.moveTo(-w * .22, -h * .44);
            c.lineTo(w * .22, -h * .44);
            c.lineTo(w * .22, -h * .31);
            c.bezierCurveTo(w * .22, -h * .23, w * .44, -h * .22, w * .44, -h * .08);
            c.lineTo(w * .44, h * .38);
            c.quadraticCurveTo(w * .44, h * .48, w * .3, h * .48);
            c.lineTo(-w * .3, h * .48);
            c.quadraticCurveTo(-w * .44, h * .48, -w * .44, h * .38);
            c.lineTo(-w * .44, -h * .08);
            c.bezierCurveTo(-w * .44, -h * .22, -w * .22, -h * .23, -w * .22, -h * .31);
            c.closePath();
            c.fillStyle = g;
            c.fill();
            c.stroke();
            box(c, -w * .27, -h * .5, w * .54, h * .1, w * .04, '#f5bd56');
            box(c, -w * .43, -h * .03, w * .86, h * .26, w * .04, '#fff6df');
            c.fillStyle = palette.teal;
            c.font = `bold ${h * .13}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('POP', 0, h * .105, w * .73);
            c.strokeStyle = '#e0f9e5';
            c.lineWidth = w * .06;
            line(c, -w * .26, -h * .13, -w * .26, -h * .03);
            line(c, -w * .26, h * .3, -w * .26, h * .36);
            break;
        }
        case 'carton':
        case 'box': {
            box(c, -w * .47, -h * .34, w * .94, h * .82, w * .05, o.tint || '#ebbc7d');
            poly(c, [[-w * .47, -h * .34], [-w * .24, -h * .49], [w * .23, -h * .49], [w * .47, -h * .34]], '#f6d7a1');
            poly(c, [[-w * .47, -h * .34], [-w * .16, -h * .22], [0, -h * .34], [-w * .24, -h * .49]], '#f8dfb8');
            poly(c, [[0, -h * .34], [w * .15, -h * .22], [w * .47, -h * .34], [w * .23, -h * .49]], '#e6ae68');
            box(c, -w * .085, -h * .34, w * .17, h * .82, 0, '#f8dea7', '');
            c.strokeStyle = '#bd8b53';
            c.lineWidth = w * .018;
            line(c, 0, -h * .28, 0, h * .43);
            c.strokeStyle = '#715c43';
            c.lineWidth = w * .03;
            line(c, -w * .32, h * .1, -w * .32, h * .26);
            line(c, -w * .39, h * .18, -w * .32, h * .1);
            line(c, -w * .25, h * .18, -w * .32, h * .1);
            line(c, w * .22, h * .32, w * .36, h * .32);
            break;
        }
        case 'can':
        case 'tin': {
            const g = c.createLinearGradient(-w * .45, 0, w * .45, 0);
            g.addColorStop(0, '#8cabb4');
            g.addColorStop(.4, '#e2edef');
            g.addColorStop(.65, '#b8d3d6');
            g.addColorStop(1, '#77939c');
            c.fillStyle = g;
            c.beginPath();
            c.roundRect(-w * .46, -h * .4, w * .92, h * .8, w * .05);
            c.fill();
            c.stroke();
            for (let i = 0; i < 4; i++) {
                c.strokeStyle = '#8babb1';
                c.lineWidth = w * .025;
                line(c, -w * .38, -h * .18 + i * h * .13, w * .38, -h * .18 + i * h * .13);
            }
            ellipse(c, 0, -h * .4, w * .46, h * .09, '#c9dce0', palette.ink);
            ellipse(c, 0, h * .4, w * .46, h * .08, '#a9c4c9', palette.ink);
            ellipse(c, 0, -h * .4, w * .29, h * .045, '#a9c4c9');
            line(c, -w * .1, -h * .4, w * .1, -h * .4);
            break;
        }
        case 'spoon':
        case 'paddle': {
            const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
            g.addColorStop(0, '#f6dfae');
            g.addColorStop(1, '#c68b4b');
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(-w * .42, -h * .1);
            c.quadraticCurveTo(-w * .49, -h * .1, -w * .49, 0);
            c.quadraticCurveTo(-w * .49, h * .1, -w * .42, h * .1);
            c.lineTo(w * .12, h * .075);
            c.bezierCurveTo(w * .15, h * .49, w * .5, h * .57, w * .5, 0);
            c.bezierCurveTo(w * .5, -h * .57, w * .15, -h * .49, w * .12, -h * .075);
            c.closePath();
            c.fill();
            c.stroke();
            ellipse(c, w * .31, 0, w * .11, h * .29, '#ba864b');
            ellipse(c, w * .315, -h * .04, w * .085, h * .22, '#dfb477');
            c.strokeStyle = '#9d6d3f';
            c.lineWidth = h * .055;
            line(c, -w * .35, 0, w * .05, 0);
            break;
        }
        case 'plank':
        case 'board': {
            box(c, -w * .5, -h * .45, w, h * .9, h * .13, '#e1ae70');
            c.strokeStyle = '#bd814c';
            c.lineWidth = h * .06;
            line(c, -w * .43, -h * .18, w * .38, -h * .18);
            line(c, -w * .41, h * .16, w * .44, h * .16);
            ellipse(c, w * .18, -h * .03, w * .035, h * .12, '#c88d53');
            c.strokeStyle = '#8e6d4a';
            c.lineWidth = h * .04;
            line(c, -w * .44, -h * .25, -w * .44, h * .27);
            line(c, w * .44, -h * .25, w * .44, h * .27);
            break;
        }
        case 'wheel':
        case 'lid': {
            const r = Math.min(w, h) * .49;
            ellipse(c, 0, 0, r, r, '#304653', palette.ink);
            c.save();
            c.rotate((o.time || 0) * 0);
            c.strokeStyle = '#627986';
            c.lineWidth = r * .12;
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                line(c, Math.cos(a) * r * .84, Math.sin(a) * r * .84, Math.cos(a + .1) * r * .95, Math.sin(a + .1) * r * .95);
            }
            c.restore();
            ellipse(c, 0, 0, r * .63, r * .63, id === 'lid' ? '#d1e0d9' : '#f7bc59', palette.ink);
            ellipse(c, 0, 0, r * .2, r * .2, '#f6ead0', palette.ink);
            c.strokeStyle = '#7c674b';
            c.lineWidth = r * .05;
            for (let i = 0; i < 5; i++) {
                const a = i * Math.PI * 2 / 5;
                line(c, Math.cos(a) * r * .27, Math.sin(a) * r * .27, Math.cos(a) * r * .5, Math.sin(a) * r * .5);
            }
            break;
        }
        case 'fan':
        case 'engine': {
            const r = Math.min(w, h) * .43;
            box(c, -w * .24, h * .19, w * .48, h * .28, w * .06, '#f5b45d');
            ellipse(c, 0, -h * .04, r, r, '#e7f1e8', palette.ink);
            c.save();
            c.translate(0, -h * .04);
            c.rotate((o.time || 0) * (2 + Math.max(0, Math.min(1, o.power || 0)) * 22));
            for (let i = 0; i < 3; i++) {
                c.rotate(Math.PI * 2 / 3);
                c.beginPath();
                c.moveTo(0, 0);
                c.bezierCurveTo(-r * .5, -r * .15, -r * .15, -r * .9, r * .45, -r * .65);
                c.bezierCurveTo(r * .7, -r * .45, r * .37, -r * .1, 0, 0);
                c.fillStyle = '#74b9af';
                c.fill();
                c.stroke();
            }
            c.restore();
            ellipse(c, 0, -h * .04, r * .15, r * .15, '#f5b45d', palette.ink);
            c.strokeStyle = '#547b81';
            c.lineWidth = r * .035;
            ellipse(c, 0, -h * .04, r * .82, r * .82, '#ffffff00', '#547b81');
            line(c, -r, -h * .04, r, -h * .04);
            line(c, 0, -h * .04 - r, 0, -h * .04 + r);
            break;
        }
        case 'balloon': {
            const g = c.createRadialGradient(-w * .12, -h * .21, w * .02, 0, -h * .08, w * .6);
            g.addColorStop(0, o.tint || '#ffc89d');
            g.addColorStop(.65, '#f28b63');
            g.addColorStop(1, '#ce6551');
            c.beginPath();
            c.ellipse(0, -h * .08, w * .46, h * .4, 0, 0, Math.PI * 2);
            c.fillStyle = g;
            c.fill();
            c.stroke();
            poly(c, [[0, h * .29], [-w * .08, h * .39], [w * .08, h * .39]], '#de7660');
            c.strokeStyle = palette.ink;
            c.lineWidth = w * .02;
            c.beginPath();
            c.moveTo(0, h * .4);
            c.quadraticCurveTo(w * .06, h * .44, 0, h * .5);
            c.stroke();
            ellipse(c, -w * .17, -h * .23, w * .08, h * .12, '#ffe8d0');
            break;
        }
        case 'capsule':
        case 'passenger': {
            box(c, -w * .45, -h * .41, w * .9, h * .87, w * .21, o.tint || '#eea947');
            box(c, -w * .34, -h * .34, w * .68, h * .5, w * .2, '#cde8df');
            ellipse(c, 0, -h * .1, w * .22, h * .2, '#f7df9b', palette.ink);
            ellipse(c, -w * .13, -h * .23, w * .08, h * .08, '#f7df9b', palette.ink);
            ellipse(c, w * .13, -h * .23, w * .08, h * .08, '#f7df9b', palette.ink);
            ellipse(c, -w * .075, -h * .12, w * .024, h * .025, palette.ink);
            ellipse(c, w * .075, -h * .12, w * .024, h * .025, palette.ink);
            ellipse(c, 0, -h * .06, w * .025, h * .023, '#895644');
            c.strokeStyle = '#8a6f46';
            c.lineWidth = w * .018;
            c.beginPath();
            c.arc(0, -h * .02, w * .055, 0, Math.PI);
            c.stroke();
            box(c, -w * .26, h * .23, w * .52, h * .1, w * .04, '#d98a36', '');
            break;
        }
        case 'thruster':
        case 'rocket': {
            poly(c, [[-w * .4, h * .1], [-w * .48, h * .4], [-w * .2, h * .29]], '#da7d50');
            poly(c, [[w * .4, h * .1], [w * .48, h * .4], [w * .2, h * .29]], '#da7d50');
            box(c, -w * .32, -h * .34, w * .64, h * .66, w * .13, '#a4c9bf');
            poly(c, [[-w * .32, -h * .25], [0, -h * .5], [w * .32, -h * .25]], '#ee9565');
            box(c, -w * .25, h * .28, w * .5, h * .12, w * .02, '#455c66');
            ellipse(c, 0, -h * .07, w * .15, h * .13, '#e8f6e6', palette.ink);
            if (o.power) {
                c.save();
                const flicker = 1 + Math.sin((o.time || 0) * 43) * .12;
                poly(c, [[-w * .2, h * .4], [0, h * (.65 + .15 * flicker)], [w * .2, h * .4]], '#f5bd51', '');
                poly(c, [[-w * .1, h * .4], [0, h * .65], [w * .1, h * .4]], '#fff1b9', '');
                c.restore();
            }
            break;
        }
        case 'chassis':
        case 'car': {
            poly(c, [[-w * .48, -h * .05], [-w * .28, -h * .18], [-w * .1, -h * .48], [w * .2, -h * .48], [w * .36, -h * .14], [w * .48, -h * .05], [w * .48, h * .31], [-w * .48, h * .31]], o.tint || '#e99b55');
            poly(c, [[-w * .14, -h * .18], [-w * .04, -h * .39], [w * .15, -h * .39], [w * .25, -h * .18]], '#cfeae4');
            c.strokeStyle = '#b86836';
            c.lineWidth = h * .04;
            line(c, -w * .4, h * .15, w * .43, h * .15);
            ellipse(c, w * .39, -h * .02, w * .04, h * .07, '#fff0b6');
            box(c, -w * .5, h * .22, w * .12, h * .12, h * .03, '#688991');
            box(c, w * .4, h * .22, w * .12, h * .12, h * .03, '#688991');
            box(c, -w * .19, -h * .11, w * .04, h * .05, 0, '#7c573d', '');
            break;
        }
        case 'cone': {
            poly(c, [[-w * .48, h * .42], [0, -h * .48], [w * .48, h * .42]], '#efa36c');
            poly(c, [[-w * .25, h * .02], [w * .25, h * .02], [w * .35, h * .2], [-w * .35, h * .2]], '#fff0cf', '');
            box(c, -w * .5, h * .37, w, h * .12, h * .03, '#cf7d51');
            break;
        }
        default:
            box(c, -w * .45, -h * .45, w * .9, h * .9, Math.min(w, h) * .15, o.tint || '#a9c8bc');
            ellipse(c, 0, 0, w * .12, h * .12, '#fff4d3');
    }
    c.restore();
}
export function drawGum(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, stress = 0, selected = false) {
    c.save();
    const len = Math.hypot(bx - ax, by - ay), s = Math.max(0, Math.min(1, stress));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = selected ? '#f3bd56' : s > .7 ? '#e98955' : '#c64e85';
    c.lineWidth = Math.max(4, 9 - s * 4);
    c.beginPath();
    c.moveTo(ax, ay);
    c.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + Math.min(10, len * .08) * (1 - s), bx, by);
    c.stroke();
    c.strokeStyle = s > .7 ? '#ffc87f' : '#f7a0c1';
    c.lineWidth = Math.max(2, 5 - s * 3);
    c.stroke();
    ellipse(c, ax, ay, 5, 4, '#ef86af');
    ellipse(c, bx, by, 5, 4, '#ef86af');
    c.restore();
}
export function drawWorkshopBackground(c: CanvasRenderingContext2D, w: number, h: number, time = 0) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e8f3ec');
    g.addColorStop(1, '#f9f3dd');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    c.strokeStyle = '#adc6b92b';
    c.lineWidth = 1;
    for (let x = 16; x < w; x += 34)
        for (let y = 16; y < h; y += 34) {
            c.beginPath();
            c.arc(x, y, 1, 0, Math.PI * 2);
            c.stroke();
        }
    c.strokeStyle = '#cae0d0';
    c.lineWidth = 2;
    const y = h * .84;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
    c.fillStyle = '#c59b6b';
    c.fillRect(0, h * .9, w, h * .1);
    c.fillStyle = '#e5c793';
    c.fillRect(0, h * .89, w, h * .024);
    c.strokeStyle = '#a7805533';
    for (let x = 0; x < w; x += 110)
        line(c, x, h * .915, x + 55, h * .94);
    c.restore();
}
export function drawLandscape(c: CanvasRenderingContext2D, w: number, h: number, cameraX = 0, time = 0) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c9e9e4');
    g.addColorStop(1, '#f7efd8');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    ellipse(c, w * .79, h * .19, h * .095, h * .095, '#f9e7ab');
    for (let k = 0; k < 5; k++) {
        const px = ((k * 227 - cameraX * .12) % (w + 240) + w + 240) % (w + 240) - 120;
        const py = h * (.17 + (k % 3) * .08);
        ellipse(c, px, py, 45, 12, '#ffffff92');
        ellipse(c, px + 25, py - 6, 34, 18, '#ffffff92');
    }
    for (let layer = 0; layer < 2; layer++) {
        c.fillStyle = layer ? '#95b7a9' : '#b3cbb7';
        c.beginPath();
        c.moveTo(0, h);
        for (let x = -30; x <= w + 30; x += 15) {
            const wx = x + cameraX * (layer ? .25 : .12);
            const yy = h * (layer ? .63 : .54) + Math.sin(wx / 170) * h * .08 + Math.sin(wx / 63) * h * .025;
            c.lineTo(x, yy);
        }
        c.lineTo(w, h);
        c.closePath();
        c.fill();
    }
    c.restore();
}
export function drawFlag(c: CanvasRenderingContext2D, x: number, y: number, size = 44, label = 'GOAL') { c.save(); c.lineWidth = 3; c.strokeStyle = palette.ink; line(c, x, y, x, y - size); poly(c, [[x, y - size], [x + size * .9, y - size + 4], [x + size * .76, y - size * .63], [x, y - size * .6]], '#e9955f'); c.fillStyle = palette.ink; c.font = `bold ${size * .18}px sans-serif`; c.textAlign = 'left'; c.fillText(label, x + size * .1, y - size * .76); ellipse(c, x, y + 2, size * .17, 3, '#30465325'); c.restore(); }
