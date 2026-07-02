import { config } from './config.js';

/**
 * Erstellt eine Druckbestellung bei Gelato (API v4).
 * Gelato lädt die Druckdatei selbst von fileUrl herunter —
 * die URL muss daher öffentlich per HTTPS erreichbar sein.
 *
 * Doku: https://dashboard.gelato.com/docs/orders/v4/create
 */
export async function createGelatoOrder({ orderReferenceId, size, fileUrl, quantity, shippingAddress }) {
  const productUid = config.gelato.productUids[size];
  if (!productUid) {
    throw new Error(`Keine Gelato-Produkt-UID für Größe ${size} konfiguriert (GELATO_PRODUCT_UID_${size.replace('X', 'X')})`);
  }

  const body = {
    orderType: 'order',
    orderReferenceId: String(orderReferenceId),
    customerReferenceId: String(orderReferenceId),
    currency: 'EUR',
    items: [{
      itemReferenceId: `${orderReferenceId}-${size}`,
      productUid,
      quantity: quantity || 1,
      files: [{ type: 'default', url: fileUrl }],
    }],
    shippingAddress,
  };

  const res = await fetch(config.gelato.orderApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': config.gelato.apiKey,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gelato API ${res.status}: ${JSON.stringify(json)}`);
  }
  return json; // enthält u.a. { id: "gelato-order-id", ... }
}

/** Shopify-Lieferadresse → Gelato-Format */
export function toGelatoAddress(a) {
  if (!a) throw new Error('Bestellung hat keine Lieferadresse');
  return {
    firstName: a.first_name || '',
    lastName: a.last_name || '',
    companyName: a.company || '',
    addressLine1: a.address1 || '',
    addressLine2: a.address2 || '',
    city: a.city || '',
    postCode: a.zip || '',
    state: a.province_code || '',
    country: a.country_code || 'DE',
    email: a.email || '',
    phone: a.phone || '',
  };
}
