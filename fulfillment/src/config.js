import 'dotenv/config';
import path from 'node:path';

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function list(v, def = []) {
  if (!v) return def;
  return String(v).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),

  shopify: {
    shop: process.env.SHOPIFY_SHOP || '',
    adminToken: process.env.SHOPIFY_ADMIN_TOKEN || '',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
    apiVersion: '2025-01',
  },

  gelato: {
    apiKey: process.env.GELATO_API_KEY || '',
    orderApi: 'https://order.gelatoapis.com/v4/orders',
    productUids: {
      A4: process.env.GELATO_PRODUCT_UID_A4 || '',
      A3: process.env.GELATO_PRODUCT_UID_A3 || '',
      '50X70': process.env.GELATO_PRODUCT_UID_50X70 || '',
      '70X100': process.env.GELATO_PRODUCT_UID_70X100 || '',
    },
  },

  homePrint: {
    enabled: bool(process.env.HOME_PRINT_ENABLED, true),
    monthlyRevenueThreshold: parseFloat(process.env.HOME_PRINT_MONTHLY_REVENUE_THRESHOLD || '500'),
    sizes: list(process.env.HOME_PRINT_SIZES, ['A4', 'A3']),
    agentToken: process.env.PRINT_AGENT_TOKEN || '',
  },

  etsy: {
    enabled: bool(process.env.ETSY_ENABLED, false),
    apiKey: process.env.ETSY_API_KEY || '',
    refreshToken: process.env.ETSY_REFRESH_TOKEN || '',
    shopId: process.env.ETSY_SHOP_ID || '',
    pollMinutes: parseInt(process.env.ETSY_POLL_MINUTES || '10', 10),
  },

  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
};

/** SKU ↔ Größe Zuordnung (identisch in Shopify & Etsy pflegen) */
export const SKU_TO_SIZE = {
  'DFL-A4': 'A4',
  'DFL-A3': 'A3',
  'DFL-5070': '50X70',
  'DFL-70100': '70X100',
};

/** Größen in mm — muss zu assets/configurator.js passen */
export const SIZE_MM = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  '50X70': { w: 500, h: 700 },
  '70X100': { w: 700, h: 1000 },
};

export function normalizeSize(raw) {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/\s|×/g, '').replace('X', 'X');
  if (SIZE_MM[s]) return s;
  // "50x70", "50 × 70 cm", "DIN A4" …
  const cleaned = s.replace(/^DIN/, '').replace(/CM$/, '');
  if (SIZE_MM[cleaned]) return cleaned;
  return null;
}
