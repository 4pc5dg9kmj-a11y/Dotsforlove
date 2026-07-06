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
    didot:   '"Playfair Display", "Didot", Georgia, "Times New Roman", serif',
    sans:    '"Helvetica Neue", Helvetica, Arial, sans-serif',
    hand:    '"Caveat", "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive',
    poppins: '"Poppins", "DM Sans", "Helvetica Neue", Arial, sans-serif',
    lora:    '"Lora", Georgia, "Times New Roman", serif',
    marker:  '"Permanent Marker", "Caveat", "Comic Sans MS", cursive',
  };

  const NAME_PALETTE = ['#E8495A', '#845EC2', '#00C9A7', '#F9B233', '#4D9DE0', '#F28C50', '#9BC53D', '#C86FC9'];

  /* ── Sprachabhängige Beschriftung ──────────────────────────
     EN: "the {Name} Family" / "since {Jahr}"
     DE: "Familie {Name}"    / "seit {Jahr}"                  */
  function familyTitleLabel(fam) {
    return fam.lang === 'en' ? ('the ' + fam.name + ' Family') : ('Familie ' + fam.name);
  }
  function sinceLabel(fam, year) {
    return (fam.lang === 'en' ? 'since ' : 'seit ') + year;
  }

  const VARIANTS = {
    'smiley':          { label: 'Smiley-Grid' },
    'jahre':           { label: 'Jahreszahlen' },
    'raetsel-modern':  { label: 'Family Word Search · Modern' },
    'raetsel-classic': { label: 'Family Word Search · Classic' },
    'raetsel-hand':    { label: 'Family Word Search · Handwriting' },
    'figuren':         { label: 'Figuren nach Alter' },
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
      if (o.strokeWidth) {
        c.strokeStyle = o.fill;
        c.lineWidth = o.strokeWidth;
        c.lineJoin = 'round';
        c.strokeText(str, x, y);
      }
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
        (o.strokeWidth ? ' stroke="' + o.fill + '" stroke-width="' + o.strokeWidth.toFixed(2) + '" stroke-linejoin="round"' : '') +
        ' fill="' + o.fill + '" text-anchor="' + anchor + '">' + esc(str) + '</text>');
    }
    watermark() { /* Druckdatei bleibt sauber */ }
    toString() { return this.parts.concat('</svg>').join('\n'); }
  }

  /* ── Organik-Helfer ─────────────────────────────────────── */

  /** Handgezeichnet wirkende Ellipse: niederfrequentes Radius-Wobbeln. */
  function wobblyEllipse(s, cx, cy, rx, ry, tilt, o, rnd) {
    const a1 = 0.03 + rnd() * 0.03, a2 = 0.02 + rnd() * 0.03;
    const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2;
    const pts = [];
    const steps = 44;
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * Math.PI * 2;
      const w = 1 + a1 * Math.sin(t * 2 + p1) + a2 * Math.sin(t * 3 + p2);
      const px0 = Math.cos(t) * rx * w, py0 = Math.sin(t) * ry * w;
      pts.push([cx + Math.cos(tilt) * px0 - Math.sin(tilt) * py0,
                cy + Math.sin(tilt) * px0 + Math.cos(tilt) * py0]);
    }
    s.polyline(pts, { ...o, close: true });
  }

  /** Wort Buchstabe für Buchstabe mit leichtem Hüpfen (knubbeliger Look). */
  function bouncyText(s, str, x, y, o, rnd) {
    let cx = x;
    for (const ch of str) {
      const dy = (rnd() - 0.5) * o.size * 0.06;
      s.text(ch, cx, y + dy, o);
      cx += measure(ch, o.size, o.family, o.weight, o.style) + (o.spacing || 0);
    }
    return cx - x;
  }
  function bouncyWidth(str, o) {
    let w = 0;
    for (const ch of str) w += measure(ch, o.size, o.family, o.weight, o.style) + (o.spacing || 0);
    return w;
  }

  /** Text mit Laufweite (Letter-Spacing), zentrierbar. */
  function spacedText(s, str, x, y, o, spacing, align) {
    let total = 0;
    for (const ch of str) total += measure(ch, o.size, o.family, o.weight, o.style) + spacing;
    total -= spacing;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (const ch of str) {
      s.text(ch, cx, y, { ...o, align: 'left' });
      cx += measure(ch, o.size, o.family, o.weight, o.style) + spacing;
    }
  }

  /* ══ Painter · smiley ══
     Referenztreue: dicht gepackte, handgezeichnet-wackelige Gesichter,
     die sich fast berühren; knubbelige fette Typo in den vier Ecken. */
  function paintSmiley(s, fam, opts) {
    const W = s.W, H = s.H, M = W * 0.09;
    const BLUE = opts.accent || '#2B3FCB', CREAM = '#F6F1E7';
    s.rect(0, 0, W, H, CREAM);
    const rnd = rng('smiley:' + fam.name + fam.members.map((m) => m.name).join());

    // Knubbelige Typo: fett + Kontur-Verfettung + leichtes Hüpfen
    // EN: "{name} … the / est. {jahr} … family"  (Meme-Layout, wie Referenz)
    // DE: "{name} … familie / seit {jahr}" (ohne "the", deutsche Wortfolge)
    const isEn = fam.lang === 'en';
    const title = fam.name.toLowerCase();
    const tOpts = { family: FONTS.display, weight: 900, fill: BLUE };
    let tSize = fitSize(title, W * 0.15, FONTS.display, 900, 'normal', W - 2 * M - W * 0.15);
    bouncyText(s, title, M, M + tSize * 0.78,
      { ...tOpts, size: tSize, strokeWidth: tSize * 0.045 }, rnd);
    if (isEn) {
      const theSize = W * 0.038;
      s.text('the', W - M - measure('the', theSize, FONTS.display, 900), M + theSize * 0.9,
        { ...tOpts, size: theSize, strokeWidth: theSize * 0.045 });
    }
    const famWord = isEn ? 'family' : 'familie';
    const famSize = W * 0.105;
    const famW = bouncyWidth(famWord, { size: famSize, family: FONTS.display, weight: 900 });
    bouncyText(s, famWord, W - M - famW, H - M * 0.62,
      { ...tOpts, size: famSize, strokeWidth: famSize * 0.045 }, rnd);
    const estYear = Math.min(...fam.members.map((m) => m.born.getFullYear()));
    const starSize = W * 0.036;
    s.text((isEn ? 'est. ' : 'seit ') + estYear, M, H - M * 0.62,
      { ...tOpts, size: starSize, strokeWidth: starSize * 0.04 });

    // Gesichter: dicht an dicht, fast berührend
    const n = fam.members.length;
    const cols = n <= 2 ? n : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const areaTop = M + tSize + W * 0.02;
    const areaBot = H - M - W * 0.115;
    const cell = Math.min((W - 2 * M) / cols, (areaBot - areaTop) / rows);
    const gx = (W - cell * cols) / 2;
    const gy = areaTop + ((areaBot - areaTop) - cell * rows) / 2;
    const lw = Math.max(1.8, cell * 0.055);

    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const lastCount = n - (rows - 1) * cols;
      const offX = row === rows - 1 ? (cols - lastCount) * cell / 2 : 0;
      const cx = gx + offX + (col + 0.5) * cell + (rnd() - 0.5) * cell * 0.02;
      const cy = gy + (row + 0.5) * cell + (rnd() - 0.5) * cell * 0.02;
      const r = cell * 0.465;                          // fast berührend
      const tilt = (rnd() - 0.5) * 0.5;                // deutlich individueller
      const squish = 0.88 + rnd() * 0.2;
      wobblyEllipse(s, cx, cy, r, r * squish, tilt, { stroke: BLUE, lw }, rnd);

      // Augen: schmale vertikale Ovale, pro Gesicht variierend
      const eyeH = r * (0.2 + rnd() * 0.1);
      const eyeW = eyeH * (0.36 + rnd() * 0.14);
      const eyeY = -r * (0.16 + rnd() * 0.1);
      const eyeDX = r * (0.3 + rnd() * 0.1);
      const eye = (dx) => {
        const ex = cx + Math.cos(tilt) * dx - Math.sin(tilt) * eyeY;
        const ey = cy + Math.sin(tilt) * dx + Math.cos(tilt) * eyeY;
        s.ellipse(ex, ey, eyeW, eyeH, tilt + (rnd() - 0.5) * 0.2, { fill: BLUE });
      };
      eye(-eyeDX); eye(eyeDX);

      // Breites Lächeln, Weite und Krümmung variieren
      const smR = r * (0.55 + rnd() * 0.12);
      const smY = r * (0.02 + rnd() * 0.1);
      const a0 = (0.18 + rnd() * 0.08) * Math.PI;
      const a1e = Math.PI - a0;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const a = a0 + (k / 16) * (a1e - a0);
        const px0 = Math.cos(a) * smR, py0 = smY + Math.sin(a) * smR * (0.82 + rnd() * 0.02);
        pts.push([cx + Math.cos(tilt) * px0 - Math.sin(tilt) * py0,
                  cy + Math.sin(tilt) * px0 + Math.cos(tilt) * py0]);
      }
      s.polyline(pts, { stroke: BLUE, lw: lw * 0.92 });
    }
  }

  /* ══ Painter · jahre ══
     Referenztreue: große, elegante High-Contrast-Serifen (Didot-Stil),
     Zahlenblöcke exakt mittig, viel Weißraum. Kundenwunsch ergänzt:
     letzte zwei Ziffern hochgestellt, Name bündig darunter. */
  function paintJahre(s, fam) {
    const W = s.W, H = s.H, M = H * 0.085;
    s.rect(0, 0, W, H, '#FFFFFF');
    const mem = fam.members.slice().sort((a, b) => a.born - b.born);
    const n = mem.length;
    const rowH = Math.min(H * 0.2, (H - 2 * M) / n);
    const big = Math.min(rowH * 0.72, W * 0.24);
    const small = big * 0.55;
    let y = (H - rowH * n) / 2 + rowH * 0.62;

    for (const m of mem) {
      const yr = String(m.born.getFullYear());
      const head = yr.slice(0, 2), tail = yr.slice(2);
      const gap = big * 0.05;
      const headW = measure(head, big, FONTS.didot, 500);
      const tailW = measure(tail, small, FONTS.didot, 500);
      // Blockbreite = Gesamtziffern → optisch mittig wie in der Referenz
      const blockW = headW + gap + tailW;
      const x = (W - blockW) / 2;

      s.text(head, x, y, { size: big, family: FONTS.didot, weight: 500, fill: '#161616' });
      s.text(tail, x + headW + gap, y - (big - small) * 0.72,
        { size: small, family: FONTS.didot, weight: 500, fill: '#161616' });
      // Name mit Laufweite, bündig unter den hochgestellten Ziffern
      const nm = m.name.toUpperCase();
      const nmSize = Math.min(big * 0.11, fitSize(nm, big * 0.11, FONTS.sans, 500, 'normal', tailW * 1.6));
      spacedText(s, nm, x + headW + gap, y - (big - small) * 0.72 + small * 0.22 + nmSize,
        { size: nmSize, family: FONTS.sans, weight: 500, fill: '#9C9C9C' }, nmSize * 0.22, 'left');
      y += rowH;
    }
  }

  /* ══ Rätsel-Generator ══
     Standard 9×11 Zellen, wächst dynamisch mit Namenslänge/-anzahl.
     Kreuzungen auf gemeinsamen Buchstaben sind erlaubt. */
  function buildPuzzle(names, seed) {
    const rnd = rng('puzzle:' + seed + names.join());
    const clean = names.map((s2) => s2.toUpperCase().replace(/[^A-ZÄÖÜ]/g, '')).filter(Boolean);
    const longest = Math.max(...clean.map((s2) => s2.length), 4);
    const cols = Math.max(9, longest + 2);
    const rows = Math.max(11, longest + 2, clean.length * 2 + 3);
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const placements = [];
    let wi = 0;
    for (const word of clean) {
      // Richtungen mischen: reihum waagerecht / senkrecht / schräg nach
      // unten (wie im Referenzposter), damit jedes Poster alle drei zeigt
      const preferred = ['h', 'v', 'd'][wi++ % 3];
      for (let tries = 0; tries < 500; tries++) {
        const dir = tries < 200 ? preferred
          : (rnd() < 0.4 ? 'h' : rnd() < 0.6 ? 'v' : 'd');
        const maxR = dir === 'h' ? rows : rows - word.length;
        const maxC = dir === 'v' ? cols : cols - word.length;
        if (maxR <= 0 || maxC <= 0) continue;
        const r0 = Math.floor(rnd() * maxR), c0 = Math.floor(rnd() * maxC);
        let ok = true;
        for (let k = 0; k < word.length; k++) {
          const r = r0 + (dir === 'h' ? 0 : k), c = c0 + (dir === 'v' ? 0 : k);
          if (grid[r][c] !== null && grid[r][c] !== word[k]) { ok = false; break; }
        }
        if (!ok) continue;
        const cells = [];
        for (let k = 0; k < word.length; k++) {
          const r = r0 + (dir === 'h' ? 0 : k), c = c0 + (dir === 'v' ? 0 : k);
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

  /* ══ Painter · Family Word Search (modern | classic | hand) ══
     Drei Stil-Varianten mit festen Kreisfarben; Umkreisung hand-
     gezeichnet (Radius-Modulation + Zittern, Endüberlappung, zwei
     leicht gedriftete Umläufe). Unten Familienname fett + „since
     [Gründungsjahr]" — kein Markenname auf dem Poster. */
  const WS_STYLES = {
    modern: {
      letterFont: FONTS.poppins, letterWeight: 500, jitter: false,
      circle: '#C1664A',
      titleFont: FONTS.poppins, titleWeight: 700, titleStroke: 0,
      sinceFont: FONTS.poppins, sinceWeight: 300, sinceStyle: 'normal',
    },
    classic: {
      letterFont: FONTS.lora, letterWeight: 500, jitter: false,
      circle: '#7E3A3A',
      titleFont: FONTS.lora, titleWeight: 700, titleStroke: 0,
      sinceFont: FONTS.lora, sinceWeight: 400, sinceStyle: 'italic',
    },
    hand: {
      letterFont: FONTS.marker, letterWeight: 400, jitter: true,
      circle: '#B22228',
      titleFont: FONTS.marker, titleWeight: 400, titleStroke: 0.02,
      sinceFont: FONTS.hand, sinceWeight: 400, sinceStyle: 'normal',
    },
  };

  /** Handgezeichnete Umkreisung: dünne Polylinie über die Ellipsenbahn
      mit Radius-Modulation 1 + 0.03·sin(3t+φ) + 0.02·sin(7t) + Zittern,
      Endüberlappung 0.5–0.9 rad, zwei leicht gedriftete Umläufe. */
  function sketchOval(s, mx, my, rx, ry, ang, color, lw, rnd) {
    for (let loop = 0; loop < 2; loop++) {
      const phi = rnd() * Math.PI * 2;
      const a0 = rnd() * Math.PI * 2;
      const overlap = 0.5 + rnd() * 0.4;             // 0.5–0.9 rad
      const driftX = (rnd() - 0.5) * lw * 1.2;
      const driftY = (rnd() - 0.5) * lw * 1.2;
      const steps = 72;
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const a = a0 + u * (Math.PI * 2 + overlap);
        const mod = 1 + 0.03 * Math.sin(3 * a + phi) + 0.02 * Math.sin(7 * a)
                  + (rnd() - 0.5) * 0.008;
        const px0 = Math.cos(a) * rx * mod, py0 = Math.sin(a) * ry * mod;
        pts.push([mx + driftX + Math.cos(ang) * px0 - Math.sin(ang) * py0,
                  my + driftY + Math.sin(ang) * px0 + Math.cos(ang) * py0]);
      }
      s.polyline(pts, { stroke: color, lw: loop ? lw * 0.8 : lw });
    }
  }

  function paintRaetsel(s, fam, style) {
    const ST = WS_STYLES[style] || WS_STYLES.modern;
    const W = s.W, H = s.H, M = W * 0.1;
    s.rect(0, 0, W, H, '#FFFFFF');
    const { grid, placements, rows, cols } = buildPuzzle(fam.members.map((m) => m.name), fam.name);

    // Rasterfläche; unten Platz für Titel + „since"
    const areaH = H - 2 * M - H * 0.13;
    const cell = Math.min((W - 2 * M) / cols, areaH / rows);
    const cellW = cell, cellH = cell;
    const gx = (W - cell * cols) / 2, gy = M + (areaH - cell * rows) / 2;

    const rndJ = rng('jitter:' + fam.name + style);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o = { size: cell * 0.42, family: ST.letterFont, weight: ST.letterWeight, fill: '#2A2A2A', align: 'center' };
        let x = gx + (c + 0.5) * cell, y = gy + (r + 0.5) * cell + o.size * 0.35;
        if (ST.jitter) {
          // Handwriting: pro Buchstabe ±7° Rotation + kleiner Positions-Jitter
          o.rotate = (rndJ() - 0.5) * (14 * Math.PI / 180);
          x += (rndJ() - 0.5) * cell * 0.09;
          y += (rndJ() - 0.5) * cell * 0.09;
        }
        s.text(grid[r][c], x, y, o);
      }
    }

    // Umkreisungen: Länge = Wortlänge + 1,15 Zellbreiten, Höhe 0,92 Zellhöhe.
    // Berühren die Buchstaben nicht — Lesbarkeit hat Priorität.
    placements.forEach((p, pi) => {
      const first = p.cells[0], last = p.cells[p.cells.length - 1];
      const x1 = gx + (first[1] + 0.5) * cell, y1 = gy + (first[0] + 0.5) * cell;
      const x2 = gx + (last[1] + 0.5) * cell, y2 = gy + (last[0] + 0.5) * cell;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const rx = (Math.hypot(x2 - x1, y2 - y1) + 1.15 * cellW) / 2;
      const ry = 0.92 * cellH / 2;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const rr = rng('oval' + pi + p.word);
      sketchOval(s, mx, my, rx, ry, ang, ST.circle, cell * 0.075, rr);
    });

    // Fußbereich: dünner schwarzer Trennstrich, darunter Familienname
    // FETT in der Stilschrift, darunter klein "since/seit [Gründungsjahr]"
    // ebenfalls schwarz. Kein Markenname. EN: "the {Name} Family" · DE: "Familie {Name}"
    const founded = fam.founded || Math.min(...fam.members.map((m) => m.born.getFullYear()));
    const fy = H - M - H * 0.058;
    s.polyline([[W / 2 - W * 0.1, fy], [W / 2 + W * 0.1, fy]], { stroke: '#1A1A1A', lw: cell * 0.045 });
    const ty = fy + W * 0.05;
    const title = familyTitleLabel(fam);
    const tSize = fitSize(title, W * 0.055, ST.titleFont, ST.titleWeight, 'normal', W - 2 * M);
    s.text(title, W / 2, ty, {
      size: tSize, family: ST.titleFont, weight: ST.titleWeight, fill: '#1F1F1F',
      align: 'center', strokeWidth: ST.titleStroke ? tSize * ST.titleStroke : 0,
    });
    s.text(sinceLabel(fam, founded), W / 2, ty + W * 0.038, {
      size: W * 0.024, family: ST.sinceFont, weight: ST.sinceWeight,
      style: ST.sinceStyle, fill: '#1A1A1A', align: 'center',
    });
  }

  /* ══ Painter · figuren ══
     Referenztreue: organische, sich verjüngende Pinselstriche mit rauen
     Kanten und ungleich langen Enden; Kopf als unregelmäßiger Klecks;
     Figuren dicht gestaffelt mit leichter Überlappung statt Reihe.
     Namen & Fußzeile in wählbarem Schriftstil (klassisch/modern/
     Handschrift), analog zu den Word-Search-Stilen. */
  const FIGURE_LETTER_STYLES = {
    classic: { font: FONTS.lora, weight: 500, style: 'italic' },
    modern:  { font: FONTS.poppins, weight: 600, style: 'normal' },
    hand:    { font: FONTS.hand, weight: 600, style: 'italic' },
  };

  function paintFiguren(s, fam, opts) {
    const W = s.W, H = s.H, M = W * 0.12;
    // Kurze Seite als Referenz für Schriftgrößen/Abstände, damit Fußzeile
    // & Namen auch im Querformat proportional bleiben (nicht an W hängen,
    // das im Querformat groß, aber der verfügbare Platz an H, klein ist).
    const S = Math.min(W, H);
    const FIG = opts.accent2 || '#141414', BG = '#F2EBDD';
    const LS = FIGURE_LETTER_STYLES[opts.figureLetterStyle] || FIGURE_LETTER_STYLES.hand;
    s.rect(0, 0, W, H, BG);

    const now = new Date();
    const mem = fam.members
      .map((m) => ({ ...m, age: Math.max(0.5, (now - m.born) / 3.15576e10) }))
      .sort((a, b) => b.age - a.age);
    const maxAge = mem[0].age;
    const n = mem.length;
    const rnd = rng('fig:' + fam.name + n);

    const baseY0 = H - M - H * 0.02;
    const maxFigH = H - 2 * M - H * 0.05;
    // Dichte Staffelung: Figuren rücken zusammen und überlappen leicht
    const clusterW = Math.min(W - 2 * M, W * 0.09 * n + W * 0.28);
    const slot = clusterW / Math.max(1, n - 0.3);
    const startX = (W - clusterW) / 2 + slot * 0.35;

    /** Ein Pinselstrich: leichte Kantenunruhe, Verjüngung, dezenter Schwung. */
    function brushStroke(cx, off, wTop, wBot, topYs, botYs, bend) {
      const SEG = 7;
      const left = [], right = [];
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        const y = topYs + (botYs - topYs) * t;
        const wHere = wTop + (wBot - wTop) * t;
        const sway = bend * Math.sin(t * Math.PI);
        const jL = (rnd() - 0.5) * wHere * 0.07;
        const jR = (rnd() - 0.5) * wHere * 0.07;
        left.push([cx + off + sway - wHere / 2 + jL, y]);
        right.push([cx + off + sway + wHere / 2 + jR, y]);
      }
      s.polyline(left.concat(right.reverse()), { fill: FIG, close: true });
    }

    mem.forEach((m, i) => {
      const hFrac = 0.3 + 0.7 * Math.min(1, m.age / maxAge);
      const figH = maxFigH * hFrac;
      const figW = Math.min(slot * 0.94, figH * 0.22 + W * 0.03);
      const baseY = baseY0 - rnd() * H * 0.012;              // Standhöhe variiert
      const cx = startX + slot * i + (rnd() - 0.5) * slot * 0.14;
      const headR = figW * 0.4;
      const topY = baseY - figH;

      // Kopf als unregelmäßiger Klecks
      wobblyEllipse(s, cx + (rnd() - 0.5) * figW * 0.1, topY + headR,
        headR, headR * (1.05 + rnd() * 0.2), (rnd() - 0.5) * 0.35, { fill: FIG }, rnd);

      // Immer 5 Striche MIT sichtbarer Lücke dazwischen:
      // außen kurz (Hände/Arme), daneben lang (Beine), Mitte kurz.
      // Striche ruhig gehalten: wenig Schwung, kaum Kantenrauschen.
      const bodyTop = topY + headR * (1.85 + rnd() * 0.2);
      const bodyBend = (rnd() - 0.5) * figW * 0.12;          // dezenter Schwung
      const spanY = baseY - bodyTop;
      const armBot = () => bodyTop + spanY * (0.42 + rnd() * 0.06);
      const legBot = () => baseY - rnd() * figH * 0.02;
      const midBot = bodyTop + spanY * (0.55 + rnd() * 0.05);
      const strokes = [
        { off: -2, bot: armBot(), w: 0.19 },   // Hand/Arm links (kurz)
        { off: -1, bot: legBot(), w: 0.23 },   // Bein links (lang)
        { off:  0, bot: midBot,   w: 0.205 },  // Mitte (kurz)
        { off:  1, bot: legBot(), w: 0.23 },   // Bein rechts (lang)
        { off:  2, bot: armBot(), w: 0.19 },   // Hand/Arm rechts (kurz)
      ];
      for (const st of strokes) {
        const off = st.off * figW * 0.225;     // Abstand knapp > Strichbreite → schmale Lücke
        const wTop = figW * (st.w + rnd() * 0.015);
        const wBot = wTop * (0.6 + rnd() * 0.15);
        const bend = bodyBend * (st.off === 0 ? 0.6 : 1) + (rnd() - 0.5) * figW * 0.04;
        brushStroke(cx, off, wTop, wBot, bodyTop, st.bot, bend);
      }

      // Name NICHT im Strichbild — unten links neben den Füßen, waagerecht
      // lesbar, im gewählten Schriftstil (klassisch/modern/Handschrift)
      const nmSize = Math.min(S * 0.026, figW * 0.36);
      s.text(m.name, cx - figW * 0.52, baseY + nmSize * 1.25,
        { size: nmSize, family: LS.font, weight: LS.weight, style: LS.style,
          fill: 'rgba(20,20,20,.68)', align: 'left' });
    });

    // Fußbereich: dünner Trennstrich, darunter Familienname (DE/EN),
    // ebenfalls im gewählten Schriftstil. Schriftgröße & Abstand an der
    // kurzen Seite (S) ausgerichtet, damit es im Querformat nicht kollidiert.
    const footY = H - H * 0.058;
    s.polyline([[W / 2 - W * 0.09, footY], [W / 2 + W * 0.09, footY]],
      { stroke: 'rgba(20,20,20,.3)', lw: S * 0.0035 });
    s.text(familyTitleLabel(fam), W / 2, H - H * 0.028,
      { size: S * 0.03, family: LS.font, weight: LS.weight, style: LS.style, fill: 'rgba(20,20,20,.55)', align: 'center' });
  }

  const PAINTERS = {
    'smiley':          (s, fam, o) => paintSmiley(s, fam, o),
    'jahre':           (s, fam) => paintJahre(s, fam),
    'raetsel-modern':  (s, fam) => paintRaetsel(s, fam, 'modern'),
    'raetsel-classic': (s, fam) => paintRaetsel(s, fam, 'classic'),
    'raetsel-hand':    (s, fam) => paintRaetsel(s, fam, 'hand'),
    'figuren':         (s, fam, o) => paintFiguren(s, fam, o),
  };

  /* ══ Generator-Klasse ══ */
  class FamilyPosterGenerator {
    constructor() {
      this.variant = 'smiley';
      this.size = 'A3';
      this.accent = '#2B3FCB';   // Smiley-Farbe
      this.accent2 = '#141414';  // Figuren-Farbe
      this.accent3 = '#E8495A';  // Rätsel-Pinsel-Farbe (einheitlicher Zeichnungslook)
      this.orientation = 'portrait';   // nur beim Strichbild (Figuren) wirksam
      this.figureLetterStyle = 'hand'; // 'classic' | 'modern' | 'hand' — Namen & Fußzeile bei Figuren
      this.family = {
        name: 'Weber',
        city: '',
        founded: null,   // Gründungsjahr der Familie (für "since …")
        lang: 'de',      // Beschriftung: 'de' → "Familie Weber", 'en' → "the Weber Family"
        members: [
          { name: 'Michael', born: new Date('1985-04-12') },
          { name: 'Anna', born: new Date('1987-09-03') },
          { name: 'Emma', born: new Date('2015-03-02') },
          { name: 'Luis', born: new Date('2019-11-20') },
        ],
      };
    }
    dims() {
      const d = SIZES[this.size] || SIZES.A3;
      // Hoch-/Querformat gilt bewusst nur beim Strichbild (Figuren) —
      // die anderen Motive sind fürs Hochformat komponiert.
      if (this.variant === 'figuren' && this.orientation === 'landscape') {
        return { w: d.h, h: d.w, label: d.label };
      }
      return d;
    }
    price() {
      const injected = window.DotsForLovePrices || {};
      return parseFloat(injected[this.size]) || FALLBACK_PRICES[this.size] || 0;
    }
    valid() {
      return this.family.name.trim() &&
        this.family.members.filter((m) => m.name.trim() && !isNaN(m.born)).length >= 2;
    }
    _cleanFamily() {
      const founded = parseInt(this.family.founded, 10);
      return {
        name: this.family.name.trim() || 'Familie',
        city: (this.family.city || '').trim(),
        founded: founded >= 1000 && founded <= 9999 ? founded : null,
        lang: this.family.lang === 'en' ? 'en' : 'de',
        members: this.family.members
          .filter((m) => m.name.trim() && !isNaN(m.born))
          .slice(0, 8),
      };
    }
    _opts() {
      return {
        accent: this.accent, accent2: this.accent2, accent3: this.accent3,
        figureLetterStyle: this.figureLetterStyle,
      };
    }
    renderPreview(canvas) {
      const { w, h } = this.dims();
      const surface = new CanvasSurface(canvas, w, h);
      PAINTERS[this.variant](surface, this._cleanFamily(), this._opts());
      surface.watermark();
    }
    generateSVG() {
      const { w, h } = this.dims();
      const surface = new SvgSurface(w, h);
      PAINTERS[this.variant](surface, this._cleanFamily(), this._opts());
      return surface.toString();
    }
    lineItemProperties() {
      const fam = this._cleanFamily();
      return {
        'Motiv': 'Familie · ' + (VARIANTS[this.variant]?.label || this.variant),
        'Familienname': fam.name,
        'Beschriftung': fam.lang === 'en' ? 'Englisch' : 'Deutsch',
        'Gründungsjahr': fam.founded || '',
        'Mitglieder': fam.members.map((m) => m.name + ' (' + m.born.getFullYear() + ')').join(', '),
        'Format': SIZES[this.size].label,
        'Akzentfarbe': this.variant === 'smiley' ? this.accent
          : this.variant === 'figuren' ? this.accent2 : '—',
        'Ausrichtung': this.variant === 'figuren'
          ? (this.orientation === 'landscape' ? 'Querformat' : 'Hochformat') : '—',
        'Schriftstil': this.variant === 'figuren'
          ? ({ classic: 'Klassisch', modern: 'Modern', hand: 'Handschrift' })[this.figureLetterStyle] : '—',
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
      const orient = $('orientRowFiguren'), letter = $('letterRowFiguren');
      const isFiguren = gen.variant === 'figuren';
      if (smiley) smiley.hidden = gen.variant !== 'smiley';
      if (fig) fig.hidden = !isFiguren;
      if (orient) orient.hidden = !isFiguren;
      if (letter) letter.hidden = !isFiguren;
    }

    /* Familie */
    $('famName')?.addEventListener('input', (e) => { gen.family.name = e.target.value; rerender(); });
    $('famCity')?.addEventListener('input', (e) => { gen.family.city = e.target.value; rerender(); });
    $('famFounded')?.addEventListener('input', (e) => { gen.family.founded = e.target.value; rerender(); });
    document.querySelectorAll('.fam-lang').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fam-lang').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        gen.family.lang = btn.dataset.lang;
        rerender();
      });
    });

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
    $('famAccent3')?.addEventListener('input', (e) => { gen.accent3 = e.target.value; rerender(); });

    /* Ausrichtung (nur Strichbild/Figuren) */
    document.querySelectorAll('.fam-orient').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fam-orient').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        gen.orientation = btn.dataset.orient;
        rerender();
      });
    });

    /* Schriftstil der Namen & Fußzeile (nur Strichbild/Figuren) */
    document.querySelectorAll('.fam-letterstyle').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fam-letterstyle').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        gen.figureLetterStyle = btn.dataset.letterstyle;
        rerender();
      });
    });

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
