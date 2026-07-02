import crypto from 'node:crypto';
import { config } from './config.js';

const API = () =>
  `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/graphql.json`;

/** HMAC-Prüfung für eingehende Shopify-Webhooks (Rohbody erforderlich). */
export function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!config.shopify.webhookSecret || !hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', config.shopify.webhookSecret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

async function gql(query, variables = {}) {
  const res = await fetch(API(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.shopify.adminToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/**
 * Markiert eine Shopify-Bestellung als versandt/erfüllt.
 * Läuft über FulfillmentOrders (Pflicht seit API 2023).
 */
export async function fulfillOrder(orderId, trackingInfo = null) {
  const orderGid = orderId.startsWith('gid://')
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const data = await gql(`
    query FulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          edges { node { id status } }
        }
      }
    }`, { id: orderGid });

  const openFOs = (data.order?.fulfillmentOrders?.edges || [])
    .map(e => e.node)
    .filter(fo => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS');

  if (!openFOs.length) return { skipped: true, reason: 'no open fulfillment orders' };

  const fulfillment = {
    lineItemsByFulfillmentOrder: openFOs.map(fo => ({ fulfillmentOrderId: fo.id })),
    notifyCustomer: true,
  };
  if (trackingInfo) fulfillment.trackingInfo = trackingInfo;

  const result = await gql(`
    mutation Fulfill($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment { id status }
        userErrors { field message }
      }
    }`, { fulfillment });

  const errs = result.fulfillmentCreate?.userErrors || [];
  if (errs.length) throw new Error(`fulfillmentCreate: ${JSON.stringify(errs)}`);
  return result.fulfillmentCreate.fulfillment;
}

/**
 * Legt nach bestätigtem Double-Opt-In einen Shopify-Kunden mit
 * Marketing-Einwilligung an (bzw. aktualisiert ihn) — damit das
 * E-Mail-Tool ihn in die Erinnerungs-Kampagne aufnehmen kann.
 *
 * Consent: SUBSCRIBED + CONFIRMED_OPT_IN (der Kunde hat den
 * Bestätigungslink geklickt). Das Anlassdatum landet als Tag,
 * z.B. "birthday:2026-08-14" bzw. "anniversary:07-23".
 *
 * Benötigte Scopes der Custom App: read_customers, write_customers.
 */
export async function upsertMarketingCustomer({ email, occasion, year, month, day }) {
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = year
    ? `${year}-${pad(month)}-${pad(day)}`
    : `${pad(month)}-${pad(day)}`;
  const tags = ['erinnerung', `${occasion}:${dateStr}`];

  const consentInput = {
    marketingState: 'SUBSCRIBED',
    marketingOptInLevel: 'CONFIRMED_OPT_IN',
    consentUpdatedAt: new Date().toISOString(),
  };

  // 1. Neu anlegen
  const created = await gql(`
    mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`, {
    input: { email, tags, emailMarketingConsent: consentInput },
  });

  const createErrs = created.customerCreate?.userErrors || [];
  if (!createErrs.length) return created.customerCreate.customer;

  const emailTaken = createErrs.some(e => /taken|exists/i.test(e.message));
  if (!emailTaken) throw new Error(`customerCreate: ${JSON.stringify(createErrs)}`);

  // 2. Existiert schon → Kunden suchen, Consent + Tags aktualisieren
  const found = await gql(`
    query FindCustomer($q: String!) {
      customers(first: 1, query: $q) {
        edges { node { id } }
      }
    }`, { q: `email:${email}` });

  const customerId = found.customers?.edges?.[0]?.node?.id;
  if (!customerId) throw new Error(`Kunde ${email} weder anlegbar noch auffindbar`);

  const updated = await gql(`
    mutation UpdateConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
      customerEmailMarketingConsentUpdate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`, {
    input: { customerId, emailMarketingConsent: consentInput },
  });
  const updateErrs = updated.customerEmailMarketingConsentUpdate?.userErrors || [];
  if (updateErrs.length) throw new Error(`consentUpdate: ${JSON.stringify(updateErrs)}`);

  await gql(`
    mutation AddTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`, { id: customerId, tags });

  return { id: customerId };
}
