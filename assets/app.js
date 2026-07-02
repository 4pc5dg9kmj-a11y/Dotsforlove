/**
 * Dots for Love – Application Controller
 * ========================================
 * Handles UI interactions for both the landing page (index.html)
 * and the configurator page (configurator.html).
 * Also provides Shopify cart integration helpers.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   SHARED UTILITIES
   ══════════════════════════════════════════════════════════════ */

/** Debounce – delay fn by ms after last call */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Scroll-based header class toggle */
function initScrollHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/** FAQ accordion keyboard support */
function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        q.closest('details').toggleAttribute('open');
      }
    });
  });
}

/** Years → Days calculator (landing page) */
function initYearsCalculator() {
  const input   = document.getElementById('yearsInput');
  const result  = document.getElementById('yearsResult');
  const display = document.getElementById('yearsDaysCount');
  if (!input || !result) return;

  const gen = new DotPatternGenerator();
  const update = () => {
    const years = Math.max(1, Math.min(100, parseInt(input.value) || 1));
    const days  = gen.yearsToTotalDays(years);
    result.textContent  = `${days.toLocaleString('de-DE')} Tage`;
    if (display) display.textContent = days.toLocaleString('de-DE');
  };
  input.addEventListener('input', update);
  update();
}

/** Smooth scroll for anchor links */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/** Mobile nav toggle */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav    = document.querySelector('.main-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('nav-open', !open);
  });
}

/* ══════════════════════════════════════════════════════════════
   LANDING PAGE – HERO & DEMO
   ══════════════════════════════════════════════════════════════ */

function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  DotPatternGenerator.renderDecorativeDots(canvas, {
    dotColor:  '#845EC2',
    dotColor2: '#E8495A',
    dotColor3: '#00C9A7',
    dotCount:  180,
    speed:     0.3,
    animate:   true,
  });
}

function initCTACanvas() {
  const canvas = document.getElementById('ctaCanvas');
  if (!canvas) return;

  DotPatternGenerator.renderDecorativeDots(canvas, {
    dotColor:  '#FFFFFF',
    dotColor2: '#f7b3bb',
    dotColor3: '#b8a3e0',
    dotCount:  100,
    speed:     0.2,
    animate:   true,
  });
}

function initYearsCanvas() {
  const canvas = document.getElementById('yearsCanvas');
  if (!canvas) return;

  DotPatternGenerator.renderDemoPattern(canvas, {
    shape:     'circle',
    cols:      22,
    rows:      22,
    color1:    '#FFFFFF',
    color2:    '#b8a3e0',
    color3:    '#845EC2',
    colorMode: 'triple',
    bgColor:   '#1A1A2E',
  });
}

function initDemoCanvas() {
  const canvas = document.getElementById('demoCanvas');
  if (!canvas) return;

  let currentShape = 'circle';

  function renderDemo(shape) {
    DotPatternGenerator.renderDemoPattern(canvas, {
      shape,
      cols:      24,
      rows:      32,
      color1:    '#1A1A2E',
      color2:    '#845EC2',
      color3:    '#E8495A',
      colorMode: 'triple',
      bgColor:   '#FFFFFF',
    });
  }

  renderDemo(currentShape);

  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      renderDemo(currentShape);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   CONFIGURATOR PAGE
   ══════════════════════════════════════════════════════════════ */

function initConfigurator() {
  const gen = new DotPatternGenerator();

  // ── DOM Refs ──────────────────────────────────────
  const uploadZone       = document.getElementById('uploadZone');
  const imageInput       = document.getElementById('imageInput');
  const uploadPreview    = document.getElementById('uploadPreview');
  const uploadedImage    = document.getElementById('uploadedImage');
  const uploadRemove     = document.getElementById('uploadRemove');
  const uploadZoneInner  = document.getElementById('uploadZoneInner');

  const shapeOpts        = document.querySelectorAll('.shape-opt');
  const cmodeBtns        = document.querySelectorAll('.cmode-btn');
  const colorRow2        = document.getElementById('colorRow2');
  const colorRow3        = document.getElementById('colorRow3');
  const color1Input      = document.getElementById('color1');
  const color2Input      = document.getElementById('color2');
  const color3Input      = document.getElementById('color3');
  const colorSwatch1     = document.getElementById('colorSwatch1');
  const colorSwatch2     = document.getElementById('colorSwatch2');
  const colorSwatch3     = document.getElementById('colorSwatch3');
  const bgColorInput     = document.getElementById('bgColor');
  const bgColorSwatch    = document.getElementById('bgColorSwatch');
  const color1Label      = document.getElementById('color1Label');

  const dotsModeBtns     = document.querySelectorAll('.dots-mode-btn');
  const modeManual       = document.getElementById('mode-manual');
  const modeYears        = document.getElementById('mode-years');
  const modeDaterange    = document.getElementById('mode-daterange');

  const dotsCountRange   = document.getElementById('dotsCountRange');
  const dotsCountInput   = document.getElementById('dotsCount');
  const presetChips      = document.querySelectorAll('.chip');

  const yearsInputConf   = document.getElementById('yearsInputConf');
  const yearsResultConf  = document.getElementById('yearsResultConf');

  const dateStart        = document.getElementById('dateStart');
  const dateEnd          = document.getElementById('dateEnd');
  const dateResult       = document.getElementById('dateResult');

  const sizeOpts         = document.querySelectorAll('.size-opt');
  const orientBtns       = document.querySelectorAll('.orient-btn');

  const generateBtn      = document.getElementById('generateBtn');
  const previewCanvas    = document.getElementById('previewCanvas');
  const previewEmpty     = document.getElementById('previewEmpty');
  const previewWrapper   = document.getElementById('previewWrapper');
  const previewLoading   = document.getElementById('previewLoading');
  const loadingProgress  = document.getElementById('loadingProgress');
  const purchaseBar      = document.getElementById('purchaseBar');
  const previewInfo      = document.getElementById('previewInfo');

  const purchaseSizeLabel  = document.getElementById('purchaseSizeLabel');
  const purchaseDotsLabel  = document.getElementById('purchaseDotsLabel');
  const purchasePriceEl    = document.getElementById('purchasePrice');

  const previewDownloadBtn = document.getElementById('previewDownloadBtn');
  const addToCartBtn       = document.getElementById('addToCartBtn');
  const zoomInBtn          = document.getElementById('zoomIn');
  const zoomOutBtn         = document.getElementById('zoomOut');
  const zoomLevelEl        = document.getElementById('zoomLevel');

  const cartModal          = document.getElementById('cartModal');
  const cartModalClose     = document.getElementById('cartModalClose');
  const continueShopping   = document.getElementById('continueShopping');

  const hSteps             = document.querySelectorAll('.hstep');

  if (!generateBtn) return; // Not on configurator page

  // ── State ─────────────────────────────────────────
  let isGenerating = false;
  let zoomFactor   = 1;
  let dotsMode     = 'manual'; // manual | years | daterange
  let imageLoaded  = false;

  // ── Header step indicator ─────────────────────────
  function updateHeaderSteps() {
    const steps = ['upload', 'style', 'dots', 'size'];
    steps.forEach((_, i) => {
      const el = hSteps[i];
      if (!el) return;
      if (i < steps.length - 1) el.classList.add('done');
    });
  }

  // ── Upload ────────────────────────────────────────
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Bitte eine Bilddatei (JPG, PNG oder WEBP) hochladen.');
      return;
    }
    const url = URL.createObjectURL(file);
    uploadedImage.src = url;
    uploadZoneInner.hidden = true;
    uploadPreview.hidden   = false;
    imageLoaded = true;
    hSteps[0]?.classList.add('done', 'active');
    hSteps[1]?.classList.add('active');

    gen.loadImageFromFile(file).then(() => {
      console.log('Image loaded into generator');
    }).catch(err => {
      console.error('Image load error:', err);
    });
  }

  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  });
  imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) handleImageFile(imageInput.files[0]);
  });
  uploadRemove.addEventListener('click', () => {
    uploadPreview.hidden   = true;
    uploadZoneInner.hidden = false;
    imageInput.value       = '';
    imageLoaded            = false;
    gen.imageData          = null;
    uploadedImage.src      = '';
    // Hide preview
    previewWrapper.hidden  = true;
    previewEmpty.hidden    = false;
    purchaseBar.hidden     = true;
    hSteps[0]?.classList.remove('done');
  });

  // ── Shape selector ────────────────────────────────
  shapeOpts.forEach(btn => {
    btn.addEventListener('click', () => {
      shapeOpts.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      gen.options.shape = btn.dataset.shape;
    });
  });

  // ── Color mode ────────────────────────────────────
  function updateColorMode(mode) {
    gen.options.colorMode = mode;
    const isTriple = mode === 'triple';
    colorRow2.classList.toggle('hidden', !isTriple);
    colorRow3.classList.toggle('hidden', !isTriple);
    color1Label.textContent = isTriple ? 'Farbe 1 (Schatten)' : 'Farbe';
    cmodeBtns.forEach(b => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
  }
  cmodeBtns.forEach(btn => {
    btn.addEventListener('click', () => updateColorMode(btn.dataset.mode));
  });

  // ── Color pickers ─────────────────────────────────
  function syncColorSwatch(input, swatch, index) {
    input.addEventListener('input', () => {
      swatch.style.background = input.value;
      gen.options.colors[index] = input.value;
    });
    // Show native picker when swatch area clicked
    swatch.addEventListener('click', () => input.click());
  }
  syncColorSwatch(color1Input, colorSwatch1, 0);
  syncColorSwatch(color2Input, colorSwatch2, 1);
  syncColorSwatch(color3Input, colorSwatch3, 2);
  bgColorInput.addEventListener('input', () => {
    bgColorSwatch.style.background = bgColorInput.value;
    gen.options.bgColor = bgColorInput.value;
  });
  bgColorSwatch.addEventListener('click', () => bgColorInput.click());

  // ── Dots Mode ─────────────────────────────────────
  function switchDotsMode(mode) {
    dotsMode = mode;
    dotsModeBtns.forEach(b => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    modeManual.classList.toggle('active', mode === 'manual');
    modeYears.classList.toggle('active',  mode === 'years');
    modeDaterange.classList.toggle('active', mode === 'daterange');
  }
  dotsModeBtns.forEach(btn => {
    btn.addEventListener('click', () => switchDotsMode(btn.dataset.mode));
  });

  // ── Manual dots count ─────────────────────────────
  function setDotsCount(n) {
    n = Math.max(100, Math.min(20000, Math.round(n)));
    dotsCountInput.value = n;
    dotsCountRange.value = n;
    gen.options.numDots  = n;
    updatePreviewInfo();
  }
  dotsCountRange.addEventListener('input', () => setDotsCount(parseInt(dotsCountRange.value)));
  dotsCountInput.addEventListener('input', debounce(() => setDotsCount(parseInt(dotsCountInput.value) || 1000), 300));
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => setDotsCount(parseInt(chip.dataset.value)));
  });

  // ── Years mode ────────────────────────────────────
  function updateYearsMode() {
    const years = Math.max(1, Math.min(100, parseInt(yearsInputConf.value) || 1));
    const days  = gen.yearsToTotalDays(years);
    yearsResultConf.textContent = days.toLocaleString('de-DE');
    gen.options.numDots = days;
    updatePreviewInfo();
  }
  yearsInputConf.addEventListener('input', updateYearsMode);

  // ── Date range mode ───────────────────────────────
  function updateDateRangeMode() {
    const start = dateStart.value;
    const end   = dateEnd.value;
    if (start && end) {
      const days = gen.dateRangeToDays(start, end);
      dateResult.textContent  = days.toLocaleString('de-DE');
      gen.options.numDots = Math.max(1, days);
      updatePreviewInfo();
    }
  }
  dateStart.addEventListener('change', updateDateRangeMode);
  dateEnd.addEventListener('change',   updateDateRangeMode);

  // ── Size selector ─────────────────────────────────
  sizeOpts.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeOpts.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      gen.options.posterSize = btn.dataset.size;
      updatePreviewInfo();
    });
  });

  // ── Orientation ───────────────────────────────────
  orientBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      orientBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      gen.options.orientation = btn.dataset.orient;
      updatePreviewInfo();
    });
  });

  // ── Preview info bar ──────────────────────────────
  const SHAPE_LABELS = {
    circle:'Punkte', heart:'Herzen', square:'Quadrate', cross:'Kreuze', triangle:'Dreiecke',
  };
  function updatePreviewInfo() {
    const grid   = gen._calcGrid ? gen._calcGrid() : { totalDots: gen.options.numDots };
    const orient = gen.options.orientation === 'portrait' ? 'Hochformat' : 'Querformat';
    const shape  = SHAPE_LABELS[gen.options.shape] || gen.options.shape;
    if (previewInfo) {
      previewInfo.textContent = `${gen.options.posterSize} · ${orient} · ${(grid.totalDots || gen.options.numDots).toLocaleString('de-DE')} ${shape}`;
    }
  }
  updatePreviewInfo();

  // ── Zoom ──────────────────────────────────────────
  function applyZoom() {
    const wrapper = previewWrapper;
    if (!wrapper.hidden) {
      wrapper.style.transform = `scale(${zoomFactor})`;
      wrapper.style.transformOrigin = 'center center';
    }
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(zoomFactor * 100) + '%';
  }
  zoomInBtn?.addEventListener('click',  () => { zoomFactor = Math.min(3, zoomFactor + 0.25); applyZoom(); });
  zoomOutBtn?.addEventListener('click', () => { zoomFactor = Math.max(0.25, zoomFactor - 0.25); applyZoom(); });

  // ── Generate preview ──────────────────────────────
  generateBtn.addEventListener('click', async () => {
    if (isGenerating) return;

    // Get current numDots from active mode
    if (dotsMode === 'years')     updateYearsMode();
    if (dotsMode === 'daterange') updateDateRangeMode();
    if (dotsMode === 'manual')    setDotsCount(parseInt(dotsCountInput.value) || 2000);

    if (!gen.imageData) {
      alert('Bitte zuerst ein Foto hochladen.');
      return;
    }

    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generiere…';

    // Show loading
    previewEmpty.hidden   = true;
    previewWrapper.hidden = true;
    previewLoading.hidden = false;
    purchaseBar.hidden    = true;

    // Size canvas to poster aspect ratio
    const { w: svgW, h: svgH } = gen._getPosterDimensions();
    const maxDim  = 800;
    const scale   = Math.min(maxDim / svgW, maxDim / svgH);
    previewCanvas.width  = Math.round(svgW * scale);
    previewCanvas.height = Math.round(svgH * scale);

    if (loadingProgress) loadingProgress.textContent = 'Analysiere Bild…';

    // Run generator in next frame to allow UI to update
    await new Promise(r => setTimeout(r, 50));

    if (loadingProgress) loadingProgress.textContent = 'Zeichne Muster…';

    try {
      gen.renderPreview(previewCanvas, (progress) => {
        if (loadingProgress) loadingProgress.textContent = `${Math.round(progress * 100)}% fertig…`;
      });

      // Disable right-click on canvas (copy protection)
      previewCanvas.addEventListener('contextmenu', e => e.preventDefault());

      previewLoading.hidden = false;
      await new Promise(r => setTimeout(r, 30)); // show 100%

      previewLoading.hidden = true;
      previewWrapper.hidden = false;

      // Update purchase bar
      const grid = gen._calcGrid();
      if (purchaseSizeLabel) purchaseSizeLabel.textContent = `${gen.options.posterSize} Poster`;
      if (purchaseDotsLabel) purchaseDotsLabel.textContent = `${grid.totalDots.toLocaleString('de-DE')} ${SHAPE_LABELS[gen.options.shape]}`;
      if (purchasePriceEl)  purchasePriceEl.textContent = `${gen.getPrice().toFixed(2).replace('.', ',')} €`;
      purchaseBar.hidden = false;
      updateHeaderSteps();
      updatePreviewInfo();

      // Reset zoom
      zoomFactor = 1;
      applyZoom();
    } catch (err) {
      console.error('Generation error:', err);
      previewLoading.hidden = true;
      previewEmpty.hidden   = false;
      alert('Fehler beim Generieren: ' + err.message);
    } finally {
      isGenerating = false;
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2v16M2 10h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" opacity=".4"/></svg> Vorschau neu generieren`;
    }
  });

  // ── Preview download (SVG with watermark) ─────────
  previewDownloadBtn?.addEventListener('click', () => {
    if (!gen._lastSVG && !gen.imageData) {
      alert('Bitte zuerst eine Vorschau generieren.');
      return;
    }
    if (!gen._lastSVG) gen.generateSVG();
    gen.downloadPreviewSVG();
  });

  // ── Add to cart ───────────────────────────────────
  addToCartBtn?.addEventListener('click', () => {
    if (!gen.imageData) {
      alert('Bitte zuerst ein Foto hochladen und eine Vorschau generieren.');
      return;
    }
    // Generate final SVG (takes a moment for large dot counts)
    const loadingMsg = 'Finalizing your poster…';
    addToCartBtn.disabled    = true;
    addToCartBtn.textContent = 'Vorbereitung…';

    setTimeout(() => {
      gen.generateSVG();
      addShopifyToCart(gen).then(() => {
        addToCartBtn.disabled    = false;
        addToCartBtn.textContent = 'In den Warenkorb →';
        if (cartModal) cartModal.hidden = false;
      }).catch(err => {
        console.error('Cart error:', err);
        addToCartBtn.disabled    = false;
        addToCartBtn.textContent = 'In den Warenkorb →';
        alert('Fehler beim Hinzufügen zum Warenkorb: ' + err.message);
      });
    }, 100);
  });

  // ── Modal controls ────────────────────────────────
  cartModalClose?.addEventListener('click',  () => { if (cartModal) cartModal.hidden = true; });
  continueShopping?.addEventListener('click',() => { if (cartModal) cartModal.hidden = true; });
  cartModal?.addEventListener('click', e => {
    if (e.target === cartModal) cartModal.hidden = true;
  });

  // ── URL parameter pre-fill ───────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const sizeParam = urlParams.get('size');
  if (sizeParam) {
    const sizeBtn = document.querySelector(`.size-opt[data-size="${sizeParam}"]`);
    if (sizeBtn) {
      sizeOpts.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
      sizeBtn.classList.add('active');
      sizeBtn.setAttribute('aria-checked','true');
      gen.options.posterSize = sizeParam;
      updatePreviewInfo();
    }
  }

  // Set today as default end date
  if (dateEnd) dateEnd.valueAsDate = new Date();
  if (dateStart) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    dateStart.valueAsDate = d;
  }

  console.log('Configurator initialized');
}

/* ══════════════════════════════════════════════════════════════
   SHOPIFY INTEGRATION
   ══════════════════════════════════════════════════════════════ */

/**
 * Add product to Shopify cart with customisation properties.
 * The SVG data is stored as a cart note / line item property so it
 * can be retrieved by the fulfillment workflow.
 *
 * In a real Shopify setup:
 *  1. Replace SHOPIFY_VARIANT_ID with the actual variant ID per size.
 *  2. The server-side app reads _svgData from order properties and
 *     sends the final SVG to the customer's email.
 */
async function addShopifyToCart(gen) {
  // Map poster sizes to Shopify variant IDs.
  // Primär aus dem Theme (theme.liquid injiziert window.DotsForLoveVariants),
  // Fallback: die echten Varianten-IDs des Stores dotsforlove.myshopify.com.
  const FALLBACK_VARIANT_IDS = {
    'A4':     '62388082377034',
    'A3':     '62388082409802',
    '50x70':  '62388082442570',
    '70x100': '62388082475338',
  };
  const themeIds = window.DotsForLoveVariants || {};
  const variantId = themeIds[gen.options.posterSize] || FALLBACK_VARIANT_IDS[gen.options.posterSize];

  if (!variantId) {
    throw new Error(
      `Für die Größe ${gen.options.posterSize} ist kein Shopify-Produkt hinterlegt. ` +
      'Bitte eine andere Größe wählen.'
    );
  }

  // Prepare line item properties
  const props = gen.getShopifyLineItemProperties();

  // Finales SVG an den Fulfillment-Hub hochladen und die Design-ID
  // in der Bestellung speichern — damit kann die Bestellung später
  // vollautomatisch gedruckt werden (Gelato oder Heimdruck).
  const hubUrl = (window.DotsForLoveFulfillmentUrl || '').replace(/\/$/, '');
  if (hubUrl && gen._lastSVG) {
    const uploadRes = await fetch(hubUrl + '/api/designs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        svg:  gen._lastSVG,
        meta: {
          size:        gen.options.posterSize,
          orientation: gen.options.orientation,
          shape:       gen.options.shape,
          numDots:     gen.options.numDots,
        },
      }),
    });
    if (!uploadRes.ok) {
      throw new Error('Design-Upload fehlgeschlagen — bitte erneut versuchen.');
    }
    const { designId } = await uploadRes.json();
    props['_design_id'] = designId;
  } else if (!hubUrl) {
    console.warn('DotsForLoveFulfillmentUrl nicht gesetzt — Bestellung ohne Design-ID (kein Auto-Fulfillment möglich).');
  }

  const cartData = {
    items: [{
      id:         variantId,
      quantity:   1,
      properties: props,
    }],
  };

  // If we're in a real Shopify context, use the AJAX Cart API
  if (window.Shopify) {
    const response = await fetch('/cart/add.js', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body:    JSON.stringify(cartData),
    });
    if (!response.ok) throw new Error(`Cart API error: ${response.status}`);
    return response.json();
  }

  // Development: simulate success
  console.log('Shopify cart data (development mode):', cartData);
  return Promise.resolve({ success: true, dev: true });
}

/**
 * Shopify checkout redirect helper.
 * Reads cart and redirects to checkout (used by the "Go to checkout" button).
 */
function goToShopifyCheckout() {
  if (window.Shopify) {
    window.location.href = '/checkout';
  } else {
    alert('Shopify-Integration erforderlich. Bitte im Shopify-Store verwenden.');
  }
}

// Attach checkout button
document.getElementById('goToCheckout')?.addEventListener('click', e => {
  e.preventDefault();
  goToShopifyCheckout();
});

/* ══════════════════════════════════════════════════════════════
   ANIMATION / INTERSECTION OBSERVER
   ══════════════════════════════════════════════════════════════ */

function initScrollAnimations() {
  if (!window.IntersectionObserver) return;
  const targets = document.querySelectorAll('.step-card, .feature-card, .product-card, .faq-item');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(el => io.observe(el));
}

/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initScrollHeader();
  initSmoothScroll();
  initMobileNav();
  initFAQ();
  initScrollAnimations();

  // Landing page
  if (document.getElementById('heroCanvas'))    initHeroCanvas();
  if (document.getElementById('demoCanvas'))    initDemoCanvas();
  if (document.getElementById('yearsCanvas'))   initYearsCanvas();
  if (document.getElementById('ctaCanvas'))     initCTACanvas();
  if (document.getElementById('yearsInput'))    initYearsCalculator();

  // Configurator page
  if (document.getElementById('generateBtn'))   initConfigurator();
});
