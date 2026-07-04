# Dots for Love — Vollautomatisches Fulfillment

Diese Anleitung beschreibt, wie dein Shop **komplett automatisch** läuft:
Shopify-Bestellung → Design gespeichert → Druck bei **Gelato** ODER **zuhause** (A4/A3 ab Umsatzschwelle) → Bestellung automatisch als erfüllt markiert. Dazu die **Etsy-Verknüpfung**.

```
                        ┌─────────────────────────┐
   Shopify-Shop ───────▶│                         │──────▶ Gelato API
   (Webhook             │     FULFILLMENT-HUB     │        (druckt & versendet)
    orders/paid)        │                         │
                        │  • speichert Designs    │──────▶ Heimdruck-Queue
   Etsy-Shop ──────────▶│  • rendert 300-DPI-PNG  │            │
   (API-Polling)        │  • Umsatz-Routing       │            ▼
                        │  • Shopify-Fulfillment  │   Print-Agent @ zuhause
   Konfigurator ───────▶│                         │   (druckt via CUPS auf
   (SVG-Upload)         └─────────────────────────┘    deinem Drucker)
```

**Die Kernlogik:** Jede bezahlte Bestellung landet im Hub. Der Hub prüft:
*Ist der Monatsumsatz ≥ Schwelle (Standard 500 €) UND ist die Größe A4 oder A3?*
→ **Ja:** Job in die Heimdruck-Warteschlange, dein Drucker zuhause druckt automatisch.
→ **Nein:** Bestellung geht vollautomatisch an Gelato (Druck + Versand).

---

## 1. Fulfillment-Hub deployen (einmalig, ~30 Min.)

Der Hub ist ein kleiner Node.js-Server (`fulfillment/`). Er braucht einen Host mit **öffentlicher HTTPS-URL** (Gelato lädt die Druckdateien von dort herunter). Geeignet: [Railway](https://railway.app), [Render](https://render.com), Hetzner-VPS (~4 €/Monat).

```bash
cd fulfillment
cp .env.example .env     # Werte eintragen (siehe unten)
npm install
npm start
```

Wichtig in der `.env`:

| Variable | Wo bekommst du den Wert? |
|---|---|
| `PUBLIC_URL` | Die HTTPS-URL deines Hosts, z.B. `https://dfl-hub.up.railway.app` |
| `SHOPIFY_ADMIN_TOKEN` | Shopify Admin → Einstellungen → Apps und Vertriebskanäle → **Apps entwickeln** → App erstellen → Scopes `read_orders`, `write_fulfillments`, `read_fulfillments` → Token kopieren |
| `SHOPIFY_WEBHOOK_SECRET` | Wird beim Webhook-Anlegen angezeigt (Schritt 2) |
| `GELATO_API_KEY` | Gelato Dashboard → **Developer → API Keys** |
| `PRINT_AGENT_TOKEN` | Selbst ausdenken (lang & zufällig, z.B. `openssl rand -hex 32`) |
| `HOME_PRINT_MONTHLY_REVENUE_THRESHOLD` | Deine Umsatzschwelle in € (Standard: 500) |

## 2. Shopify-Webhook einrichten (5 Min.)

Shopify Admin → **Einstellungen → Benachrichtigungen → Webhooks** → Webhook erstellen:

- **Ereignis:** Bestellzahlung (`orders/paid`)
- **Format:** JSON
- **URL:** `https://DEIN-HUB/webhooks/shopify/orders-paid`
- Das angezeigte **Signatur-Secret** in die `.env` als `SHOPIFY_WEBHOOK_SECRET` eintragen.

Danach im Theme-Editor (**Online Store → Anpassen → Theme-Einstellungen → Fulfillment-Automatisierung**) die Hub-URL eintragen — ab dann lädt der Konfigurator jedes Kundendesign automatisch zum Hub hoch.

## 3. Gelato verbinden (15 Min.)

Gelato druckt und versendet weltweit — ideal für alle Größen, solange du unter der Umsatzschwelle bist, und dauerhaft für die großen Formate (50×70, 70×100).

1. **Konto:** [gelato.com](https://www.gelato.com) → registrieren (kostenlos, du zahlst nur pro Druck).
2. **API-Key:** Dashboard → Developer → API Keys → erstellen → in `.env` als `GELATO_API_KEY`.
3. **Produkt-UIDs prüfen:** Die `.env.example` enthält UIDs für 200-g/m²-Poster. Gleiche sie mit deinem Katalog ab:
   ```bash
   curl -H "X-API-KEY: dein-key" \
     "https://product.gelatoapis.com/v3/catalogs/posters/products?limit=50"
   ```
   Die `productUid` der gewünschten Poster (Format + Papier) in die `.env` übernehmen.
4. **Fertig.** Ab jetzt erstellt der Hub bei jeder bezahlten Bestellung automatisch eine Gelato-Bestellung mit der 300-DPI-Druckdatei und der Lieferadresse des Kunden. Gelato druckt, versendet und du bekommst eine Benachrichtigung.

> **Hinweis:** Die offizielle **Gelato-Shopify-App** brauchst du für die personalisierten Poster NICHT — sie kann keine dynamisch generierten Druckdateien zuordnen. Genau das übernimmt der Hub über die Gelato-API.

## 4. Heimdruck einrichten (A4/A3 ab Umsatzschwelle)

Sobald dein **Monatsumsatz die Schwelle erreicht** (Standard 500 €, einstellbar via `HOME_PRINT_MONTHLY_REVENUE_THRESHOLD`), werden A4- und A3-Bestellungen **nicht mehr an Gelato geschickt**, sondern landen in deiner Heimdruck-Warteschlange — höhere Marge, da du nur Papier + Tinte zahlst.

Auf einem PC oder Raspberry Pi zuhause (muss am Drucker hängen, CUPS installiert):

```bash
# Drucker-Name herausfinden
lpstat -p -d

# Agent starten
cd print-agent
HUB_URL=https://DEIN-HUB \
AGENT_TOKEN=dein-token-aus-der-env \
PRINTER_NAME=Dein_Drucker \
node agent.js
```

Der Agent fragt jede Minute nach neuen Jobs, lädt die 300-DPI-Druckdatei herunter, druckt sie im richtigen Format (A4/A3) und meldet den Job als erledigt — **der Hub markiert die Shopify-Bestellung dann automatisch als erfüllt** und der Kunde bekommt die Versandbestätigung.

**Dauerbetrieb (Raspberry Pi):** `print-agent/dots-print-agent.service` anpassen und als systemd-Service installieren (Anleitung im Dateikopf). Erst mit `DRY_RUN=1` testen — dann wird nichts gedruckt, nur geloggt.

> **Wichtig:** Beim Heimdruck musst du den **Versand selbst übernehmen** (Poster einrollen, Versandtasche, Briefmarke/DHL). Der Hub erfüllt die Bestellung in Shopify automatisch, sobald gedruckt wurde — wenn du lieber erst nach dem tatsächlichen Versand erfüllen willst, entferne den `fulfillOrder`-Aufruf in `fulfillment/src/server.js` (Route `/complete`) und erfülle manuell in Shopify.

## 5. Etsy verknüpfen

**Empfohlener Weg für deinen personalisierten Artikel:** Etsy-Käufer können im Checkout kein Foto hochladen. Der Ablauf:

1. **Etsy-Listing anlegen** mit Varianten A4/A3/50×70/70×100 und **denselben SKUs wie in Shopify**: `DFL-A4`, `DFL-A3`, `DFL-5070`, `DFL-70100`. Personalisierung aktivieren.
2. In den **Personalisierungs-Anweisungen** des Listings den Käufer zum Konfigurator schicken:
   *„Gestalte dein Poster auf dots-for-love.com/pages/poster-gestalten und füge deinen Design-Code (DFL-DESIGN:…) hier ein."*
3. **Etsy-App erstellen:** [etsy.com/developers/your-apps](https://www.etsy.com/developers/your-apps) → App anlegen → API-Key + OAuth-Refresh-Token holen → in `.env` eintragen, `ETSY_ENABLED=true`.
4. Der Hub **pollt alle 10 Minuten** neue bezahlte Etsy-Bestellungen:
   - Design-Code vorhanden → läuft durch dieselbe Automatik (Gelato oder Heimdruck).
   - Kein Design-Code → Status `awaiting_design` + du bekommst eine Benachrichtigung; sobald das Design vorliegt, per `POST /api/jobs/<id>/attach-design` nachreichen.

**Alternative für Standard-Motive (nicht personalisiert):** Gelato hat eine **native Etsy-Integration** (Gelato Dashboard → Stores → Etsy verbinden). Damit werden fertige Motive vollautomatisch erfüllt — nutze das für vorgefertigte Design-Kollektionen, den Hub für alles Personalisierte. Beides läuft parallel problemlos.

## 6. Benachrichtigungen (optional, empfohlen)

Trage in der `.env` eine `NOTIFY_WEBHOOK_URL` ein (Discord- oder Slack-Incoming-Webhook). Du bekommst dann Push-Meldungen bei: Gelato-Übergabe ✅, neuem Heimdruck-Job 🖨️, fehlendem Etsy-Design ⚠️ und Fehlern ❌.

## 7. Gratis-Grüße & Erinnerungs-Marketing 🎁

Zwei kostenlose virale Features auf der Seite **„Gratis-Gruß"** (`gratis.html` bzw. Shopify-Seite mit Template `page.gratis-gruss`):

- **Geburtstagswunsch-Generator** und **Jahrestagsgruß für Paare**: Foto hochladen → Dot-Art-Bild in **Handy-Auflösung** (1080 px, mit eingebranntem `dots-for-love.com`-Branding — bewusst **nicht druckbar**).
- **Kein Download:** Das Bild wird **ausschließlich per E-Mail** an den Ersteller versendet. Dafür ist eine E-Mail-Adresse + Häkchen 1 nötig.
- **Print direkt mitbestellen:** Druckformat wählen → Preis sofort sichtbar (aus den Produktvarianten) → Warenkorb. Gratis-Bild und Druckkauf in einem Flow. *(Checkout setzt aktives Shopify Payments voraus.)*

**Zwei getrennte Häkchen (DSGVO):**
1. **„Sende mir mein Bild an diese E-Mail"** — erforderlich, rein transaktional, keine Werbung. Ohne dieses Häkchen kein Versand.
2. **„Ja, erinnere mich vor dem Tag und sende mir Angebote"** — separates, **nicht vorangekreuztes** Opt-in. Nur wer es setzt, kommt in die Erinnerungs-Kampagne.

**Erinnerungs-Kampagne (nur mit Häkchen 2):**
1. Double-Opt-In-Bestätigung per Link (Abmeldelink in jeder Mail).
2. **Nach der Bestätigung** legt der Hub automatisch einen **Shopify-Kunden mit Marketing-Einwilligung** an (`SUBSCRIBED` / `CONFIRMED_OPT_IN`) — mit Anlassdatum als Tag, z.B. `birthday:2026-08-14`. Daran kann das E-Mail-Tool/Shopify-Automationen anknüpfen.
3. **3 Wochen vorher** (einstellbar via `OFFER_LEAD_DAYS`): Angebots-Mail mit Rabattcode (Standard 15 %, `DISCOUNT_CODE`/`DISCOUNT_PERCENT`) + Gratisbild.
4. **Am Tag selbst:** E-Mail mit dem Bild zum direkten **Weiterleiten**. Wiederholt sich jedes Jahr.

**Einrichtung:**
1. SMTP-Zugang in der `.env` eintragen (`SMTP_HOST` etc.) — z.B. [Brevo](https://www.brevo.com) (kostenlos bis 300 Mails/Tag). Ohne SMTP werden Mails nur geloggt.
2. Kampagnen-Rabattcode (15 %, 1× pro Kunde) in Shopify anlegen und in `DISCOUNT_CODE`/`DISCOUNT_PERCENT` eintragen. (Der alte Code ERINNERUNG5 mit 5 % existiert ebenfalls bereits.)
3. Custom-App-Scopes erweitern: zusätzlich `read_customers`, `write_customers` (für die Marketing-Opt-ins).
4. Shopify-Seite anlegen: Titel „Gratis-Gruß", Handle `gratis-gruss`, Template `page.gratis-gruss`. Die Datei `assets/greeting.js` als `greeting.js` in die Theme-Assets kopieren.
5. Spam-Schutz ist eingebaut (max. 5 Grüße/Erinnerungen pro Stunde und IP).

## 8. Familien-Poster 👨‍👩‍👧‍👦

Fünf freigegebene Motive auf der Seite **„Familien-Poster"** (`familie.html` bzw. Shopify-Template `page.familien-poster`): Smiley-Grid (ein Gesicht pro Mitglied), Geburtsjahre in Serifenziffern, Namensrätsel in zwei Stilen (modern / Pinsel mit eingekreisten Namen), Pinselfiguren nach Alter.

- Läuft über **dieselbe Pipeline** wie der Foto-Konfigurator: Live-Vorschau mit Wasserzeichen → Druck-SVG beim Warenkorb-Klick zum Hub (`_design_id`) → Gelato/Heimdruck automatisch. Gleiche Produkte, gleiche Preise.
- **Einrichtung:** `assets/family.js` als `family.js` in die Theme-Assets kopieren; Shopify-Seite „Familien-Poster" mit Handle `familien-poster` und Template `page.familien-poster` anlegen.
- **Schrift für den Druck:** Die Handschrift-Motive (Rätsel-Pinsel, Figuren) nutzen die frei lizenzierte Schrift **Caveat**. Damit der Hub sie beim Rendern kennt, auf dem Hub-Server einmalig installieren:
  ```bash
  mkdir -p ~/.fonts && cd ~/.fonts
  curl -LO https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf
  fc-cache -f
  ```
  Ohne Caveat fällt das Rendering auf eine System-Schreibschrift zurück — funktioniert, sieht aber weniger charmant aus.

## 9. Status prüfen

```
GET https://DEIN-HUB/api/status
```
zeigt: aktueller Monatsumsatz, Schwelle, ob Heimdruck gerade aktiv ist, Etsy-Status.

---

## Checkliste bis „vollautomatisch"

- [ ] Hub deployed, `.env` ausgefüllt, `GET /health` liefert `{"ok":true}`
- [ ] Shopify-Webhook `orders/paid` zeigt auf den Hub
- [ ] Hub-URL in den Theme-Einstellungen eingetragen
- [ ] Gelato-API-Key + Produkt-UIDs eingetragen
- [ ] Testbestellung (Shopify-Testmodus/Bogus Gateway) → Gelato-Draft erscheint
- [ ] Print-Agent zuhause mit `DRY_RUN=1` getestet, dann produktiv
- [ ] Umsatzschwelle nach Wunsch gesetzt
- [ ] Etsy-Listing mit SKUs angelegt, `ETSY_ENABLED=true` (optional)
- [ ] Discord/Slack-Benachrichtigung eingerichtet (optional)
- [ ] SMTP eingetragen, Shopify-Seite `gratis-gruss` angelegt (Gratis-Grüße & Erinnerungen)
- [ ] Testlauf: Erinnerung mit Datum in 21 Tagen anlegen → Bestätigungslink klicken → Angebots-Mail kommt
