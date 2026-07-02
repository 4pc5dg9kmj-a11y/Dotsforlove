import { config } from './config.js';
import { monthlyRevenue } from './db.js';

/**
 * Entscheidet pro Posten, wo gedruckt wird.
 *
 * Regel: Sobald der Bruttoumsatz des laufenden Monats die Schwelle
 * erreicht hat, werden alle konfigurierten Größen (Standard: A4, A3)
 * zuhause gedruckt — alles andere geht automatisch an Gelato.
 *
 * @param {string} size  Normalisierte Größe (A4, A3, 50X70, 70X100)
 * @returns {{route: 'home'|'gelato', reason: string}}
 */
export function decideRoute(size) {
  const hp = config.homePrint;

  if (!hp.enabled) {
    return { route: 'gelato', reason: 'Heimdruck deaktiviert' };
  }
  if (!hp.sizes.includes(size)) {
    return { route: 'gelato', reason: `Größe ${size} nicht für Heimdruck freigegeben` };
  }

  const revenue = monthlyRevenue();
  if (revenue >= hp.monthlyRevenueThreshold) {
    return {
      route: 'home',
      reason: `Monatsumsatz ${revenue.toFixed(2)} € ≥ Schwelle ${hp.monthlyRevenueThreshold} €`,
    };
  }
  return {
    route: 'gelato',
    reason: `Monatsumsatz ${revenue.toFixed(2)} € < Schwelle ${hp.monthlyRevenueThreshold} €`,
  };
}
