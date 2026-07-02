import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { config, SIZE_MM } from './config.js';

/**
 * Rendert ein SVG-Design als PNG mit 300 DPI in der Zielgröße.
 * Gelato und der Heimdrucker erhalten diese Datei.
 * Ergebnisse werden gecacht (renders/<designId>-<size>.png).
 */
export async function renderPng(designId, svgPath, size) {
  const dims = SIZE_MM[size];
  if (!dims) throw new Error(`Unbekannte Größe: ${size}`);

  const outPath = path.join(config.dataDir, 'renders', `${designId}-${size}.png`);
  if (fs.existsSync(outPath)) return outPath;

  // 300 DPI: mm → inch → px
  const widthPx = Math.round((dims.w / 25.4) * 300);

  const svgBuffer = fs.readFileSync(svgPath);
  await sharp(svgBuffer, { density: 300, limitInputPixels: false })
    .resize({ width: widthPx })
    .png({ compressionLevel: 8 })
    .toFile(outPath);

  return outPath;
}
