/* ══════════════════════════════════════════════════════════════
   DOTS FOR LOVE – Gratis-Gruß-Generator
   (Geburtstagswunsch & Jahrestagsgruß)

   Erzeugt Dot-Art-Bilder in HANDY-Auflösung — bewusst nicht
   druckbar (max. 1080px Breite + eingebranntes Branding).
   Nutzt DotPatternGenerator aus configurator.js.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /** Ausgabeformate: bewusst nur Handy-Auflösung (nicht druckfähig) */
  const FORMATS = {
    wallpaper: { w: 1080, h: 2340, label: 'Handy-Hintergrund' },
    square:    { w: 1080, h: 1080, label: 'Zum Teilen (quadratisch)' },
  };

  /** Farbwelten je Anlass */
  const PRESETS = {
    birthday: {
      title: 'Dein persönlicher <em>Geburtstagswunsch</em>',
      sub: 'Verwandle ein Foto in einen Gruß aus hunderten Punkten – kostenlos verschicken!',
      colors: ['#E8495A', '#F9B233', '#845EC2'],
      bg: '#1A1A2E',
    },
    anniversary: {
      title: 'Euer <em>Jahrestagsgruß</em>',
      sub: 'Schicke deiner Liebsten oder deinem Liebsten ein Kunstwerk eurer gemeinsamen Zeit.',
      colors: ['#E8495A', '#845EC2', '#00C9A7'],
      bg: '#1A1A2E',
    },
  };

  const state = {
    occasion: 'birthday',
    format: 'wallpaper',
    shape: 'heart',
    numDots: 1800,
    gen: null,
    hasImage: false,
    lastGreetingId: null,
  };

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (!window.DotPatternGenerator) return;
    state.gen = new DotPatternGenerator();
    applyPreset();

    // Anlass-Umschalter
    document.querySelectorAll('.occasion-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.occasion-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.occasion = btn.dataset.occasion;
        applyPreset();
        rerender();
      });
    });

    // Upload
    const input = $('greetImageInput');
    const zone = $('greetUploadZone');
    input?.addEventListener('change', () => input.files[0] && loadFile(input.files[0]));
    zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone?.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]);
    });

    // Form (Symbol)
    document.querySelectorAll('.greet-shape').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.greet-shape').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.shape = btn.dataset.shape;
        rerender();
      });
    });

    // Format
    document.querySelectorAll('.greet-format').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.greet-format').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.format = btn.dataset.format;
        rerender();
      });
    });

    // Aktionen
    $('greetDownload')?.addEventListener('click', download);
    $('greetSendForm')?.addEventListener('submit', sendByMail);
    $('greetReminderForm')?.addEventListener('submit', createReminder);

    // Rechtsklick auf Vorschau unterbinden
    $('greetCanvas')?.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function applyPreset() {
    const p = PRESETS[state.occasion];
    state.gen.options.colorMode = 'triple';
    state.gen.options.colors = [...p.colors];
    state.gen.options.bgColor = p.bg;
    const titleEl = $('greetTitle');
    const subEl = $('greetSub');
    if (titleEl) titleEl.innerHTML = p.title;
    if (subEl) subEl.textContent = p.sub;
  }

  async function loadFile(file) {
    try {
      await state.gen.loadImageFromFile(file);
      state.hasImage = true;
      $('greetUploadZone')?.classList.add('has-image');
      const label = $('greetUploadLabel');
      if (label) label.textContent = `✓ ${file.name}`;
      rerender();
    } catch (err) {
      alert('Bild konnte nicht geladen werden: ' + err.message);
    }
  }

  /** Rendert das Bild in Handy-Auflösung inkl. Branding-Leiste. */
  function rerender() {
    if (!state.hasImage) return;
    const canvas = $('greetCanvas');
    if (!canvas) return;

    const fmt = FORMATS[state.format];
    canvas.width = fmt.w;
    canvas.height = fmt.h;

    const gen = state.gen;
    const ctx = canvas.getContext('2d');

    const FOOTER_H = 96; // Branding-Leiste (eingebrannt)
    const artH = fmt.h - FOOTER_H;

    // Hintergrund
    ctx.fillStyle = gen.options.bgColor;
    ctx.fillRect(0, 0, fmt.w, fmt.h);

    // Raster passend zum Seitenverhältnis
    const aspect = fmt.w / artH;
    const cols = Math.round(Math.sqrt(state.numDots * aspect));
    const rows = Math.ceil(state.numDots / cols);
    const cellW = fmt.w / cols;
    const cellH = artH / rows;
    const dotR = Math.min(cellW, cellH) * 0.40;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lum = gen.sampleLuminance(col / cols, row / rows);
        ctx.fillStyle = gen._luminanceToColor(lum);
        const cx = (col + 0.5) * cellW;
        const cy = (row + 0.5) * cellH;
        gen._canvasShape(ctx, state.shape, cx, cy, dotR);
      }
    }

    // Branding-Leiste (Teil des Bildes → viral & druck-abschreckend)
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, artH, fmt.w, FOOTER_H);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 34px "DM Sans", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const claim = state.occasion === 'birthday'
      ? '♥ dots-for-love.com · Verschicke Liebe in Punkten'
      : '♥ dots-for-love.com · Eure Zeit in Punkten';
    ctx.globalAlpha = 0.85;
    ctx.fillText(claim, fmt.w / 2, artH + FOOTER_H / 2);
    ctx.globalAlpha = 1;

    $('greetActions')?.classList.add('visible');
    state.lastGreetingId = null; // neue Version → neuer Upload nötig
  }

  function download() {
    if (!requireImage()) return;
    const canvas = $('greetCanvas');
    const a = document.createElement('a');
    a.download = `dots-for-love-${state.occasion === 'birthday' ? 'geburtstag' : 'jahrestag'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function hubUrl() {
    return (window.DotsForLoveFulfillmentUrl || '').replace(/\/$/, '');
  }

  /** Bild einmalig zum Hub hochladen, ID wiederverwenden. */
  async function uploadGreeting(senderName) {
    if (state.lastGreetingId) return state.lastGreetingId;
    const res = await fetch(hubUrl() + '/api/greetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: $('greetCanvas').toDataURL('image/png'),
        occasion: state.occasion,
        senderName: senderName || '',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload fehlgeschlagen');
    state.lastGreetingId = json.greetingId;
    return json.greetingId;
  }

  async function sendByMail(e) {
    e.preventDefault();
    if (!requireImage()) return;
    if (!hubUrl()) return alert('Der E-Mail-Versand ist nur im Online-Shop verfügbar.');

    const btn = $('greetSendBtn');
    const recipientEmail = $('greetRecipient').value.trim();
    const senderName = $('greetSenderName').value.trim();
    const message = $('greetMessage').value.trim();

    btn.disabled = true;
    btn.textContent = 'Wird verschickt…';
    try {
      // Upload + Versand in einem Request
      const res = await fetch(hubUrl() + '/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: $('greetCanvas').toDataURL('image/png'),
          occasion: state.occasion,
          senderName, recipientEmail, message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Versand fehlgeschlagen');
      state.lastGreetingId = json.greetingId;
      $('greetSendSuccess').hidden = false;
      e.target.reset();
    } catch (err) {
      alert('Fehler: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gruß verschicken 💌';
    }
  }

  async function createReminder(e) {
    e.preventDefault();
    if (!hubUrl()) return alert('Die Erinnerung ist nur im Online-Shop verfügbar.');

    const btn = $('greetReminderBtn');
    const email = $('greetReminderEmail').value.trim();
    const dateVal = $('greetReminderDate').value; // yyyy-mm-dd
    const consent = $('greetReminderConsent').checked;
    if (!dateVal) return alert('Bitte ein Datum wählen.');

    const [, month, day] = dateVal.split('-').map(Number);

    btn.disabled = true;
    btn.textContent = 'Wird eingerichtet…';
    try {
      let greetingId = null;
      if (state.hasImage) {
        // Gratisbild mitspeichern → wird an die Erinnerungs-Mails angehängt
        try { greetingId = await uploadGreeting(''); } catch { /* optional */ }
      }
      const res = await fetch(hubUrl() + '/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, occasion: state.occasion, month, day, greetingId, consent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler');
      $('greetReminderSuccess').hidden = false;
      e.target.reset();
    } catch (err) {
      alert('Fehler: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Erinnere mich 🔔';
    }
  }

  function requireImage() {
    if (!state.hasImage) {
      alert('Bitte zuerst ein Foto hochladen.');
      return false;
    }
    return true;
  }
})();
