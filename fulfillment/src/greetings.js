import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import {
  insertGreeting, getGreeting, insertReminder, confirmReminder,
  getReminderByToken, deleteReminderByToken, remindersOnDate, markReminderSent,
} from './db.js';
import {
  sendMail, greetingEmail, confirmEmail, offerEmail, dayEmail,
} from './mailer.js';
import { upsertMarketingCustomer } from './shopify.js';

const GREETINGS_DIR = path.join(config.dataDir, 'greetings');
fs.mkdirSync(GREETINGS_DIR, { recursive: true });

/** Max. Bildgröße: Handy-Auflösung, bewusst NICHT druckbar (~1080×2340) */
const MAX_PNG_BYTES = 4 * 1024 * 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ── Einfaches Rate-Limit pro IP (Spam-Schutz) ────────────── */
const rateBuckets = new Map();
export function rateLimit(ip, key, maxPerHour) {
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = (rateBuckets.get(bucketKey) || []).filter(t => now - t < 3_600_000);
  if (bucket.length >= maxPerHour) return false;
  bucket.push(now);
  rateBuckets.set(bucketKey, bucket);
  return true;
}

/** Data-URL → PNG-Datei speichern, gibt Gruß-Datensatz zurück. */
export function storeGreeting({ imageDataUrl, occasion, senderName }) {
  const m = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
  if (!m) throw new Error('imageDataUrl muss ein PNG (data:image/png;base64,…) sein');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_PNG_BYTES) throw new Error('Bild zu groß (max. 4 MB)');
  // PNG-Signatur prüfen
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Keine gültige PNG-Datei');
  }

  const id = crypto.randomUUID();
  const pngPath = path.join(GREETINGS_DIR, `${id}.png`);
  fs.writeFileSync(pngPath, buf);
  insertGreeting({
    id,
    occasion: occasion === 'anniversary' ? 'anniversary' : 'birthday',
    png_path: pngPath,
    sender_name: String(senderName || '').slice(0, 80),
  });
  return { id, pngPath };
}

/**
 * Bild transaktional an die E-Mail des Erstellers senden.
 * Voraussetzung: Häkchen 1 („Sende mir mein Bild") wurde gesetzt —
 * das prüft der Endpoint. Reine Transaktionsmail, keine Werbung.
 */
export async function sendGreetingNow({ greetingId, email }) {
  if (!EMAIL_RE.test(email || '')) throw new Error('Ungültige E-Mail-Adresse');
  const g = getGreeting(greetingId);
  if (!g) throw new Error('Gruß nicht gefunden');

  const tpl = greetingEmail({ occasion: g.occasion });
  await sendMail({
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    attachmentPath: g.png_path,
    attachmentName: 'dots-for-love-gruss.png',
  });
}

/** Erinnerung anlegen + Double-Opt-In-Mail senden (DSGVO). */
export async function createReminder({ email, occasion, year, month, day, greetingId }) {
  if (!EMAIL_RE.test(email || '')) throw new Error('Ungültige E-Mail-Adresse');
  const m = parseInt(month, 10), d = parseInt(day, 10);
  const y = year ? parseInt(year, 10) : null;
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) throw new Error('Ungültiges Datum');
  if (greetingId && !getGreeting(greetingId)) throw new Error('greetingId unbekannt');

  const id = crypto.randomUUID();
  const confirmToken = crypto.randomBytes(24).toString('hex');
  insertReminder({
    id, email,
    occasion: occasion === 'anniversary' ? 'anniversary' : 'birthday',
    year: y, month: m, day: d,
    greeting_id: greetingId || null,
    confirm_token: confirmToken,
  });

  const tpl = confirmEmail({
    occasion,
    confirmUrl: `${config.publicUrl}/api/reminders/confirm/${confirmToken}`,
  });
  await sendMail({ to: email, subject: tpl.subject, html: tpl.html });
  return { id };
}

/**
 * Double-Opt-In-Bestätigung: Erinnerung aktivieren UND den Kunden
 * mit Marketing-Einwilligung (SUBSCRIBED / CONFIRMED_OPT_IN) in
 * Shopify anlegen, inkl. Anlassdatum als Tag. Der Shopify-Sync ist
 * Best-Effort — ein API-Fehler blockiert die Bestätigung nicht.
 */
export async function confirmReminderAndSync(token) {
  const reminder = getReminderByToken(token);
  const ok = confirmReminder(token);
  if (!ok || !reminder) return false;

  if (config.shopify.adminToken) {
    try {
      await upsertMarketingCustomer({
        email: reminder.email,
        occasion: reminder.occasion,
        year: reminder.year,
        month: reminder.month,
        day: reminder.day,
      });
      console.log(`[reminder] Shopify-Kunde mit Marketing-Consent: ${reminder.email}`);
    } catch (err) {
      console.error(`[reminder] Shopify-Kunden-Sync fehlgeschlagen (${reminder.email}):`, err.message);
    }
  }
  return true;
}

export { deleteReminderByToken };

/* ══════════════════════════════════════════════════════════
   ERINNERUNGS-SCHEDULER
   Läuft stündlich:
   • Termin in 21 Tagen  → Angebots-Mail (Rabattcode + Gratisbild)
   • Termin heute        → Tages-Mail (Bild zum Weiterleiten)
   Pro Jahr und Erinnerung wird jede Mail nur einmal verschickt.
   ══════════════════════════════════════════════════════════ */
export async function runReminderSweep(now = new Date()) {
  const lead = new Date(now);
  lead.setDate(lead.getDate() + config.marketing.offerLeadDays);

  // 1. Angebots-Mails (T-21)
  for (const r of remindersOnDate(lead, 'offer_sent_year')) {
    try {
      const g = r.greeting_id ? getGreeting(r.greeting_id) : null;
      const tpl = offerEmail({
        occasion: r.occasion,
        discountCode: config.marketing.discountCode,
        discountPercent: config.marketing.discountPercent,
        unsubscribeUrl: `${config.publicUrl}/api/reminders/unsubscribe/${r.confirm_token}`,
        hasImage: !!g,
      });
      await sendMail({
        to: r.email, subject: tpl.subject, html: tpl.html,
        attachmentPath: g?.png_path,
        attachmentName: g ? 'dots-for-love-gratisbild.png' : undefined,
      });
      markReminderSent(r.id, 'offer_sent_year', lead.getFullYear());
      console.log(`[reminder] Angebots-Mail an ${r.email} (${r.occasion} am ${r.day}.${r.month}.)`);
    } catch (err) {
      console.error(`[reminder] Angebots-Mail an ${r.email} fehlgeschlagen:`, err.message);
    }
  }

  // 2. Tages-Mails (T-0)
  for (const r of remindersOnDate(now, 'day_sent_year')) {
    try {
      const g = r.greeting_id ? getGreeting(r.greeting_id) : null;
      const tpl = dayEmail({
        occasion: r.occasion,
        unsubscribeUrl: `${config.publicUrl}/api/reminders/unsubscribe/${r.confirm_token}`,
        hasImage: !!g,
      });
      await sendMail({
        to: r.email, subject: tpl.subject, html: tpl.html,
        attachmentPath: g?.png_path,
        attachmentName: g ? 'dots-for-love-gruss.png' : undefined,
      });
      markReminderSent(r.id, 'day_sent_year', now.getFullYear());
      console.log(`[reminder] Tages-Mail an ${r.email} (${r.occasion})`);
    } catch (err) {
      console.error(`[reminder] Tages-Mail an ${r.email} fehlgeschlagen:`, err.message);
    }
  }
}

export function startReminderScheduler() {
  console.log(`[reminder] Scheduler aktiv (Angebot ${config.marketing.offerLeadDays} Tage vorher, ` +
    `Code ${config.marketing.discountCode} = ${config.marketing.discountPercent}%)`);
  const tick = () => runReminderSweep().catch(err => console.error('[reminder]', err));
  tick();
  setInterval(tick, 60 * 60 * 1000); // stündlich
}
