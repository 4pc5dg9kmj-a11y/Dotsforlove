import { config, SKU_TO_SIZE } from './config.js';
import { isEtsyReceiptProcessed, markEtsyReceiptProcessed } from './db.js';
import { processPaidOrder } from './orders.js';
import { notify } from './notify.js';

/**
 * Etsy-Connector (API v3, OAuth 2.0 mit Refresh-Token).
 *
 * Ablauf: Alle N Minuten werden neue bezahlte Bestellungen (Receipts)
 * abgeholt. Die Zuordnung zur Postergröße läuft über die SKU des
 * Etsy-Listings (DFL-A4, DFL-A3, DFL-5070, DFL-70100 — identisch zu Shopify).
 *
 * Personalisierte Poster: Etsy erlaubt keinen Foto-Upload im Checkout.
 * Der Käufer erhält daher (per Etsy-Nachricht/Kaufhinweis) einen Link zum
 * Konfigurator mit seinem Bestellcode. Bis das Design vorliegt, steht die
 * Bestellung auf 'awaiting_design' und du bekommst eine Benachrichtigung.
 */

let accessToken = null;
let accessTokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry - 60_000) return accessToken;

  const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.etsy.apiKey,
      refresh_token: config.etsy.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Etsy OAuth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  accessToken = json.access_token;
  accessTokenExpiry = Date.now() + (json.expires_in || 3600) * 1000;
  return accessToken;
}

async function etsyGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`https://openapi.etsy.com/v3${path}`, {
    headers: {
      'x-api-key': config.etsy.apiKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Etsy API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Neue bezahlte Etsy-Bestellungen abholen und in die Fulfillment-Pipeline geben. */
export async function pollEtsyOrders() {
  if (!config.etsy.enabled) return;

  const data = await etsyGet(
    `/application/shops/${config.etsy.shopId}/receipts?was_paid=true&was_shipped=false&limit=25`
  );

  for (const receipt of data.results || []) {
    const receiptId = String(receipt.receipt_id);
    if (isEtsyReceiptProcessed(receiptId)) continue;

    const items = (receipt.transactions || []).map(t => ({
      sku: t.sku || '',
      sizeRaw: SKU_TO_SIZE[t.sku] || t.sku || '',
      // Personalisierung: Design-ID kann der Käufer im Personalisierungsfeld
      // eintragen (aus dem Konfigurator-Link), sonst 'awaiting_design'.
      designId: extractDesignId(t),
      quantity: t.quantity || 1,
    }));

    const shippingAddress = {
      first_name: receipt.name || '',
      last_name: '',
      address1: receipt.first_line || '',
      address2: receipt.second_line || '',
      city: receipt.city || '',
      zip: receipt.zip || '',
      province_code: receipt.state || '',
      country_code: receipt.country_iso || 'DE',
      email: receipt.buyer_email || '',
    };

    try {
      await processPaidOrder({
        id: `etsy:${receiptId}`,
        source: 'etsy',
        orderNumber: `Etsy #${receiptId}`,
        totalPrice: parseFloat(receipt.grandtotal?.amount || 0) / (receipt.grandtotal?.divisor || 100),
        shippingAddress,
        items,
      });
      markEtsyReceiptProcessed(receiptId);
    } catch (err) {
      await notify(`❌ Etsy-Bestellung ${receiptId} konnte nicht verarbeitet werden: ${err.message}`);
    }
  }
}

/** Design-ID aus dem Etsy-Personalisierungstext fischen (Format: DFL-DESIGN:<uuid>) */
function extractDesignId(transaction) {
  const variations = transaction.variations || [];
  const personalization = [
    transaction.personalization,
    ...variations.map(v => v.formatted_value),
  ].filter(Boolean).join(' ');
  const m = personalization.match(/DFL-DESIGN:([a-f0-9-]{8,})/i);
  return m ? m[1] : null;
}

/** Poll-Loop starten */
export function startEtsyPolling() {
  if (!config.etsy.enabled) {
    console.log('[etsy] Deaktiviert (ETSY_ENABLED=false)');
    return;
  }
  const intervalMs = config.etsy.pollMinutes * 60_000;
  console.log(`[etsy] Polling alle ${config.etsy.pollMinutes} Minuten`);
  const tick = () => pollEtsyOrders().catch(err => console.error('[etsy]', err.message));
  tick();
  setInterval(tick, intervalMs);
}
