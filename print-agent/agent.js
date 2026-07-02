#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════
 * DOTS FOR LOVE — Heimdruck-Agent
 * ════════════════════════════════════════════════════════════
 * Läuft zuhause auf einem PC oder Raspberry Pi, der am Drucker
 * hängt. Fragt den Fulfillment-Hub regelmäßig nach neuen
 * Heimdruck-Jobs (A4/A3), lädt die Druckdatei herunter und
 * druckt sie über CUPS (`lp`). Danach wird die Shopify-
 * Bestellung automatisch als erfüllt markiert.
 *
 * Keine Abhängigkeiten — nur Node.js ≥ 18.
 *
 * Start:
 *   HUB_URL=https://fulfillment.example.com \
 *   AGENT_TOKEN=dein-token \
 *   PRINTER_NAME=Mein_Drucker \
 *   node agent.js
 *
 * Drucker finden:  lpstat -p -d
 * ════════════════════════════════════════════════════════════
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HUB_URL       = (process.env.HUB_URL || '').replace(/\/$/, '');
const AGENT_TOKEN   = process.env.AGENT_TOKEN || '';
const PRINTER_NAME  = process.env.PRINTER_NAME || '';
const POLL_SECONDS  = parseInt(process.env.POLL_SECONDS || '60', 10);
const DRY_RUN       = process.env.DRY_RUN === '1';

if (!HUB_URL || !AGENT_TOKEN) {
  console.error('Bitte HUB_URL und AGENT_TOKEN setzen. Siehe Kommentar am Dateianfang.');
  process.exit(1);
}

// CUPS-Papierformat pro Postergröße
const MEDIA = { A4: 'A4', A3: 'A3' };

const headers = { 'X-Agent-Token': AGENT_TOKEN };

async function api(method, pathName, body) {
  const res = await fetch(`${HUB_URL}${pathName}`, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathName} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function lp(filePath, media) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (PRINTER_NAME) args.push('-d', PRINTER_NAME);
    if (media) args.push('-o', `media=${media}`);
    args.push('-o', 'fit-to-page', filePath);
    execFile('lp', args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

async function processJob(job) {
  console.log(`→ Job #${job.id}: ${job.size} für Bestellung ${job.orderNumber} (${job.source})`);

  await api('POST', `/api/print-queue/${job.id}/claim`);

  const tmpFile = path.join(os.tmpdir(), `dfl-job-${job.id}.png`);
  await downloadFile(job.pngUrl, tmpFile);
  console.log(`  Druckdatei geladen (${(fs.statSync(tmpFile).size / 1024 / 1024).toFixed(1)} MB)`);

  const media = MEDIA[job.size] || 'A4';

  for (let copy = 0; copy < (job.quantity || 1); copy++) {
    if (DRY_RUN) {
      console.log(`  [DRY_RUN] Würde drucken: lp -o media=${media} ${tmpFile}`);
    } else {
      const out = await lp(tmpFile, media);
      console.log(`  Gedruckt: ${out}`);
    }
  }

  await api('POST', `/api/print-queue/${job.id}/complete`);
  console.log(`  ✓ Job #${job.id} abgeschlossen — Bestellung wird in Shopify als erfüllt markiert`);

  fs.unlinkSync(tmpFile);
}

async function tick() {
  try {
    const { jobs } = await api('GET', '/api/print-queue');
    const pending = jobs.filter(j => j.status === 'pending');
    if (!pending.length) return;

    console.log(`${pending.length} neue Heimdruck-Job(s)`);
    for (const job of pending) {
      try {
        await processJob(job);
      } catch (err) {
        console.error(`  ✗ Job #${job.id} fehlgeschlagen:`, err.message);
        await api('POST', `/api/print-queue/${job.id}/error`, { message: err.message })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error('Hub nicht erreichbar:', err.message);
  }
}

console.log(`Dots for Love Print-Agent gestartet`);
console.log(`Hub: ${HUB_URL} · Drucker: ${PRINTER_NAME || '(Standarddrucker)'} · Intervall: ${POLL_SECONDS}s${DRY_RUN ? ' · DRY_RUN' : ''}`);
tick();
setInterval(tick, POLL_SECONDS * 1000);
