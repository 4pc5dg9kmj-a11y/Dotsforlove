/* ══════════════════════════════════════════════════════════════
   DOTS FOR LOVE – Gratis-Gruß-Generator
   (Geburtstagswunsch & Jahrestagsgruß)

   Flow (DSGVO-sauber):
   • KEIN Download — das Bild wird ausschließlich per E-Mail
     versendet (transaktional, Häkchen 1 erforderlich).
   • Erinnerungs-/Werbe-Mails nur über separates, NICHT voran-
     gekreuztes Opt-in (Häkchen 2) mit Double-Opt-In-Bestätigung.
   • Print direkt mitbestellbar: Format wählen → Preis sofort →
     Warenkorb (gleiches Produkt wie im Konfigurator).

   Nutzt DotPatternGenerator aus configurator.js.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /** Ausgabeformate: bewusst nur Handy-Auflösung (nicht druckfähig) */
  const FORMATS = {
    wallpaper: { w: 1080, h: 2340, label: 'Handy-Hintergrund' },
    square:    { w: 1080, h: 1080, label: 'Zum Teilen (quadratisch)' },
  };

  /** Druckformate: Reihenfolge = Anzeige; IDs = Shopify-Varianten-Keys */
  const PRINT_SIZES = ['A4', 'A3', '50x70', '70x100'];
  const PRINT_DIMS = {
    'A4': '21 × 29,7 cm', 'A3': '29,7 × 42 cm',
    '50x70': '50 × 70 cm', '70x100': '70 × 100 cm',
  };
  const FALLBACK_VARIANT_IDS = {
    'A4': '62388082377034', 'A3': '62388082409802',
    '50x70': '62388082442570', '70x100': '62388082475338',
  };

  /** Farbwelten je Anlass */
  const PRESETS = {
    birthday: {
      title: 'Dein persönlicher <em>Geburtstagswunsch</em>',
      sub: 'Verwandle ein Foto in einen Gruß aus hunderten Punkten – wir senden ihn dir kostenlos per E-Mail!',
      colors: ['#E8495A', '#F9B233', '#845EC2'],
      bg: '#1A1A2E',
    },
    anniversary: {
      title: 'Euer <em>Jahrestagsgruß</em>',
      sub: 'Ein Kunstwerk eurer gemeinsamen Zeit – kostenlos an deine E-Mail, zum Weiterschicken an deinen Lieblingsmenschen.',
      colors: ['#E8495A', '#845EC2', '#00C9A7'],
      bg: '#1A1A2E',
    },
  };

  const state = {
    occasion: 'birthday',
    format: 'wallpaper',
    shape: 'heart',
    numDots: 1800,
    printSize: 'A3',
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
        document.querySelectorAll('.occasion-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
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

    // Symbol
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

    // E-Mail-Versand-Formular
    $('greetSendForm')?.addEventListener('submit', sendByMail);

    // Häkchen 2 (Marketing-Opt-in) → Datumsfeld ein-/ausblenden
    const optIn = $('greetMarketingOptIn');
    optIn?.addEventListener('change', () => {
      const wrap = $('greetDateWrap');
      if (wrap) wrap.hidden = !optIn.checked;
      const dateInput = $('greetReminderDate');
      if (dateInput) dateInput.required = optIn.checked;
    });

    // Druckformat-Auswahl
    document.querySelectorAll('.greet-print-size').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.greet-print-size').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.printSize = btn.dataset.size;
        updatePrintPrice();
      });
    });
    $('greetPrintBtn')?.addEventListener('click', orderPrint);
    updatePrintPrice();

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

    ctx.fillStyle = gen.options.bgColor;
    ctx.fillRect(0, 0, fmt.w, fmt.h);

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

  function hubUrl() {
    return (window.DotsForLoveFulfillmentUrl || '').replace(/\/$/, '');
  }

  /* ── E-Mail-Versand (transaktional) + optionales Opt-in ──── */
  async function sendByMail(e) {
    e.preventDefault();
    if (!requireImage()) return;
    if (!hubUrl()) return alert('Der E-Mail-Versand ist nur im Online-Shop verfügbar.');

    const email = $('greetEmail').value.trim();
    const consentTransactional = $('greetSendConsent').checked;
    const marketingOptIn = $('greetMarketingOptIn').checked;
    const dateVal = $('greetReminderDate')?.value || '';

    // Häkchen 1 ist Pflicht — ohne Zustimmung kein Versand
    if (!consentTransactional) {
      alert('Bitte bestätige, dass wir dir dein Bild an diese E-Mail senden dürfen.');
      return;
    }
    if (marketingOptIn && !dateVal) {
      alert('Bitte wähle das Datum, an das wir dich erinnern sollen.');
      return;
    }

    const btn = $('greetSendBtn');
    btn.disabled = true;
    btn.textContent = 'Wird gesendet…';
    try {
      // 1. Bild transaktional an die eigene Adresse senden
      const res = await fetch(hubUrl() + '/api/greetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: $('greetCanvas').toDataURL('image/png'),
          occasion: state.occasion,
          email,
          consentTransactional: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Versand fehlgeschlagen');
      state.lastGreetingId = json.greetingId;

      // 2. Nur bei aktivem Häkchen 2: Erinnerung anlegen (Double-Opt-In folgt per Mail)
      let reminderCreated = false;
      if (marketingOptIn) {
        const [year, month, day] = dateVal.split('-').map(Number);
        const r = await fetch(hubUrl() + '/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            occasion: state.occasion,
            year, month, day,
            greetingId: state.lastGreetingId,
            consent: true,
          }),
        });
        reminderCreated = r.ok;
      }

      const success = $('greetSendSuccess');
      if (success) {
        success.textContent = reminderCreated
          ? 'Dein Bild ist unterwegs! 📬 Für die Erinnerung: bitte den Bestätigungslink in deinem Postfach anklicken.'
          : 'Dein Bild ist unterwegs! 📬 Schau in dein Postfach.';
        success.hidden = false;
      }
    } catch (err) {
      alert('Fehler: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Bild an mich senden 💌';
    }
  }

  /* ── Print direkt mitbestellen ────────────────────────────── */

  function getPrice(size) {
    // Shopify-Section injiziert Live-Preise; Fallback: Generator-Preisliste
    const injected = window.DotsForLovePrices || {};
    if (injected[size]) return parseFloat(injected[size]);
    return state.gen ? (state.gen.PRICES[size] || 0) : 0;
  }

  function updatePrintPrice() {
    const el = $('greetPrintPrice');
    if (!el) return;
    const price = getPrice(state.printSize);
    el.textContent = price
      ? price.toFixed(2).replace('.', ',') + ' €'
      : '–';
  }

  async function orderPrint() {
    if (!requireImage()) return;
    const btn = $('greetPrintBtn');
    btn.disabled = true;
    btn.textContent = 'Wird vorbereitet…';
    try {
      const gen = state.gen;
      gen.options.posterSize = state.printSize;
      gen.options.shape = state.shape;
      gen._lastSVG = null;
      const svg = gen.generateSVG();

      const props = gen.getShopifyLineItemProperties();

      // Druckdesign zum Hub hochladen → _design_id für Auto-Fulfillment
      if (hubUrl() && svg) {
        const up = await fetch(hubUrl() + '/api/designs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            svg,
            meta: {
              size: state.printSize,
              orientation: gen.options.orientation,
              shape: state.shape,
              source: 'gratis-generator',
            },
          }),
        });
        if (up.ok) {
          const { designId } = await up.json();
          props['_design_id'] = designId;
        }
      }

      const themeIds = window.DotsForLoveVariants || {};
      const variantId = themeIds[state.printSize] || FALLBACK_VARIANT_IDS[state.printSize];
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
      btn.disabled = false;
      btn.textContent = 'Als Poster in den Warenkorb 🛒';
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
