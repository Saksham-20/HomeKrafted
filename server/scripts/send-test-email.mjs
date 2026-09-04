#!/usr/bin/env node
/**
 * Send one real email through whatever this box is configured with.
 *
 *   cd server && node scripts/send-test-email.mjs you@example.com
 *
 * Exists because every other way of finding out whether email works
 * involves triggering a real event — approving a HomeKrafter, asking for
 * a password reset — and the failure modes that matter (an unverified
 * sending domain, a revoked key, a typo in EMAIL_FROM) all look identical
 * from outside: nothing arrives. This prints the provider's own answer.
 *
 * It reads `server/.env`, so it tests the configuration the API will
 * actually use, not a copy of it.
 */
import 'dotenv/config';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/send-test-email.mjs <recipient@example.com>');
  process.exit(2);
}

const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
const sendgridKey = (process.env.SENDGRID_API_KEY ?? '').trim();
const explicit = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
const provider =
  explicit === 'sendgrid' || (explicit !== 'resend' && !resendKey && sendgridKey) ? 'sendgrid' : 'resend';
const key = provider === 'resend' ? resendKey : sendgridKey;
const from = process.env.EMAIL_FROM ?? '';

const PLACEHOLDERS = ['placeholder_resend_key', 'placeholder_sendgrid_key'];
if (!key || PLACEHOLDERS.includes(key)) {
  console.error(
    `No usable ${provider === 'resend' ? 'RESEND_API_KEY' : 'SENDGRID_API_KEY'} in server/.env — ` +
      'the app is in stub mode and sends nothing.',
  );
  process.exit(1);
}
if (!from) {
  console.error('EMAIL_FROM is empty. Every send would be refused by the provider.');
  process.exit(1);
}

const subject = 'Homekrafted email test';
const text = `This is a test from ${provider}. If you can read this, the API key, the from address and the domain verification are all correct.`;

console.log(`provider=${provider} from="${from}" to=${to}`);

const res =
  provider === 'resend'
    ? await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
      })
    : await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.replace(/^.*<|>.*$/g, '') },
          subject,
          content: [{ type: 'text/plain', value: text }],
        }),
      });

const body = await res.text();
if (!res.ok) {
  // The provider's own words, unedited. "Domain not verified" and
  // "invalid API key" are the two real answers and they need different
  // fixes.
  console.error(`FAILED ${res.status}: ${body}`);
  process.exit(1);
}
console.log(`OK ${res.status}: ${body || '(no body)'}`);
