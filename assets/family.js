/* ══════════════════════════════════════════════════════════════
   DOTS FOR LOVE – Familien-Poster-Generator
   ══════════════════════════════════════════════════════════════
   Fünf freigegebene Designs:
     smiley          – Ein Gesicht pro Mitglied, Familienname oben,
                       „family" unten rechts
     jahre           – Geburtsjahre in Serifenziffern, letzte zwei
                       Ziffern hochgestellt, Name bündig darunter
     raetsel-modern  – Wortsuche, Namen durch dunkle Schrift abgesetzt
     raetsel-pinsel  – Wortsuche in Schreibschrift, Namen in Wunsch-
                       farbe handgemalt eingekreist
     figuren         – Pinselfiguren, Größe nach Alter, Name hand-
                       schriftlich in der Figur

   Rendert identische Kompositionen auf zwei Oberflächen:
     CanvasSurface → Vorschau (mit Wasserzeichen, kopiergeschützt)
     SvgSurface    → druckfertiges SVG in mm (für Hub/Gelato/Heimdruck)
   Das Layout rechnet in mm; Schriftmessung läuft über ein unsicht-
   bares Canvas, damit beide Oberflächen dieselben Werte bekommen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SIZES = {
    'A4':     { w: 210, h: 297, label: 'DIN A4' },
    'A3':     { w: 297, h: 420, label: 'DIN A3' },
    '50x70':  { w: 500, h: 700, label: '50 × 70 cm' },
    '70x100': { w: 700, h: 1000, label: '70 × 100 cm' },
  };
  const FALLBACK_PRICES = { 'A4': 34.00, 'A3': 49.00, '50x70': 64.00, '70x100': 84.00 };
  const FALLBACK_VARIANT_IDS = {
    'A4': '62388082377034', 'A3': '62388082409802',
    '50x70': '62388082442570', '70x100': '62388082475338',
  };

  const FONTS = {
    display: 'Georgia, "Times New Roman", serif',
    didot:   '"Didot", Georgia, "Times New Roman", serif',
    sans:    '"Helvetica Neue", Helvetica, Arial, sans-serif',
    hand:    '"Caveat", "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive',
  };

  const NAME_PALETTE = ['#E8495A', '#845EC2', '#00C9A7', '#F9B233', '#4D9DE0', '#F28C50', '#9BC53D', '#C86FC9'];

  const VARIANTS = {
    'smiley':         { label: 'Smiley-Grid' },
    'jahre':          { label: 'Jahreszahlen' },
    'raetsel-modern': { label: 'Namensrätsel · Modern' },
    'raetsel-pinsel': { label: 'Namensrätsel · Pinsel' },
    'figuren':        { label: 'Figuren nach Alter' },
  };

  /* ── deterministischer Zufall: gleiche Familie → gleiches Poster ── */
  function rng(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Schriftmessung (mm) über verstecktes Canvas ── */
  const _mctx = document.createElement('canvas').getContext('2d');
  function measure(text, size, family, weight, style) {
    _mctx.font = (style || 'normal') + ' ' + (weight || 400) + ' ' + (size * 10) + 'px ' + family;
    return _mctx.measureText(text).width / 10;
  }
  function fitSize(text, maxSize, family, weight, style, maxWidth) {
    let size = maxSize;
    while (size > 3 && measure(text, size, family, weight, style) > maxWidth) size -= 0.5;
    return size;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ══ Zeichenoberflächen ══ */

  class CanvasSurface {
    constructor(canvas, W, H, pxPerMm) {
      const k = pxPerMm || Math.min(4, 1100 / W);
      canvas.width = Math.round(W * k);
      canvas.height = Math.round(H * k);
      this.ctx = canvas.getContext('2d');
      this.ctx.setTransform(k, 0, 0, k, 0, 0);
      this.W = W; this.H = H;
    }
    rect(x, y, w, h, fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(x, y, w, h);
    }
    ellipse(cx, cy, rx, ry, rot, o) {
      const c = this.ctx;
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw || 1; c.stroke(); }
    }
    polyline(pts, o) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      if (o.close) c.closePath();
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) {
        c.strokeStyle = o.stroke; c.lineWidth = o.lw || 1;
        c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
      }
    }
    path(cmds, o) {
      const c = this.ctx;
      c.beginPath();
      for (const k of cmds) {
        if (k[0] === 'M') c.moveTo(k[1], k[2]);
        else if (k[0] === 'L') c.lineTo(k[1], k[2]);
        else if (k[0] === 'Q') c.quadraticCurveTo(k[1], k[2], k[3], k[4]);
        else if (k[0] === 'Z') c.closePath();
      }
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw || 1; c.stroke(); }
    }
    text(str, x, y, o) {
      const c = this.ctx;
      c.save();
      if (o.rotate) { c.translate(x, y); c.rotate(o.rotate); x = 0; y = 0; }
      c.font = (o.style || 'normal') + ' ' + (o.weight || 400) + ' ' + o.size + 'px ' + o.family;
      c.fillStyle = o.fill;
      c.textAlign = o.align || 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(str, x, y);
      c.restore();
    }
    watermark() {
      const c = this.ctx, W = this.W, H = this.H;
      c.save();
      c.globalAlpha = 0.14;
      c.fillStyle = '#1A1A2E';
      c.font = '700 ' + W * 0.045 + 'px ' + FONTS.sans;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.translate(W / 2, H / 2);
      c.rotate(-Math.PI / 6);
      const step = W * 0.32;
      for (let yy = -H; yy < H; yy += step * 0.6) {
        for (let xx = -W; xx < W; xx += step * 1.6) {
          c.fillText('© DOTS FOR LOVE', xx, yy);
        }
      }
      c.restore();
    }
  }

  class SvgSurface {
    constructor(W, H) {
      this.W = W; this.H = H;
      this.parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + ' ' + H + '">',
      ];
    }
    rect(x, y, w, h, fill) {
      this.parts.push('<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" fill="' + fill + '"/>');
    }
    ellipse(cx, cy, rx, ry, rot, o) {
      const tf = rot ? ' transform="rotate(' + (rot * 180 / Math.PI).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')"' : '';
      this.parts.push('<ellipse cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" rx="' + rx.toFixed(2) + '" ry="' + ry.toFixed(2) + '"' + tf +
        ' fill="' + (o.fill || 'none') + '"' +
        (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1).toFixed(2) + '"' : '') + '/>');
    }
    polyline(pts, o) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ') + (o.close ? ' Z' : '');
      this.parts.push('<path d="' + d + '" fill="' + (o.fill || 'none') + '"' +
        (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"' : '') + '/>');
    }
    path(cmds, o) {
      let d = '';
      for (const k of cmds) {
        if (k[0] === 'M') d += 'M' + k[1].toFixed(2) + ',' + k[2].toFixed(2) + ' ';
        else if (k[0] === 'L') d += 'L' + k[1].toFixed(2) + ',' + k[2].toFixed(2) + ' ';
        else if (k[0] === 'Q') d += 'Q' + k[1].toFixed(2) + ',' + k[2].toFixed(2) + ' ' + k[3].toFixed(2) + ',' + k[4].toFixed(2) + ' ';
        else if (k[0] === 'Z') d += 'Z ';
      }
      this.parts.push('<path d="' + d.trim() + '" fill="' + (o.fill || 'none') + '"' +
        (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1).toFixed(2) + '"' : '') + '/>');
    }
    text(str, x, y, o) {
      const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
      const tf = o.rotate ? ' transform="rotate(' + (o.rotate * 180 / Math.PI).toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')"' : '';
      this.parts.push('<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '"' + tf +
        ' font-family=\'' + o.family + '\' font-size="' + o.size.toFixed(2) + '"' +
        (o.weight ? ' font-weight="' + o.weight + '"' : '') +
        (o.style === 'italic' ? ' font-style="italic"' : '') +
        ' fill="' + o.fill + '" text-anchor="' + anchor + '">' + esc(str) + '</text>');
    }
    watermark() { /* Druckdatei bleibt sauber */ }
    toString() { return this.parts.concat('</svg>').join('\n'); }
  }

  /* ══ Painter · smiley ══ */
  function paintSmiley(s, fam, opts) {
    const W = s.W, H = s.H, M = W * 0.084;
    const BLUE = opts.accent || '#2B3FCB', CREAM = '#F6F1E7';
    s.rect(0, 0, W, H, CREAM);
    const rnd = rng('smiley:' + fam.name + fam.members.map((m) => m.name).join());

    const title = fam.name.toLowerCase();
    const tSize = fitSize(title, W * 0.14, FONTS.display, 900, 'normal', W - 2 * M - W * 0.17);
    s.text(title, M, M + tSize * 0.82, { size: tSize, family: FONTS.display, weight: 900, fill: BLUE });
    s.text('the', W - M, M + W * 0.04, { size: W * 0.034, family: FONTS.display, weight: 700, fill: BLUE, align: 'right' });
    s.text('family', W - M, H - M + W * 0.008, { size: W * 0.084, family: FONTS.display, weight: 900, fill: BLUE, align: 'right' });
    s.text('*', M, H - M, { size: W * 0.032, family: FONTS.display, weight: 700, fill: BLUE });

    const n = fam.members.length;
    const cols = n <= 2 ? n : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const areaTop = M + tSize + W * 0.034, areaBot = H - M - W * 0.1;
    const cell = Math.min((W - 2 * M) / cols, (areaBot - areaTop) / rows);
    const gx = (W - cell * cols) / 2;
    const gy = areaTop + ((areaBot - areaTop) - cell * rows) / 2;
    const lw = Math.max(1.6, cell * 0.05);

    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const lastCount = n - (rows - 1) * cols;
      const offX = row === rows - 1 ? (cols - lastCount) * cell / 2 : 0;
      const cx = gx + offX + (col + 0.5) * cell;
      const cy = gy + (row + 0.5) * cell;
      const r = cell * 0.42;
      const tilt = (rnd() - 0.5) * 0.3, squish = 0.92 + rnd() * 0.12;
      s.ellipse(cx, cy, r, r * squish, tilt, { stroke: BLUE, lw });
      const er = r * 0.13;
      const eye = (dx) => {
        const ex = cx + Math.cos(tilt) * dx - Math.sin(tilt) * (-r * 0.18);
        const ey = cy + Math.sin(tilt) * dx + Math.cos(tilt) * (-r * 0.18);
        s.ellipse(ex, ey, er, er * 1.9, tilt, { fill: BLUE });
      };
      eye(-r * 0.34); eye(r * 0.34);
      // Lächeln als Polylinie (Bogen)
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const a = 0.25 * Math.PI + (k / 14) * 0.5 * Math.PI;
        const px0 = Math.cos(a) * r * 0.55, py0 = r * 0.08 + Math.sin(a) * r * 0.55;
        pts.push([cx + Math.cos(tilt) * px0 - Math.sin(tilt) * py0, cy + Math.sin(tilt) * px0 + Math.cos(tilt) * py0]);
      }
      s.polyline(pts, { stroke: BLUE, lw });
    }
  }

  /* ══ Painter · jahre ══ */
  function paintJahre(s, fam) {
    const W = s.W, H = s.H, M = H * 0.066;
    s.rect(0, 0, W, H, '#FFFFFF');
    const mem = fam.members.slice().sort((a, b) => a.born - b.born);
    const n = mem.length;
    const rowH = Math.min(H * 0.18, (H - 2 * M) / n);
    const big = rowH * 0.62, small = big * 0.58;
    let y = (H - rowH * n) / 2 + rowH * 0.58;

    for (const m of mem) {
      const yr = String(m.born.getFullYear());
      const head = yr.slice(0, 2), tail = yr.slice(2);
      const headW = measure(head, big, FONTS.didot, 400);
      const tailW = measure(tail, small, FONTS.didot, 400);
      const nm = m.name.toUpperCase();
      const nmSize = fitSize(nm, big * 0.17, FONTS.sans, 600, 'normal', Math.max(tailW, W * 0.1));
      const nmW = measure(nm, nmSize, FONTS.sans, 600);
      const blockW = headW + big * 0.07 + Math.max(tailW, nmW);
      const x = (W - blockW) / 2;

      s.text(head, x, y, { size: big, family: FONTS.didot, fill: '#141414' });
      s.text(tail, x + headW + big * 0.07, y - (big - small), { size: small, family: FONTS.didot, fill: '#141414' });
      s.text(nm, x + headW + big * 0.07, y - (big - small) + small * 0.32 + nmSize,
        { size: nmSize, family: FONTS.sans, weight: 600, fill: '#8A8A8A' });
      y += rowH;
    }
  }

  /* ══ Rätsel-Generator ══ */
  function buildPuzzle(names, seed) {
    const rnd = rng('puzzle:' + seed + names.join());
    const clean = names.map((s2) => s2.toUpperCase().replace(/[^A-ZÄÖÜ]/g, '')).filter(Boolean);
    const longest = Math.max(...clean.map((s2) => s2.length), 4);
    const cols = Math.max(11, longest + 2);
    const rows = Math.max(13, clean.length * 3 + 3);
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const placements = [];
    for (const word of clean) {
      for (let tries = 0; tries < 500; tries++) {
        const horiz = rnd() < 0.5;
        const maxR = horiz ? rows : rows - word.length;
        const maxC = horiz ? cols - word.length : cols;
        if (maxR <= 0 || maxC <= 0) continue;
        const r0 = Math.floor(rnd() * maxR), c0 = Math.floor(rnd() * maxC);
        let ok = true;
        for (let k = 0; k < word.length; k++) {
          const r = horiz ? r0 : r0 + k, c = horiz ? c0 + k : c0;
          if (grid[r][c] !== null && grid[r][c] !== word[k]) { ok = false; break; }
        }
        if (!ok) continue;
        const cells = [];
        for (let k = 0; k < word.length; k++) {
          const r = horiz ? r0 : r0 + k, c = horiz ? c0 + k : c0;
          grid[r][c] = word[k]; cells.push([r, c]);
        }
        placements.push({ word, cells });
        break;
      }
    }
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c] === null) grid[r][c] = ABC[Math.floor(rnd() * 26)];
    return { grid, placements, rows, cols };
  }

  /* ══ Painter · raetsel (modern | pinsel) ══ */
  function paintRaetsel(s, fam, style) {
    const W = s.W, H = s.H, M = W * 0.097;
    s.rect(0, 0, W, H, '#FFFFFF');
    const { grid, placements, rows, cols } = buildPuzzle(fam.members.map((m) => m.name), fam.name);

    const areaH = H - 2 * M - H * 0.12;
    const cell = Math.min((W - 2 * M) / cols, areaH / rows);
    const gx = (W - cell * cols) / 2, gy = M + (areaH - cell * rows) / 2;
    const inWord = new Set();
    placements.forEach((p) => p.cells.forEach(([r, c]) => inWord.add(r + ':' + c)));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hit = inWord.has(r + ':' + c);
        const o = style === 'pinsel'
          ? { size: cell * 0.52, family: FONTS.hand, style: 'italic', fill: '#2A2A2A' }
          : { size: cell * 0.5, family: FONTS.sans, weight: hit ? 800 : 400, fill: hit ? '#1A1A1A' : '#C8C8C8' };
        s.text(grid[r][c], gx + (c + 0.5) * cell, gy + (r + 0.5) * cell + o.size * 0.35,
          { ...o, align: 'center' });
      }
    }

    if (style === 'pinsel') {
      placements.forEach((p, pi) => {
        const first = p.cells[0], last = p.cells[p.cells.length - 1];
        const x1 = gx + (first[1] + 0.5) * cell, y1 = gy + (first[0] + 0.5) * cell;
        const x2 = gx + (last[1] + 0.5) * cell, y2 = gy + (last[0] + 0.5) * cell;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const len = Math.hypot(x2 - x1, y2 - y1) / 2 + cell * 0.62;
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const rr = rng('circle' + pi + p.word);
        for (let pass = 0; pass < 2; pass++) {
          const pts = [];
          const steps = 36;
          for (let k = 0; k <= steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            const wob = 1 + (rr() - 0.5) * 0.09;
            const px0 = Math.cos(a) * len * wob, py0 = Math.sin(a) * cell * 0.62 * wob;
            pts.push([mx + Math.cos(ang) * px0 - Math.sin(ang) * py0,
                      my + Math.sin(ang) * px0 + Math.cos(ang) * py0]);
          }
          s.polyline(pts, { stroke: NAME_PALETTE[pi % NAME_PALETTE.length], lw: (3.4 - pass) * cell / 16, close: true });
        }
      });
    }

    const fy = H - M - H * 0.055;
    s.polyline([[W / 2 - W * 0.118, fy], [W / 2 + W * 0.118, fy]], { stroke: '#1A1A1A', lw: cell / 12 });
    const fn = ('Familie ' + fam.name).toUpperCase();
    const fs = fitSize(fn, W * 0.034, FONTS.sans, 700, 'normal', W - 2 * M);
    s.text(fn, W / 2, fy + W * 0.047, { size: fs, family: FONTS.sans, weight: 700, fill: '#1A1A1A', align: 'center' });
    if (fam.city) {
      s.text(fam.city.toUpperCase(), W / 2, fy + W * 0.076,
        { size: W * 0.017, family: FONTS.sans, weight: 500, fill: '#9A9A9A', align: 'center' });
    }
  }

  /* ══ Painter · figuren ══ */
  function paintFiguren(s, fam, opts) {
    const W = s.W, H = s.H, M = W * 0.1;
    const FIG = opts.accent2 || '#141414', BG = '#F2EBDD';
    s.rect(0, 0, W, H, BG);

    const now = new Date();
    const mem = fam.members
      .map((m) => ({ ...m, age: Math.max(0.5, (now - m.born) / 3.15576e10) }))
      .sort((a, b) => b.age - a.age);
    const maxAge = mem[0].age;
    const baseY = H - M - H * 0.024;
    const maxFigH = H - 2 * M - H * 0.056;
    const n = mem.length;
    const slot = (W - 2 * M) / n;
    const rnd = rng('fig:' + fam.name + n);

    mem.forEach((m, i) => {
      const hFrac = 0.34 + 0.66 * Math.min(1, m.age / maxAge);
      const figH = maxFigH * hFrac;
      const figW = Math.min(slot * 0.62, figH * 0.24 + W * 0.034);
      const cx = M + slot * (i + 0.5) + (rnd() - 0.5) * slot * 0.1;
      const headR = figW * 0.42;
      const topY = baseY - figH;

      s.ellipse(cx, topY + headR, headR, headR * 1.15, (rnd() - 0.5) * 0.2, { fill: FIG });
      const bodyTop = topY + headR * 2.05;
      for (let st = 0; st < 3; st++) {
        const off = (st - 1) * figW * 0.34;
        const wTop = figW * 0.30, wBot = figW * (0.16 + rnd() * 0.06);
        const bend = (rnd() - 0.5) * figW * 0.35;
        const midY = (bodyTop + baseY) / 2;
        s.path([
          ['M', cx + off - wTop / 2, bodyTop],
          ['Q', cx + off + bend - wTop / 2, midY, cx + off - wBot / 2, baseY],
          ['L', cx + off + wBot / 2, baseY],
          ['Q', cx + off + bend + wTop / 2, midY, cx + off + wTop / 2, bodyTop],
          ['Z'],
        ], { fill: FIG });
      }
      const nmSize = fitSize(m.name, Math.min(W * 0.04, figW * 0.42), FONTS.hand, 400, 'italic', (baseY - bodyTop) * 0.86);
      s.text(m.name, cx + nmSize * 0.32, bodyTop + (baseY - bodyTop) * 0.52,
        { size: nmSize, family: FONTS.hand, style: 'italic', fill: BG, align: 'center', rotate: -Math.PI / 2 });
    });

    s.text('Familie ' + fam.name, W / 2, H - H * 0.032,
      { size: W * 0.032, family: FONTS.hand, style: 'italic', fill: 'rgba(20,20,20,.55)', align: 'center' });
  }

  const PAINTERS = {
    'smiley':         (s, fam, o) => paintSmiley(s, fam, o),
    'jahre':          (s, fam) => paintJahre(s, fam),
    'raetsel-modern': (s, fam) => paintRaetsel(s, fam, 'modern'),
    'raetsel-pinsel': (s, fam) => paintRaetsel(s, fam, 'pinsel'),
    'figuren':        (s, fam, o) => paintFiguren(s, fam, o),
  };

  /* ══ Generator-Klasse ══ */
  class FamilyPosterGenerator {
    constructor() {
      this.variant = 'smiley';
      this.size = 'A3';
      this.accent = '#2B3FCB';   // Smiley-Farbe
      this.accent2 = '#141414';  // Figuren-Farbe
      this.family = {
        name: 'Weber',
        city: '',
        members: [
          { name: 'Michael', born: new Date('1985-04-12') },
          { name: 'Anna', born: new Date('1987-09-03') },
          { name: 'Emma', born: new Date('2015-03-02') },
          { name: 'Luis', born: new Date('2019-11-20') },
        ],
      };
    }
    dims() { return SIZES[this.size] || SIZES.A3; }
    price() {
      const injected = window.DotsForLovePrices || {};
      return parseFloat(injected[this.size]) || FALLBACK_PRICES[this.size] || 0;
    }
    valid() {
      return this.family.name.trim() &&
        this.family.members.filter((m) => m.name.trim() && !isNaN(m.born)).length >= 2;
    }
    _cleanFamily() {
      return {
        name: this.family.name.trim() || 'Familie',
        city: (this.family.city || '').trim(),
        members: this.family.members
          .filter((m) => m.name.trim() && !isNaN(m.born))
          .slice(0, 8),
      };
    }
    renderPreview(canvas) {
      const { w, h } = this.dims();
      const surface = new CanvasSurface(canvas, w, h);
      PAINTERS[this.variant](surface, this._cleanFamily(), { accent: this.accent, accent2: this.accent2 });
      surface.watermark();
    }
    generateSVG() {
      const { w, h } = this.dims();
      const surface = new SvgSurface(w, h);
      PAINTERS[this.variant](surface, this._cleanFamily(), { accent: this.accent, accent2: this.accent2 });
      return surface.toString();
    }
    lineItemProperties() {
      const fam = this._cleanFamily();
      return {
        'Motiv': 'Familie · ' + (VARIANTS[this.variant]?.label || this.variant),
        'Familienname': fam.name,
        'Ort': fam.city,
        'Mitglieder': fam.members.map((m) => m.name + ' (' + m.born.getFullYear() + ')').join(', '),
        'Format': SIZES[this.size].label,
        'Akzentfarbe': this.variant === 'smiley' ? this.accent : this.variant === 'figuren' ? this.accent2 : '—',
      };
    }
  }

  window.FamilyPosterGenerator = FamilyPosterGenerator;
  window.FamilyPosterVariants = VARIANTS;

  /* ══ Seiten-UI ══ */
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('familyCanvas')) return;
    const gen = new FamilyPosterGenerator();
    const $ = (id) => document.getElementById(id);
    const canvas = $('familyCanvas');
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    let renderQueued = false;
    function rerender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        if (gen.valid()) gen.renderPreview(canvas);
        updatePrice();
        updateAccentVisibility();
      });
    }
    function updatePrice() {
      const el = $('familyPrice');
      if (el) el.textContent = gen.price().toFixed(2).replace('.', ',') + ' €';
    }
    function updateAccentVisibility() {
      const smiley = $('accentRowSmiley'), fig = $('accentRowFiguren');
      if (smiley) smiley.hidden = gen.variant !== 'smiley';
      if (fig) fig.hidden = gen.variant !== 'figuren';
    }

    /* Familie */
    $('famName')?.addEventListener('input', (e) => { gen.family.name = e.target.value; rerender(); });
    $('famCity')?.addEventListener('input', (e) => { gen.family.city = e.target.value; rerender(); });

    function renderMembers() {
      const box = $('famMembers');
      box.innerHTML = '';
      gen.family.members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'fam-member';
        const iso = isNaN(m.born) ? '' : m.born.toISOString().slice(0, 10);
        row.innerHTML =
          '<input type="text" value="' + m.name.replace(/"/g, '&quot;') + '" placeholder="Vorname" aria-label="Vorname" />' +
          '<input type="date" value="' + iso + '" aria-label="Geburtsdatum" />' +
          (gen.family.members.length > 2 ? '<button type="button" class="fam-rm" aria-label="Entfernen">×</button>' : '<span></span>');
        const [nameIn, dateIn] = row.querySelectorAll('input');
        nameIn.addEventListener('input', () => { m.name = nameIn.value; rerender(); });
        dateIn.addEventListener('change', () => { m.born = new Date(dateIn.value); rerender(); });
        row.querySelector('.fam-rm')?.addEventListener('click', () => {
          gen.family.members.splice(i, 1); renderMembers(); rerender();
        });
        box.appendChild(row);
      });
    }
    $('famAdd')?.addEventListener('click', () => {
      if (gen.family.members.length >= 8) return;
      gen.family.members.push({ name: '', born: new Date('2020-01-01') });
      renderMembers(); rerender();
    });
    renderMembers();

    /* Motiv */
    document.querySelectorAll('.fam-variant').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fam-variant').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        gen.variant = btn.dataset.variant;
        rerender();
      });
    });

    /* Farben */
    $('famAccent')?.addEventListener('input', (e) => { gen.accent = e.target.value; rerender(); });
    $('famAccent2')?.addEventListener('input', (e) => { gen.accent2 = e.target.value; rerender(); });

    /* Format */
    document.querySelectorAll('.fam-size').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fam-size').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        gen.size = btn.dataset.size;
        rerender();
      });
    });

    /* Warenkorb */
    $('famAddToCart')?.addEventListener('click', async () => {
      if (!gen.valid()) { alert('Bitte Familienname und mindestens zwei Mitglieder mit Datum angeben.'); return; }
      const btn = $('famAddToCart');
      btn.disabled = true; btn.textContent = 'Wird vorbereitet…';
      try {
        const props = gen.lineItemProperties();
        const hubUrl = (window.DotsForLoveFulfillmentUrl || '').replace(/\/$/, '');
        if (hubUrl) {
          const up = await fetch(hubUrl + '/api/designs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              svg: gen.generateSVG(),
              meta: { size: gen.size, variant: 'familie-' + gen.variant, source: 'family-configurator' },
            }),
          });
          if (up.ok) props['_design_id'] = (await up.json()).designId;
        }
        const themeIds = window.DotsForLoveVariants || {};
        const variantId = themeIds[gen.size] || FALLBACK_VARIANT_IDS[gen.size];
        if (!variantId) throw new Error('Für dieses Format ist kein Produkt hinterlegt.');
        if (window.Shopify) {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ items: [{ id: variantId, quantity: 1, properties: props }] }),
          });
          if (!res.ok) throw new Error('Warenkorb-Fehler ' + res.status);
          window.location.href = '/cart';
        } else {
          alert('Im Online-Shop landet dein Poster jetzt im Warenkorb. (Entwicklungsmodus: kein Shopify erkannt.)');
        }
      } catch (err) {
        alert('Fehler: ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'In den Warenkorb 🛒';
      }
    });

    rerender();
  });
})();
