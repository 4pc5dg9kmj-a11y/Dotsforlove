import crypto from 'node:crypto';
import { config, normalizeSize, SKU_TO_SIZE } from './config.js';
import {
  upsertOrder, setOrderStatus, insertJob, updateJob, getDesign,
} from './db.js';
import { decideRoute } from './routing.js';
import { renderPng } from './render.js';
import { createGelatoOrder, toGelatoAddress } from './gelato.js';
import { notify } from './notify.js';

/**
 * Zentrale Verarbeitung einer bezahlten Bestellung (Shopify oder Etsy).
 * Pro Posten: Größe bestimmen → Route entscheiden → Job anlegen →
 * Gelato-Bestellung sofort auslösen bzw. in Heimdruck-Queue stellen.
 *
 * @param {object} o
 * @param {string} o.id            eindeutige Order-ID (z.B. Shopify-ID oder etsy:<receipt>)
 * @param {string} o.source        'shopify' | 'etsy'
 * @param {string} o.orderNumber   menschenlesbare Nummer (#1001)
 * @param {number} o.totalPrice
 * @param {object} o.shippingAddress  Shopify-REST-Format
 * @param {Array}  o.items         [{ sku, sizeRaw, designId, quantity }]
 */
export async function processPaidOrder(o) {
  upsertOrder({
    id: o.id,
    source: o.source,
    order_number: o.orderNumber || '',
    total_price: o.totalPrice || 0,
    currency: 'EUR',
    payload: o,
    status: 'received',
  });

  const results = [];

  for (const item of o.items) {
    const size = normalizeSize(item.sizeRaw) || SKU_TO_SIZE[item.sku] || null;
    if (!size) {
      results.push({ item, error: `Größe nicht erkennbar (sku=${item.sku}, raw=${item.sizeRaw})` });
      continue;
    }

    const design = item.designId ? getDesign(item.designId) : null;
    if (!design) {
      // Design fehlt (z.B. Etsy-Bestellung: Kunde muss Foto erst nachliefern)
      const jobId = insertJob({
        order_id: o.id, design_id: item.designId || null, size,
        quantity: item.quantity || 1, route: 'pending_design',
        status: 'error', file_token: null,
      });
      updateJob(jobId, { error: 'Design fehlt — wartet auf Kundendatei' });
      setOrderStatus(o.id, 'awaiting_design');
      await notify(
        `⚠️ Bestellung ${o.orderNumber || o.id} (${o.source}): Design fehlt für ${size}. ` +
        `Sobald das Design vorliegt, mit POST /api/jobs/${jobId}/attach-design nachreichen.`
      );
      results.push({ item, size, status: 'awaiting_design', jobId });
      continue;
    }

    const { route, reason } = decideRoute(size);
    const fileToken = crypto.randomBytes(24).toString('hex');
    const jobId = insertJob({
      order_id: o.id, design_id: design.id, size,
      quantity: item.quantity || 1, route,
      status: 'pending', file_token: fileToken,
    });

    if (route === 'gelato') {
      try {
        // PNG vorab rendern, damit Gelatos Download sofort klappt
        await renderPng(design.id, design.svg_path, size);
        const fileUrl = `${config.publicUrl}/api/print-files/${fileToken}.png`;
        const gelato = await createGelatoOrder({
          orderReferenceId: `${o.id}-${jobId}`,
          size,
          fileUrl,
          quantity: item.quantity || 1,
          shippingAddress: toGelatoAddress(o.shippingAddress),
        });
        updateJob(jobId, { status: 'done', gelato_order_id: gelato.id || '' });
        await notify(`✅ ${o.orderNumber || o.id}: ${size} automatisch an Gelato übergeben (${reason})`);
        results.push({ item, size, route, gelatoOrderId: gelato.id, jobId });
      } catch (err) {
        updateJob(jobId, { status: 'error', error: String(err.message || err) });
        await notify(`❌ ${o.orderNumber || o.id}: Gelato-Fehler für ${size}: ${err.message}`);
        results.push({ item, size, route, error: err.message, jobId });
      }
    } else {
      // Heimdruck: Job bleibt 'pending', der Print-Agent holt ihn ab
      await notify(`🖨️ ${o.orderNumber || o.id}: ${size} in Heimdruck-Warteschlange (${reason})`);
      results.push({ item, size, route, status: 'queued_home', jobId });
    }
  }

  const anyError = results.some(r => r.error);
  const awaiting = results.some(r => r.status === 'awaiting_design');
  if (!anyError && !awaiting) setOrderStatus(o.id, 'routed');

  return results;
}

/** Line-Item-Properties einer Shopify-Bestellung → { designId, sizeRaw } */
export function extractItemMeta(lineItem) {
  const props = {};
  for (const p of lineItem.properties || []) props[p.name] = p.value;
  return {
    sku: lineItem.sku || '',
    sizeRaw: props['Format'] || lineItem.variant_title || '',
    designId: props['_design_id'] || null,
    quantity: lineItem.quantity || 1,
  };
}
