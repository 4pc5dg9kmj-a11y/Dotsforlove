import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import {
  insertDesign, getDesign, getJob, getJobByToken, updateJob,
  pendingHomeJobs, openJobsForOrder, setOrderStatus, monthlyRevenue,
} from './db.js';
import { verifyWebhookHmac, fulfillOrder } from './shopify.js';
import { processPaidOrder, extractItemMeta } from './orders.js';
import { renderPng } from './render.js';
import { startEtsyPolling } from './etsy.js';
import { notify } from './notify.js';

const app = express();

/* ── CORS für Design-Uploads aus dem Shopify-Storefront ───── */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ── Shopify-Webhook braucht den ROHEN Body für die HMAC-Prüfung ── */
app.use('/webhooks', express.raw({ type: 'application/json', limit: '2mb' }));
app.use(express.json({ limit: '30mb' }));

const agentAuth = (req, res, next) => {
  const token = req.headers['x-agent-token'] || '';
  if (!config.homePrint.agentToken || token !== config.homePrint.agentToken) {
    return res.status(401).json({ error: 'Ungültiges Agent-Token' });
  }
  next();
};

/* ══════════════════════════════════════════════════════════
   1. DESIGN-UPLOAD (vom Konfigurator beim „In den Warenkorb")
   ══════════════════════════════════════════════════════════ */
app.post('/api/designs', (req, res) => {
  const { svg, meta } = req.body || {};
  if (!svg || typeof svg !== 'string') {
    return res.status(400).json({ error: 'Feld "svg" fehlt' });
  }
  const trimmed = svg.trimStart();
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<svg')) {
    return res.status(400).json({ error: 'Kein gültiges SVG' });
  }
  if (svg.length > 25 * 1024 * 1024) {
    return res.status(413).json({ error: 'SVG zu groß (max. 25 MB)' });
  }

  const id = crypto.randomUUID();
  const svgPath = path.join(config.dataDir, 'designs', `${id}.svg`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  insertDesign(id, svgPath, meta || {});

  res.json({ designId: id });
});

/* ══════════════════════════════════════════════════════════
   2. SHOPIFY-WEBHOOK: orders/paid → automatische Verarbeitung
   ══════════════════════════════════════════════════════════ */
app.post('/webhooks/shopify/orders-paid', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('HMAC invalid');
  }
  // Sofort bestätigen (Shopify-Timeout: 5s), dann asynchron verarbeiten
  res.sendStatus(200);

  try {
    const order = JSON.parse(req.body.toString('utf8'));
    const items = (order.line_items || []).map(extractItemMeta);
    const shippingAddress = {
      ...(order.shipping_address || {}),
      email: order.email || order.contact_email || '',
    };
    await processPaidOrder({
      id: String(order.id),
      source: 'shopify',
      orderNumber: order.name || `#${order.order_number}`,
      totalPrice: parseFloat(order.total_price || 0),
      shippingAddress,
      items,
    });
  } catch (err) {
    console.error('[webhook] Verarbeitung fehlgeschlagen:', err);
    await notify(`❌ Shopify-Webhook-Verarbeitung fehlgeschlagen: ${err.message}`);
  }
});

/* ══════════════════════════════════════════════════════════
   3. DRUCKDATEIEN (Gelato-Download + Print-Agent)
   ══════════════════════════════════════════════════════════ */
app.get('/api/print-files/:token.png', async (req, res) => {
  const job = getJobByToken(req.params.token);
  if (!job) return res.status(404).send('Not found');
  const design = getDesign(job.design_id);
  if (!design) return res.status(404).send('Design not found');
  try {
    const pngPath = await renderPng(design.id, design.svg_path, job.size);
    res.sendFile(pngPath);
  } catch (err) {
    console.error('[render]', err);
    res.status(500).send('Render error');
  }
});

app.get('/api/print-files/:token.svg', (req, res) => {
  const job = getJobByToken(req.params.token);
  if (!job) return res.status(404).send('Not found');
  const design = getDesign(job.design_id);
  if (!design) return res.status(404).send('Design not found');
  res.type('image/svg+xml').sendFile(design.svg_path);
});

/* ══════════════════════════════════════════════════════════
   4. HEIMDRUCK-QUEUE (Print-Agent API)
   ══════════════════════════════════════════════════════════ */
app.get('/api/print-queue', agentAuth, (req, res) => {
  const jobs = pendingHomeJobs().map(j => ({
    id: j.id,
    orderNumber: j.order_number,
    source: j.source,
    size: j.size,
    quantity: j.quantity,
    status: j.status,
    createdAt: j.created_at,
    pngUrl: `${config.publicUrl}/api/print-files/${j.file_token}.png`,
    svgUrl: `${config.publicUrl}/api/print-files/${j.file_token}.svg`,
  }));
  res.json({ jobs });
});

app.post('/api/print-queue/:id/claim', agentAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  if (job.status !== 'pending') {
    return res.status(409).json({ error: `Job hat Status ${job.status}` });
  }
  updateJob(job.id, { status: 'claimed' });
  res.json({ ok: true });
});

app.post('/api/print-queue/:id/complete', agentAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  updateJob(job.id, { status: 'done' });

  // Wenn alle Jobs der Bestellung fertig sind → Shopify-Bestellung erfüllen
  if (openJobsForOrder(job.order_id) === 0 && !job.order_id.startsWith('etsy:')) {
    try {
      await fulfillOrder(job.order_id);
      setOrderStatus(job.order_id, 'fulfilled');
      await notify(`✅ Bestellung ${job.order_id}: zuhause gedruckt & in Shopify als erfüllt markiert`);
    } catch (err) {
      await notify(`⚠️ Job ${job.id} gedruckt, aber Shopify-Fulfillment fehlgeschlagen: ${err.message}`);
    }
  }
  res.json({ ok: true });
});

app.post('/api/print-queue/:id/error', agentAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  updateJob(job.id, { status: 'error', error: String(req.body?.message || 'Agent-Fehler') });
  notify(`❌ Heimdruck-Job ${job.id} fehlgeschlagen: ${req.body?.message || '?'}`);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════
   5. NACHGEREICHTE DESIGNS (z.B. Etsy) & STATUS
   ══════════════════════════════════════════════════════════ */
app.post('/api/jobs/:id/attach-design', agentAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  const design = getDesign(req.body?.designId);
  if (!design) return res.status(400).json({ error: 'designId unbekannt' });

  const fileToken = crypto.randomBytes(24).toString('hex');
  updateJob(job.id, {
    design_id: design.id, status: 'pending',
    route: job.route === 'pending_design' ? 'home' : job.route,
    file_token: fileToken, error: null,
  });
  res.json({ ok: true, jobId: job.id });
});

app.get('/api/status', (req, res) => {
  const revenue = monthlyRevenue();
  res.json({
    monthlyRevenue: revenue,
    homePrintThreshold: config.homePrint.monthlyRevenueThreshold,
    homePrintActive: config.homePrint.enabled && revenue >= config.homePrint.monthlyRevenueThreshold,
    homePrintSizes: config.homePrint.sizes,
    etsyEnabled: config.etsy.enabled,
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

/* ══════════════════════════════════════════════════════════ */
app.listen(config.port, () => {
  console.log(`Dots for Love Fulfillment Hub läuft auf Port ${config.port}`);
  console.log(`Öffentliche URL: ${config.publicUrl}`);
  console.log(`Heimdruck: ${config.homePrint.enabled ? 'aktiv' : 'aus'} ` +
    `(Schwelle ${config.homePrint.monthlyRevenueThreshold} €, Größen: ${config.homePrint.sizes.join(', ')})`);
  startEtsyPolling();
});
