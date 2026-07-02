import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null; // Dev-Modus: nur Konsole
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

/**
 * E-Mail senden (HTML + optionaler PNG-Anhang).
 * Ohne SMTP-Konfiguration wird nur geloggt (Entwicklung).
 */
export async function sendMail({ to, subject, html, attachmentPath, attachmentName }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mail:dev] an=${to} betreff="${subject}" anhang=${attachmentPath || '-'}`);
    return { dev: true };
  }
  const mail = {
    from: config.smtp.from,
    to,
    subject,
    html,
  };
  if (attachmentPath) {
    mail.attachments = [{
      filename: attachmentName || 'dots-for-love.png',
      path: attachmentPath,
      cid: 'greeting-image',
    }];
  }
  return t.sendMail(mail);
}

/* ══════════════════════════════════════════════════════════
   E-MAIL-VORLAGEN (deutsch)
   ══════════════════════════════════════════════════════════ */

const OCCASION_TEXT = {
  birthday: {
    emoji: '🎂',
    name: 'Geburtstag',
    greetSubject: '🎁 Dein Geburtstagsgruß ist fertig!',
    greetIntro: 'hier ist dein persönlicher Geburtstagsgruß — ein Kunstwerk aus hunderten kleinen Punkten',
    offerSubject: '🎂 In 3 Wochen ist der Geburtstag — dein Geschenk wartet!',
    offerIntro: 'in genau 3 Wochen ist der Geburtstag, an den du erinnert werden wolltest',
    daySubject: '🎉 Heute ist der Geburtstag! Dein Gruß ist bereit',
    dayIntro: 'heute ist der große Tag! Hier ist dein persönliches Geburtstagsbild',
  },
  anniversary: {
    emoji: '💞',
    name: 'Jahrestag',
    greetSubject: '💝 Dein Jahrestagsgruß ist fertig!',
    greetIntro: 'hier ist dein persönlicher Gruß zum Jahrestag — ein Kunstwerk eurer gemeinsamen Zeit',
    offerSubject: '💞 In 3 Wochen ist euer Jahrestag — mach etwas Besonderes daraus!',
    offerIntro: 'in genau 3 Wochen ist euer Jahrestag',
    daySubject: '💝 Heute ist euer Jahrestag! Dein Gruß ist bereit',
    dayIntro: 'heute ist euer besonderer Tag! Hier ist dein persönliches Bild',
  },
};

function layout(inner) {
  const html = `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#F9F8F5;font-family:Helvetica,Arial,sans-serif;color:#1A1A2E;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:24px;">
      <span style="font-size:22px;font-weight:bold;">Dots <em style="color:#E8495A;">for Love</em></span>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(26,26,46,0.08);">
      ${inner}
    </div>
    <p style="text-align:center;font-size:11px;color:#999;padding-top:24px;">
      Dots for Love · Erinnerungen in Punkte verwandeln<br>{{FOOTER_LINKS}}
    </p>
  </div>
</body></html>`;
  return html.replaceAll('{{SHOP_URL}}', config.shopUrl);
}

export function greetingEmail({ occasion }) {
  const t = OCCASION_TEXT[occasion] || OCCASION_TEXT.birthday;
  return {
    subject: t.greetSubject,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 16px;">${t.emoji} Dein Bild ist da!</h1>
      <p>Hallo,</p>
      <p>${t.greetIntro}. <strong>Leite diese E-Mail einfach weiter</strong> oder verschicke das
      angehängte Bild per WhatsApp — es ist im Handy-Format, perfekt als Hintergrundbild oder zum Teilen.</p>
      <img src="cid:greeting-image" alt="Dein persönlicher Gruß" style="width:100%;border-radius:12px;margin:16px 0;">
      <p style="text-align:center;margin-top:24px;">
        <a href="{{SHOP_URL}}" style="background:#E8495A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;font-size:14px;">Als Poster drucken lassen</a>
      </p>
    `).replace('{{FOOTER_LINKS}}', 'Du erhältst diese E-Mail, weil du dein Bild angefordert hast (keine Werbung).'),
  };
}

export function confirmEmail({ occasion, confirmUrl }) {
  const t = OCCASION_TEXT[occasion] || OCCASION_TEXT.birthday;
  return {
    subject: `${t.emoji} Bitte bestätige deine ${t.name}s-Erinnerung`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 16px;">Fast geschafft!</h1>
      <p>Du möchtest an einen ${t.name} erinnert werden — schön, dass du an deine Liebsten denkst! ${t.emoji}</p>
      <p>Bitte bestätige kurz deine E-Mail-Adresse, damit wir dich rechtzeitig erinnern dürfen:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${confirmUrl}" style="background:#E8495A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;font-size:14px;">Erinnerung aktivieren</a>
      </p>
      <p style="font-size:13px;color:#777;">Du bekommst dann 3 Wochen vorher eine Erinnerung mit einem Rabatt-Angebot und am Tag selbst dein kostenloses Bild zum Weiterschicken. Kein Spam, versprochen.</p>
    `).replace('{{FOOTER_LINKS}}', 'Wenn du das nicht warst, ignoriere diese E-Mail einfach.'),
  };
}

export function offerEmail({ occasion, discountCode, discountPercent, unsubscribeUrl, hasImage }) {
  const t = OCCASION_TEXT[occasion] || OCCASION_TEXT.birthday;
  const img = hasImage
    ? `<img src="cid:greeting-image" alt="Dein Gratisbild" style="width:100%;border-radius:12px;margin:16px 0;">
       <p style="font-size:13px;color:#777;">Dein kostenloses Handy-Bild ist angehängt — schon mal zum Vorfreuen. 😉</p>`
    : '';
  return {
    subject: t.offerSubject,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 16px;">${t.emoji} Noch 3 Wochen!</h1>
      <p>Hallo,</p>
      <p>${t.offerIntro}. Genug Zeit, um daraus etwas ganz Besonderes zu machen:</p>
      <p>Verwandle euer Lieblingsfoto in ein <strong>gedrucktes Kunstwerk aus tausenden Punkten</strong> — ein Poster, das eure gemeinsame Zeit zeigt. Jetzt bestellen, damit es rechtzeitig ankommt!</p>
      <div style="background:#FDF0F1;border:2px dashed #E8495A;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:14px;">Dein Erinnerungs-Rabatt:</p>
        <p style="margin:0;font-size:26px;font-weight:bold;letter-spacing:2px;color:#E8495A;">${discountCode}</p>
        <p style="margin:8px 0 0;font-size:14px;"><strong>${discountPercent}% Rabatt</strong> auf dein gedrucktes Poster</p>
      </div>
      <p style="text-align:center;margin:24px 0;">
        <a href="{{SHOP_URL}}" style="background:#E8495A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;font-size:14px;">Jetzt Poster gestalten</a>
      </p>
      ${img}
    `).replace('{{FOOTER_LINKS}}', `<a href="${unsubscribeUrl}" style="color:#999;">Erinnerung abbestellen</a>`),
  };
}

export function dayEmail({ occasion, unsubscribeUrl, hasImage }) {
  const t = OCCASION_TEXT[occasion] || OCCASION_TEXT.birthday;
  const img = hasImage
    ? `<img src="cid:greeting-image" alt="Dein Bild" style="width:100%;border-radius:12px;margin:16px 0;">`
    : '';
  return {
    subject: t.daySubject,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 16px;">${t.emoji} Heute ist es soweit!</h1>
      <p>Hallo,</p>
      <p>${t.dayIntro} — <strong>einfach diese E-Mail weiterleiten</strong> oder das angehängte Bild per WhatsApp verschicken. 💌</p>
      ${img}
      <p style="text-align:center;margin:24px 0;">
        <a href="{{SHOP_URL}}" style="background:#E8495A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;font-size:14px;">Neuen Gruß gestalten — kostenlos</a>
      </p>
    `).replace('{{FOOTER_LINKS}}', `<a href="${unsubscribeUrl}" style="color:#999;">Erinnerung abbestellen</a>`),
  };
}

