import { sleep } from 'k6';
import { get, authHeaderFor, thresholds, rampStages } from './lib.js';

/**
 * The realistic blend: mostly anonymous browsing, some signed-in reads.
 *
 * Weighted the way a marketplace actually behaves — far more people look
 * than buy. A flat mix across every endpoint would measure something no
 * real hour of traffic resembles.
 *
 * **No write path here.** `checkout.js` is separate and deliberately not
 * part of the ramp: an order is idempotent per key but not per run, so a
 * thousand VUs placing orders fills a real database with real rows and
 * debits real wallets. Run it against a throwaway database, on purpose,
 * rather than by forgetting.
 */
export const options = { stages: rampStages, thresholds };

const EMAIL = __ENV.LOAD_EMAIL || 'ananya.iyer@example.com';
const PASSWORD = __ENV.LOAD_PASSWORD || 'Passw0rd!123';

export function setup() {
  // Once for the whole run, not per VU — see `authHeaderFor`.
  return { auth: authHeaderFor(EMAIL, PASSWORD) };
}

export default function (data) {
  const roll = Math.random();

  if (roll < 0.55) {
    get('/products?pageSize=20');
  } else if (roll < 0.75) {
    get('/products?q=pickle&pageSize=20');
  } else if (roll < 0.85) {
    get('/categories');
  } else if (roll < 0.95) {
    get('/vendors');
  } else if (data.auth) {
    // The signed-in tail: the wallet screen and its ledger page.
    get('/wallet', data.auth);
    get('/wallet/transactions', data.auth);
  }

  sleep(1);
}
