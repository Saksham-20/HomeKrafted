#!/usr/bin/env node
/**
 * Prove the courier account actually works, without booking a real order.
 *
 * The sibling of `send-test-email.mjs`, and for the same reason: the
 * alternative to a script like this is finding out on somebody's live
 * parcel. It reads `server/.env`, talks to whichever Shadowfax host that
 * points at, and reports what the account can and cannot do.
 *
 *   node scripts/verify-shadowfax.mjs            # read-only probes
 *   node scripts/verify-shadowfax.mjs --book     # + book and cancel one test parcel
 *
 * `--book` places a genuine order with the carrier and then cancels it.
 * Safe against staging (nothing physically moves there). Against the
 * production host it costs whatever a booking costs, so it asks first
 * unless `--yes` is also given.
 *
 * What it checks, in order:
 *
 *   1. Which host and which token are configured, and whether the token
 *      is the `.env.example` placeholder — in which case the whole module
 *      is in stub mode and none of this reaches a carrier.
 *   2. That the token authenticates at all (a staging token against the
 *      production host 401s, which is the single likeliest
 *      misconfiguration — the two environments issue different tokens).
 *   3. `seller_pickup` coverage for the launch city. Shadowfax's staging
 *      omits Chandigarh 160022; if production does too, every real
 *      booking fails into the despatch queue and somebody needs to know
 *      that before a kitchen is told a rider is coming.
 *   4. Optionally, a real create-order round trip on the carrier's own
 *      documented test pincodes.
 *
 * It deliberately does NOT touch our database. Nothing here can create a
 * `Consignment`, and a parcel booked by `--book` is the carrier's problem
 * and nobody else's.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '.env');
const PLACEHOLDER = 'placeholder_shadowfax_token';

/** The three pincodes Shadowfax staging actually serves. */
const STAGING_TEST_PINCODES = [110009, 560007, 560077];
/** Where this platform's kitchens actually are. */
const TRICITY_PINCODES = [160022, 160034, 140301, 134109];

function loadEnv(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    console.error(`Could not read ${path}. Run this on a box that has one.`);
    process.exit(1);
  }
  const env = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const token = (env.SHADOWFAX_API_TOKEN ?? '').trim();
const baseUrl = (env.SHADOWFAX_BASE_URL ?? 'https://dale.staging.shadowfax.in/api').replace(/\/$/, '');
const enabled = (env.SHADOWFAX_ENABLED ?? '').trim() === 'true';
const callbackToken = (env.SHADOWFAX_CALLBACK_TOKEN ?? '').trim();
const isProdHost = !baseUrl.includes('staging');

const args = new Set(process.argv.slice(2));
const wantBook = args.has('--book');
const assumeYes = args.has('--yes');

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const note = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);

console.log('\nShadowfax account check');
console.log('───────────────────────');
note(`host             ${baseUrl}  ${isProdHost ? '(PRODUCTION)' : '(staging)'}`);
note(`token            ${token ? `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)` : '(unset)'}`);
note(`SHADOWFAX_ENABLED ${enabled}`);
note(`callback token   ${callbackToken ? `set (${callbackToken.length} chars)` : '\x1b[31mUNSET — every callback is refused\x1b[0m'}`);
note(`poll seconds     ${env.SHADOWFAX_POLL_SECONDS ?? '0'}`);
console.log();

if (!token || token === PLACEHOLDER) {
  bad('The token is unset or is the .env.example placeholder.');
  note('The whole module is in STUB mode: bookings mint a fake AWB locally');
  note('and no request ever reaches a carrier. Nothing below can be checked.');
  process.exit(1);
}
if (isProdHost && !enabled) {
  note('SHADOWFAX_ENABLED is false, so nothing books today even though the');
  note('credentials below may be perfectly good. That is a separate switch.');
}

async function call(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

let failures = 0;

// ── 1. Does the token authenticate? ─────────────────────────────────────
console.log('Authentication');
const probe = await call(
  `/v1/clients/serviceability/?service=customer_delivery&page=1&count=10&pincodes=${STAGING_TEST_PINCODES[0]}`,
).catch((err) => ({ status: 0, body: { message: String(err) } }));

if (probe.status === 401 || probe.status === 403) {
  failures += 1;
  bad(`${probe.status} — the token is not valid for this host.`);
  note('Staging and production issue DIFFERENT tokens. A staging token');
  note('against dale.shadowfax.in returns exactly this.');
} else if (probe.status === 0) {
  failures += 1;
  bad(`unreachable: ${probe.body.message}`);
} else if (probe.status >= 400) {
  failures += 1;
  bad(`HTTP ${probe.status}: ${JSON.stringify(probe.body).slice(0, 200)}`);
} else {
  ok(`authenticated (HTTP ${probe.status})`);
}
console.log();

// ── 2. Can a rider collect from our kitchens? ───────────────────────────
if (!failures) {
  console.log('seller_pickup coverage — where our kitchens are');
  const res = await call(
    `/v1/clients/serviceability/?service=seller_pickup&page=1&count=20&pincodes=${TRICITY_PINCODES.join(',')}`,
  );
  const served = new Set((Array.isArray(res.body) ? res.body : []).map((r) => r.code));
  for (const pin of TRICITY_PINCODES) {
    if (served.has(pin)) ok(`${pin} — collected`);
    else bad(`${pin} — NOT in the response, so the carrier will not collect here`);
  }
  if (!TRICITY_PINCODES.some((p) => served.has(p))) {
    note('');
    note('None of the launch city is covered for pickup. Read this as');
    note('advisory, not final — this endpoint disagrees with the booking');
    note('endpoint in both directions (it calls 999999 serviceable), which');
    note('is why the server never gates a booking on it. But if --book');
    note('below also refuses, the coverage gap is real and Shadowfax has');
    note('to widen it in their client portal before anything ships.');
  }
  console.log();
}

// ── 3. A real round trip. ──────────────────────────────────────────────
if (wantBook && !failures) {
  if (isProdHost && !assumeYes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      '  This books a REAL parcel on the production carrier account, then cancels it.\n  Type "book" to continue: ',
    );
    rl.close();
    if (answer.trim() !== 'book') {
      note('Skipped.');
      process.exit(failures ? 1 : 0);
    }
  }

  console.log('Create-order round trip');
  const clientOrderId = `HK-VERIFY-${Date.now()}`;
  // The carrier's own documented test pincodes, so a refusal here is
  // about the account and never about coverage.
  const addr = (name, pincode) => ({
    name,
    contact: '9845000001',
    address_line_1: '12 Test Street',
    city: 'Delhi',
    state: 'Delhi',
    pincode,
  });
  const payload = {
    order_type: 'marketplace',
    order_details: {
      client_order_id: clientOrderId,
      product_value: 100,
      cod_amount: 0,
      payment_mode: 'Prepaid',
    },
    customer_details: addr('Verification Buyer', STAGING_TEST_PINCODES[0]),
    pickup_details: addr('Verification Kitchen', STAGING_TEST_PINCODES[0]),
    rts_details: addr('Verification Kitchen', STAGING_TEST_PINCODES[0]),
    product_details: [{ sku_name: 'Verification parcel', price: 100, additional_details: { quantity: 1 } }],
  };

  const created = await call('/v3/clients/orders/', { method: 'POST', body: JSON.stringify(payload) });
  const awb = created.body?.data?.awb_number;
  if (!awb) {
    failures += 1;
    // A refusal is HTTP 200 with {"message":"Failure","errors":"…"}. The
    // presence of an AWB is the check, never res.ok.
    bad(`refused (HTTP ${created.status}): ${JSON.stringify(created.body?.errors ?? created.body).slice(0, 300)}`);
  } else {
    ok(`booked — AWB ${awb}`);

    const tracked = await call(`/v4/clients/orders/${encodeURIComponent(awb)}/track/`);
    if (tracked.body?.order_details) {
      ok(`tracked — status "${tracked.body.order_details.status ?? '?'}"`);
      note(`customer_track_url: ${tracked.body.order_details.customer_track_url ?? '(null — normal on staging)'}`);
    } else {
      bad(`track returned nothing usable: ${JSON.stringify(tracked.body).slice(0, 200)}`);
    }

    const cancelled = await fetch(`${baseUrl}/v3/clients/orders/cancel/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
      body: JSON.stringify({ request_id: awb, cancel_remarks: 'Automated account verification' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (cancelled.status === 304) ok('cancellation queued (304 — the parcel was already moving)');
    else if (cancelled.ok) ok('cancelled');
    else {
      failures += 1;
      bad(`cancel failed: HTTP ${cancelled.status} — AWB ${awb} is still live, call it off by hand`);
    }
  }
  console.log();
} else if (!wantBook) {
  note('Pass --book to also place and cancel one real test parcel.\n');
}

console.log(failures ? `\x1b[31m${failures} check(s) failed.\x1b[0m\n` : '\x1b[32mAll checks passed.\x1b[0m\n');
process.exit(failures ? 1 : 0);
