/**
 * Dots for Love – Dot Pattern Generator
 * ======================================
 * Core algorithm for converting images into scalable dot-art patterns.
 * All shapes are the same size; brightness varies to recreate the image.
 * Output: infinitely scalable SVG vector file.
 */

'use strict';

class DotPatternGenerator {
  constructor() {
    this.imageData  = null;   // ImageData from uploaded image
    this.imgWidth   = 0;
    this.imgHeight  = 0;
    this._lastSVG   = null;   // Cached SVG string

    /** Poster sizes in mm */
    this.SIZES = {
      'A4':    { w: 210,  h: 297  },
      'A3':    { w: 297,  h: 420  },
      'A2':    { w: 420,  h: 594  },
      'A1':    { w: 594,  h: 841  },
      '30x40': { w: 300,  h: 400  },
      '50x70': { w: 500,  h: 700  },
      '70x100':{ w: 700,  h: 1000 },
    };

    /** Prices per size in EUR */
    this.PRICES = {
      'A4':    19.90,
      'A3':    29.90,
      'A2':    44.90,
      'A1':    69.90,
      '30x40': 34.90,
      '50x70': 54.90,
      '70x100':79.90,
    };

    this.options = {
      numDots:     2000,
      shape:       'circle',   // circle | heart | square | cross | triangle
      colorMode:   'single',   // single | triple
      colors:      ['#1A1A2E', '#845EC2', '#00C9A7'],
      bgColor:     '#FFFFFF',
      posterSize:  'A3',
      orientation: 'portrait', // portrait | landscape
    };
  }

  /* ──────────────────────────────────────────
     IMAGE LOADING
  ────────────────────────────────────────── */

  /**
   * Load an image from a File object, downsample to max 1200px for perf.
   * @param {File} file
   * @returns {Promise<HTMLImageElement>}
   */
  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        return reject(new Error('Invalid file type'));
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.onload = () => {
          const MAX = 1200;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width  * scale);
          const h = Math.round(img.height * scale);
          const tmp = document.createElement('canvas');
          tmp.width = w; tmp.height = h;
          const ctx = tmp.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          this.imageData  = ctx.getImageData(0, 0, w, h);
          this.imgWidth   = w;
          this.imgHeight  = h;
          this._lastSVG   = null;
          resolve(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ──────────────────────────────────────────
     PIXEL SAMPLING
  ────────────────────────────────────────── */

  /**
   * Sample perceptual luminance from normalised coordinates [0,1].
   * Uses 3×3 average for smoother gradients.
   */
  sampleLuminance(normX, normY) {
    if (!this.imageData) return 128;
    const data = this.imageData.data;
    const W = this.imgWidth, H = this.imgHeight;

    const cx = normX * (W - 1);
    const cy = normY * (H - 1);

    let total = 0, count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.max(0, Math.min(W - 1, Math.round(cx + dx)));
        const py = Math.max(0, Math.min(H - 1, Math.round(cy + dy)));
        const i  = (py * W + px) * 4;
        // ITU-R BT.709 luminance
        total += 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
        count++;
      }
    }
    return total / count;
  }

  /* ──────────────────────────────────────────
     COLOR UTILITIES
  ────────────────────────────────────────── */

  _hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** Blend a hex colour toward white by whiteFactor [0=pure, 1=white] */
  _blendWhite(hex, whiteFactor) {
    const { r, g, b } = this._hexToRgb(hex);
    const wf = Math.max(0, Math.min(1, whiteFactor));
    const nr = Math.round(r + (255 - r) * wf);
    const ng = Math.round(g + (255 - g) * wf);
    const nb = Math.round(b + (255 - b) * wf);
    return `rgb(${nr},${ng},${nb})`;
  }

  /**
   * Map pixel luminance to a fill colour.
   * luminance 0 = black pixel → darkest shape
   * luminance 255 = white pixel → nearly invisible shape
   */
  _luminanceToColor(luminance) {
    const t = luminance / 255;                    // 0 (dark) → 1 (light)
    // Slight gamma lift for midtones
    const tf = Math.pow(t, 0.8);

    if (this.options.colorMode === 'single') {
      return this._blendWhite(this.options.colors[0], tf);
    }

    // Three-color mode: dark → color1, mid → color2, light → color3
    // Smooth transitions with overlap at boundaries
    const [c1, c2, c3] = this.options.colors;
    if (tf < 0.40) {
      const local = tf / 0.40;
      return this._blendWhite(c1, local * 0.35);
    } else if (tf < 0.70) {
      const local = (tf - 0.40) / 0.30;
      return this._blendWhite(c2, 0.20 + local * 0.35);
    } else {
      const local = (tf - 0.70) / 0.30;
      return this._blendWhite(c3, 0.45 + local * 0.50);
    }
  }

  /* ──────────────────────────────────────────
     GRID CALCULATION
  ────────────────────────────────────────── */

  _getPosterDimensions() {
    const size = this.SIZES[this.options.posterSize] || this.SIZES['A3'];
    if (this.options.orientation === 'landscape') {
      return { w: size.h, h: size.w };
    }
    return { w: size.w, h: size.h };
  }

  _calcGrid() {
    const { w, h }  = this._getPosterDimensions();
    const ar        = w / h;
    const n         = Math.max(1, this.options.numDots);
    const cols      = Math.max(1, Math.round(Math.sqrt(n * ar)));
    const rows      = Math.max(1, Math.ceil(n / cols));
    return {
      cols, rows,
      cellW: w / cols,
      cellH: h / rows,
      totalDots: cols * rows,
    };
  }

  /* ──────────────────────────────────────────
     SVG SHAPE RENDERERS
  ────────────────────────────────────────── */

  _n(v) { return v.toFixed(3); }

  _svgShape(type, cx, cy, r, color) {
    const n = this._n.bind(this);
    switch (type) {
      case 'circle':
        return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}"/>`;

      case 'square': {
        const s = r * 1.72;
        return `<rect x="${n(cx-s/2)}" y="${n(cy-s/2)}" width="${n(s)}" height="${n(s)}" fill="${color}"/>`;
      }

      case 'triangle': {
        const h = r * 1.85;
        return `<polygon points="${n(cx)},${n(cy-h*0.65)} ${n(cx-r)},${n(cy+h*0.38)} ${n(cx+r)},${n(cy+h*0.38)}" fill="${color}"/>`;
      }

      case 'cross': {
        const w = r * 0.38, l = r;
        return `<path d="M${n(cx-w)},${n(cy-l)} L${n(cx+w)},${n(cy-l)} L${n(cx+w)},${n(cy-w)} L${n(cx+l)},${n(cy-w)} L${n(cx+l)},${n(cy+w)} L${n(cx+w)},${n(cy+w)} L${n(cx+w)},${n(cy+l)} L${n(cx-w)},${n(cy+l)} L${n(cx-w)},${n(cy+w)} L${n(cx-l)},${n(cy+w)} L${n(cx-l)},${n(cy-w)} L${n(cx-w)},${n(cy-w)}Z" fill="${color}"/>`;
      }

      case 'heart': {
        // Smooth heart via two bezier lobes
        const s = r;
        return `<path d="` +
          `M${n(cx)},${n(cy-s*0.25)} ` +
          `C${n(cx)},${n(cy-s*1.05)} ${n(cx-s)},${n(cy-s*1.05)} ${n(cx-s)},${n(cy-s*0.1)} ` +
          `C${n(cx-s)},${n(cy+s*0.55)} ${n(cx)},${n(cy+s*0.9)} ${n(cx)},${n(cy+s*0.9)} ` +
          `C${n(cx)},${n(cy+s*0.9)} ${n(cx+s)},${n(cy+s*0.55)} ${n(cx+s)},${n(cy-s*0.1)} ` +
          `C${n(cx+s)},${n(cy-s*1.05)} ${n(cx)},${n(cy-s*1.05)} ${n(cx)},${n(cy-s*0.25)}Z` +
          `" fill="${color}"/>`;
      }

      default:
        return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}"/>`;
    }
  }

  /* ──────────────────────────────────────────
     CANVAS SHAPE RENDERERS
  ────────────────────────────────────────── */

  _canvasShape(ctx, type, cx, cy, r) {
    ctx.beginPath();
    switch (type) {
      case 'circle':
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        break;

      case 'square': {
        const s = r * 1.72;
        ctx.rect(cx - s/2, cy - s/2, s, s);
        break;
      }

      case 'triangle': {
        const h = r * 1.85;
        ctx.moveTo(cx, cy - h * 0.65);
        ctx.lineTo(cx - r, cy + h * 0.38);
        ctx.lineTo(cx + r, cy + h * 0.38);
        ctx.closePath();
        break;
      }

      case 'cross': {
        const w = r * 0.38, l = r;
        ctx.moveTo(cx - w, cy - l); ctx.lineTo(cx + w, cy - l);
        ctx.lineTo(cx + w, cy - w); ctx.lineTo(cx + l, cy - w);
        ctx.lineTo(cx + l, cy + w); ctx.lineTo(cx + w, cy + w);
        ctx.lineTo(cx + w, cy + l); ctx.lineTo(cx - w, cy + l);
        ctx.lineTo(cx - w, cy + w); ctx.lineTo(cx - l, cy + w);
        ctx.lineTo(cx - l, cy - w); ctx.lineTo(cx - w, cy - w);
        ctx.closePath();
        break;
      }

      case 'heart': {
        const s = r;
        ctx.moveTo(cx, cy - s * 0.25);
        ctx.bezierCurveTo(cx, cy - s * 1.05, cx - s, cy - s * 1.05, cx - s, cy - s * 0.1);
        ctx.bezierCurveTo(cx - s, cy + s * 0.55, cx, cy + s * 0.9, cx, cy + s * 0.9);
        ctx.bezierCurveTo(cx, cy + s * 0.9, cx + s, cy + s * 0.55, cx + s, cy - s * 0.1);
        ctx.bezierCurveTo(cx + s, cy - s * 1.05, cx, cy - s * 1.05, cx, cy - s * 0.25);
        ctx.closePath();
        break;
      }

      default:
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /* ──────────────────────────────────────────
     WATERMARK
  ────────────────────────────────────────── */

  _drawWatermark(ctx, width, height) {
    ctx.save();
    // Semi-transparent white veil
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(0, 0, width, height);

    // Diagonal repeating text
    const fontSize  = Math.max(14, Math.min(width, height) * 0.030);
    const text      = '© DOTS FOR LOVE';
    ctx.font        = `700 ${fontSize}px 'DM Sans', sans-serif`;
    ctx.fillStyle   = 'rgba(26,26,46,0.18)';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';

    const spacing   = fontSize * 8;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 5);

    const cols = Math.ceil(width  / spacing) + 3;
    const rows = Math.ceil(height / spacing) + 3;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        ctx.fillText(text, c * spacing, r * spacing);
      }
    }
    ctx.restore();
  }

  /* ──────────────────────────────────────────
     PUBLIC: RENDER PREVIEW TO CANVAS
  ────────────────────────────────────────── */

  /**
   * Render a watermarked preview onto an HTMLCanvasElement.
   * @param {HTMLCanvasElement} canvas
   * @param {Function} [onProgress] Called with 0–1
   */
  renderPreview(canvas, onProgress) {
    if (!this.imageData) {
      console.warn('DotPatternGenerator: no image loaded');
      return;
    }

    const { w: svgW, h: svgH } = this._getPosterDimensions();
    const { cols, rows, cellW: svgCellW, cellH: svgCellH } = this._calcGrid();
    const svgDotR = Math.min(svgCellW, svgCellH) * 0.40;

    // Scale to canvas
    const cW     = canvas.width;
    const cH     = canvas.height;
    const scale  = Math.min(cW / svgW, cH / svgH);
    const cellW  = svgCellW * scale;
    const cellH  = svgCellH * scale;
    const dotR   = svgDotR * scale;

    const offX   = (cW - svgW * scale) / 2;
    const offY   = (cH - svgH * scale) / 2;

    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    // Background (chessboard)
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(0, 0, cW, cH);

    // Poster background
    ctx.fillStyle = this.options.bgColor || '#FFFFFF';
    ctx.fillRect(offX, offY, svgW * scale, svgH * scale);

    const total = rows * cols;
    let   drawn = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const normX    = col / cols;
        const normY    = row / rows;
        const lum      = this.sampleLuminance(normX, normY);
        const color    = this._luminanceToColor(lum);
        const cx       = offX + (col + 0.5) * cellW;
        const cy       = offY + (row + 0.5) * cellH;

        ctx.fillStyle = color;
        this._canvasShape(ctx, this.options.shape, cx, cy, dotR);
        drawn++;
      }
      if (onProgress) onProgress(drawn / total);
    }

    // Watermark overlay
    this._drawWatermark(ctx, cW, cH);
  }

  /* ──────────────────────────────────────────
     PUBLIC: GENERATE SVG STRING
  ────────────────────────────────────────── */

  /**
   * Generate the full SVG vector string.
   * Returns cached value if nothing changed.
   * @param {Function} [onProgress] Called with 0–1
   * @returns {string} SVG markup
   */
  generateSVG(onProgress) {
    if (!this.imageData) return '';

    const { w, h }          = this._getPosterDimensions();
    const { cols, rows, cellW, cellH, totalDots } = this._calcGrid();
    const dotR              = Math.min(cellW, cellH) * 0.40;

    const shapes = [];
    const total  = rows * cols;
    let drawn    = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const normX = col / cols;
        const normY = row / rows;
        const lum   = this.sampleLuminance(normX, normY);
        const color = this._luminanceToColor(lum);
        const cx    = (col + 0.5) * cellW;
        const cy    = (row + 0.5) * cellH;
        shapes.push(this._svgShape(this.options.shape, cx, cy, dotR, color));
        drawn++;
        if (onProgress && drawn % 500 === 0) onProgress(drawn / total);
      }
    }

    const bg  = this.options.bgColor || '#FFFFFF';
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Dots for Love – ${this.options.posterSize} ${this.options.orientation} -->
<!-- ${cols} × ${rows} = ${totalDots} dots | Shape: ${this.options.shape} | Color: ${this.options.colorMode} -->
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${w} ${h}"
     width="${w}mm"
     height="${h}mm">
  <title>Dots for Love Poster</title>
  <desc>Personalisiertes Dot-Art Poster. Erstellt auf dotsforlove.com</desc>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${shapes.join('\n  ')}
</svg>`;

    this._lastSVG = svg;
    if (onProgress) onProgress(1);
    return svg;
  }

  /* ──────────────────────────────────────────
     PUBLIC: DOWNLOAD SVG (PREVIEW/WATERMARKED)
  ────────────────────────────────────────── */

  downloadPreviewSVG() {
    const svg = this._lastSVG || this.generateSVG();
    // Add watermark comment to SVG
    const marked = svg.replace('</svg>', `
  <!-- PREVIEW – Wasserzeichen-Schutz aktiv. Vollversion nach Kauf verfügbar. -->
  <text x="50%" y="50%" font-family="sans-serif" font-size="8"
        fill="rgba(26,26,46,0.12)" text-anchor="middle"
        dominant-baseline="middle" transform="rotate(-20)"
        style="pointer-events:none">
    © DOTS FOR LOVE – PREVIEW
  </text>
</svg>`);
    this._triggerDownload(marked, 'dots-for-love-preview.svg', 'image/svg+xml');
  }

  /** Trigger browser download of the CLEAN SVG (post-purchase) */
  downloadFinalSVG() {
    const svg = this._lastSVG || this.generateSVG();
    this._triggerDownload(svg, 'dots-for-love-poster.svg', 'image/svg+xml');
  }

  _triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ──────────────────────────────────────────
     PUBLIC: UTILITY METHODS
  ────────────────────────────────────────── */

  /**
   * Convert years to total days (accounting for leap years).
   * Starts counting from the current year going backwards.
   */
  yearsToTotalDays(years) {
    years = Math.max(0, Math.round(years));
    const now  = new Date().getFullYear();
    let   days = 0;
    for (let y = now - years + 1; y <= now; y++) {
      days += this._isLeapYear(y) ? 366 : 365;
    }
    return days;
  }

  /** Days between two date strings (YYYY-MM-DD) */
  dateRangeToDays(startStr, endStr) {
    const start = new Date(startStr);
    const end   = new Date(endStr);
    if (isNaN(start) || isNaN(end)) return 0;
    return Math.abs(Math.round((end - start) / 86400000));
  }

  _isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  /** Price for the currently selected poster size */
  getPrice() {
    return this.PRICES[this.options.posterSize] || 0;
  }

  /** Human-readable size label */
  getSizeLabel() {
    const dims = this.SIZES[this.options.posterSize];
    const { w, h } = this._getPosterDimensions();
    return `${this.options.posterSize} (${w/10}×${h/10} cm)`;
  }

  /** Prepare Shopify line-item properties for the cart */
  getShopifyLineItemProperties() {
    const grid = this._calcGrid();
    return {
      'Format':           this.options.posterSize,
      'Ausrichtung':      this.options.orientation === 'portrait' ? 'Hochformat' : 'Querformat',
      'Symbol':           this.options.shape,
      'Farbmodus':        this.options.colorMode === 'single' ? '1 Farbe' : '3 Farben',
      'Farbe 1':          this.options.colors[0],
      'Farbe 2':          this.options.colors[1],
      'Farbe 3':          this.options.colors[2],
      'Hintergrund':      this.options.bgColor,
      'Punkte (gesamt)':  String(grid.totalDots),
      'Raster':           `${grid.cols} × ${grid.rows}`,
      '_svgData':         'generated_on_order', // full SVG sent server-side
    };
  }

  /* ──────────────────────────────────────────
     DEMO / DECORATION RENDERING
  ────────────────────────────────────────── */

  /**
   * Render a decorative animated dot field on a canvas.
   * Used for hero, CTA and landing page previews.
   */
  static renderDecorativeDots(canvas, opts = {}) {
    const {
      dotColor  = '#845EC2',
      dotColor2 = '#E8495A',
      dotColor3 = '#00C9A7',
      dotCount  = 120,
      speed     = 0.4,
      animate   = true,
    } = opts;

    const ctx   = canvas.getContext('2d');
    const W     = canvas.offsetWidth  || canvas.width;
    const H     = canvas.offsetHeight || canvas.height;
    canvas.width  = W;
    canvas.height = H;

    const dots = Array.from({ length: dotCount }, () => ({
      x:    Math.random() * W,
      y:    Math.random() * H,
      r:    1.5 + Math.random() * 3,
      vx:   (Math.random() - 0.5) * speed,
      vy:   (Math.random() - 0.5) * speed,
      color: [dotColor, dotColor2, dotColor3][Math.floor(Math.random() * 3)],
      alpha: 0.15 + Math.random() * 0.35,
    }));

    let rafId;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle   = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        if (animate) {
          d.x += d.vx;
          d.y += d.vy;
          if (d.x < -10) d.x = W + 10;
          if (d.x > W + 10) d.x = -10;
          if (d.y < -10) d.y = H + 10;
          if (d.y > H + 10) d.y = -10;
        }
      }
      ctx.globalAlpha = 1;
      if (animate) rafId = requestAnimationFrame(draw);
    }
    draw();
    return { stop: () => cancelAnimationFrame(rafId) };
  }

  /**
   * Render a static demo dot pattern (without requiring an image).
   * Simulates a gradient to show the capability.
   */
  static renderDemoPattern(canvas, opts = {}) {
    const {
      shape    = 'circle',
      cols     = 28,
      rows     = 38,
      color1   = '#1A1A2E',
      color2   = '#845EC2',
      color3   = '#00C9A7',
      colorMode= 'single',
      bgColor  = '#FFFFFF',
    } = opts;

    const ctx   = canvas.getContext('2d');
    const W     = canvas.width;
    const H     = canvas.height;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const cellW = W / cols;
    const cellH = H / rows;
    const dotR  = Math.min(cellW, cellH) * 0.38;

    // Generate a heart-shaped gradient as fake image
    const cx = cols / 2, cy = rows / 2;
    const maxDist = Math.sqrt(cx*cx + cy*cy);

    const gen = new DotPatternGenerator();
    gen.options.colorMode = colorMode;
    gen.options.colors    = [color1, color2, color3];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Radial gradient brightness
        const dx = (c - cx) / cx;
        const dy = (r - cy) / cy;
        // Heart function: (x²+y²-1)³ - x²y³ < 0 is inside heart
        const heartVal = Math.pow(dx*dx + dy*dy - 1, 3) - dx*dx * Math.pow(dy, 3);
        const lum = heartVal < 0 ? 30 + Math.abs(heartVal) * 80 : 200;

        const color = gen._luminanceToColor(Math.min(255, lum));
        ctx.fillStyle = color;

        const sx = (c + 0.5) * cellW;
        const sy = (r + 0.5) * cellH;
        gen._canvasShape(ctx, shape, sx, sy, dotR);
      }
    }
  }
}

// Expose globally
window.DotPatternGenerator = DotPatternGenerator;
