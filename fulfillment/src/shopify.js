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
