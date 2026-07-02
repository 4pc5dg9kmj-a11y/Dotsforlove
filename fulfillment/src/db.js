import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'designs'), { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'renders'), { recursive: true });

const db = new Database(path.join(config.dataDir, 'fulfillment.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS designs (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  svg_path    TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,          -- Shopify Order-ID bzw. etsy:<receipt_id>
  source         TEXT NOT NULL,             -- shopify | etsy
  order_number   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  total_price    REAL NOT NULL DEFAULT 0,
  currency       TEXT DEFAULT 'EUR',
  payload        TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'received'  -- received | routed | fulfilled | error | awaiting_design
);

CREATE TABLE IF NOT EXISTS jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       TEXT NOT NULL,
  design_id      TEXT,
  size           TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  route          TEXT NOT NULL,             -- gelato | home
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | printing | done | error
  gelato_order_id TEXT,
  file_token     TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS etsy_receipts (
  receipt_id   TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_route_status ON jobs (route, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);
`);

export default db;

/** Bruttoumsatz des laufenden Kalendermonats (alle Quellen). */
export function monthlyRevenue() {
  const row = db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS total
    FROM orders
    WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      AND status != 'error'
  `).get();
  return row.total;
}

export function insertDesign(id, svgPath, meta) {
  db.prepare(`INSERT INTO designs (id, svg_path, meta) VALUES (?, ?, ?)`)
    .run(id, svgPath, JSON.stringify(meta || {}));
}

export function getDesign(id) {
  const row = db.prepare(`SELECT * FROM designs WHERE id = ?`).get(id);
  if (row) row.meta = JSON.parse(row.meta);
  return row;
}

export function upsertOrder(order) {
  db.prepare(`
    INSERT INTO orders (id, source, order_number, total_price, currency, payload, status)
    VALUES (@id, @source, @order_number, @total_price, @currency, @payload, @status)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status
  `).run({ ...order, payload: JSON.stringify(order.payload || {}) });
}

export function setOrderStatus(id, status) {
  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, id);
}

export function insertJob(job) {
  const info = db.prepare(`
    INSERT INTO jobs (order_id, design_id, size, quantity, route, status, file_token)
    VALUES (@order_id, @design_id, @size, @quantity, @route, @status, @file_token)
  `).run(job);
  return info.lastInsertRowid;
}

export function updateJob(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE jobs SET ${sets}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...fields, id });
}

export function getJob(id) {
  return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
}

export function getJobByToken(token) {
  return db.prepare(`SELECT * FROM jobs WHERE file_token = ?`).get(token);
}

export function pendingHomeJobs() {
  return db.prepare(`
    SELECT j.*, o.order_number, o.source
    FROM jobs j JOIN orders o ON o.id = j.order_id
    WHERE j.route = 'home' AND j.status IN ('pending', 'claimed')
    ORDER BY j.created_at ASC
  `).all();
}

export function openJobsForOrder(orderId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE order_id = ? AND status != 'done'`)
    .get(orderId).n;
}

export function isEtsyReceiptProcessed(receiptId) {
  return !!db.prepare(`SELECT 1 FROM etsy_receipts WHERE receipt_id = ?`).get(String(receiptId));
}

export function markEtsyReceiptProcessed(receiptId) {
  db.prepare(`INSERT OR IGNORE INTO etsy_receipts (receipt_id) VALUES (?)`).run(String(receiptId));
}
