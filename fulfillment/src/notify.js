import { config } from './config.js';

/**
 * Admin-Benachrichtigung: Konsole + optionaler Webhook
 * (Discord/Slack Incoming Webhook — beide akzeptieren {"content"/"text": ...}).
 */
export async function notify(message) {
  console.log(`[notify] ${message}`);
  if (!config.notifyWebhookUrl) return;
  try {
    await fetch(config.notifyWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message, text: message }),
    });
  } catch (err) {
    console.error('[notify] Webhook fehlgeschlagen:', err.message);
  }
}
