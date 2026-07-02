# Dots for Love – Personalisierte Dot-Art Poster

Ein vollständiges Shop-Konzept für personalisierte Poster aus Punkten, Herzen und Symbolen – bereit für die Integration in Shopify.

---

## Projektstruktur

```
Dotsforlove/
├── index.html                    ← Landing Page (Standalone)
├── configurator.html             ← Poster-Konfigurator (Standalone)
├── assets/
│   ├── style.css                 ← Globales Stylesheet
│   ├── configurator.js           ← Dot-Pattern-Generator (Kernlogik)
│   └── app.js                    ← UI-Controller & Shopify-Integration
└── shopify/
    ├── layout/
    │   └── theme.liquid          ← Shopify Theme-Layout
    ├── sections/
    │   ├── hero.liquid           ← Hero-Sektion (konfigurierbar)
    │   ├── product-configurator.liquid  ← Konfigurator-Sektion
    │   └── announcement-bar.liquid     ← Ankündigungsleiste
    ├── templates/
    │   ├── index.liquid          ← Homepage-Template
    │   └── page.poster-gestalten.liquid ← Konfigurator-Seite
    ├── config/
    │   └── settings_schema.json  ← Theme-Einstellungen
    └── ...
├── fulfillment/                  ← Fulfillment-Hub (Auto-Druck: Gelato/Etsy/Heimdruck)
│   └── src/                      ← siehe AUTOMATISIERUNG.md
└── print-agent/                  ← Heimdruck-Agent für PC/Raspberry Pi
```

---

## Features

### Konfigurator
- **Bild-Upload** via Drag & Drop oder Dateiauswahl
- **5 Symbolformen**: Punkte ●, Herzen ♥, Quadrate ■, Kreuze ✚, Dreiecke ▲
- **Farbmodi**: 1 Farbe oder 3 Farben (Schatten/Mitteltöne/Lichter)
- **Punkte-Definitionen**:
  - Manuelle Eingabe (100–20.000)
  - Jahre → Tage (mit Schaltjahr-Berechnung)
  - Datum-Zeitraum (exakte Tagesberechnung)
- **Posterformate**: DIN A4, A3, A2, A1 · 30×40, 50×70, 70×100 cm
- **Ausrichtung**: Hoch- oder Querformat
- **Vorschau**: Canvas-basiert mit Wasserzeichen-Schutz

### Technische Details
- **Ausgabe**: SVG-Vektordatei (unendlich skalierbar, druckfertig)
- **Algorithmus**: Helligkeitsbasiertes Halftone-Verfahren
  - Pixelhelligkeit → Symbolfarbe (dunkel = Grundfarbe, hell = Richtung Weiß)
  - Alle Symbole gleich groß, unterscheiden sich in der Helligkeit
- **Kopier-Schutz**: Canvas-Rendering (keine direkten Bild-URLs), Wasserzeichen

---

## Shopify-Integration

### 1. Theme-Dateien kopieren

Kopiere den Inhalt des `/shopify/` Ordners in dein Shopify-Theme:

```bash
# Über Shopify CLI:
shopify theme push --path=./shopify --store=dein-shop.myshopify.com
```

### 2. Assets übertragen

Kopiere `assets/style.css` → `shopify/assets/theme.css`
Kopiere `assets/configurator.js` → `shopify/assets/configurator.js`
Kopiere `assets/app.js` → `shopify/assets/theme.js`

### 3. Produkte in Shopify anlegen

Lege für jede Postergröße ein Produkt oder eine Variante an:

| Größe    | Empfohlener Preis | Varianten-ID in Einstellungen |
|----------|-------------------|-------------------------------|
| DIN A4   | 19,90 €           | `variant_id_a4`               |
| DIN A3   | 29,90 €           | `variant_id_a3`               |
| DIN A2   | 44,90 €           | `variant_id_a2`               |
| DIN A1   | 69,90 €           | `variant_id_a1`               |
| 30×40 cm | 34,90 €           | `variant_id_30x40`            |
| 50×70 cm | 54,90 €           | `variant_id_50x70`            |
| 70×100 cm| 79,90 €           | `variant_id_70x100`           |

### 4. Varianten-IDs eintragen

Gehe in Shopify Admin → **Online-Shop → Themes → Einstellungen anpassen** → „Shopify Varianten-IDs" und trage die IDs ein.

### 5. Konfigurator-Seite erstellen

1. Erstelle eine neue Seite: **Online-Shop → Seiten → Seite hinzufügen**
2. Titel: „Poster gestalten"
3. Handle: `poster-gestalten`
4. Template: `page.poster-gestalten`

### 6. Vollautomatisches Fulfillment ✨

Das Fulfillment ist fertig implementiert — siehe **[AUTOMATISIERUNG.md](AUTOMATISIERUNG.md)**:

```
fulfillment/     ← Fulfillment-Hub (Node.js-Server)
                    • nimmt Kundendesigns vom Konfigurator entgegen
                    • Shopify-Webhook orders/paid
                    • rendert 300-DPI-Druckdateien aus dem SVG
                    • Gelato-API: automatischer Druck + Versand weltweit
                    • Etsy-Connector: Bestellungen automatisch abholen
                    • Umsatz-Routing: A4/A3 ab Monatsumsatz-Schwelle → Heimdruck

print-agent/     ← Heimdruck-Agent (läuft zuhause am Drucker)
                    • holt Jobs vom Hub, druckt via CUPS (A4/A3)
                    • markiert Shopify-Bestellungen automatisch als erfüllt
```

**Ablauf:** Kunde gestaltet Poster → finales SVG wird beim „In den Warenkorb" zum Hub hochgeladen (`_design_id` in der Bestellung) → Bestellung bezahlt → Hub entscheidet automatisch: Gelato oder dein Drucker zuhause.

---

## Lokale Entwicklung

Öffne einfach `index.html` im Browser:

```bash
cd Dotsforlove
# macOS/Linux:
open index.html
# oder mit einem lokalen Server:
npx serve .
```

Für den Konfigurator: `configurator.html`

---

## Algorithmus – Wie funktioniert die Punktegeneration?

```
1. Bild laden & auf max. 1200px downsamplen
2. Raster berechnen:
   - Aspect-Ratio des Posters bestimmt cols/rows
   - totalDots ≈ numDots (cols × rows)
3. Für jede Gitterzelle:
   a. Pixel-Position aus normierter Koordinate berechnen
   b. Perceptual Luminance samplen (3×3 Durchschnitt)
   c. Helligkeit → Füllfarbe mappen:
      - 1 Farbe: Grundfarbe + weiß-Anteil proportional zur Helligkeit
      - 3 Farben: Dunkel=Farbe1, Mittel=Farbe2, Hell=Farbe3
   d. Symbol an Position (cx, cy) mit einheitlichem Radius zeichnen
4. Ausgabe als SVG (mm-Einheiten für Druckgenauigkeit)
```

---

## Lizenz

Proprietär – Dots for Love. Alle Rechte vorbehalten.
