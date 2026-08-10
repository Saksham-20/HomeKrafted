import * as Sentry from '@sentry/nestjs';

/**
 * Error reporting, initialised before anything else imports `AppModule`.
 *
 * **Unset `SENTRY_DSN` means this does nothing**, the same shape as every
 * other provider on this server: no crash, no warning spam, no behaviour
 * change. That is what makes it safe to merge before an account exists.
 *
 * ## What is deliberately NOT sent, and why it matters here specifically
 *
 * This system logs OTP codes. That is not an accident — `SmsProviderService`
 * and `EmailProviderService` degrade to logged stubs while `TWILIO_*` and
 * `SENDGRID_API_KEY` are placeholders, so a working sign-in code exists in
 * the server log on every request. Sentry's defaults would attach console
 * output as breadcrumbs and request bodies as context, which means turning
 * it on naively would start streaming live sign-in codes, refresh tokens
 * and home addresses to a third party. The whole point of `beforeSend`
 * below is that this cannot happen by default and cannot be undone by
 * accident — `sentry-scrub.spec.ts` fails if it is.
 *
 * ## Why errors only
 *
 * No tracing, no profiling, no session replay. The box is 1 vCPU running
 * Next, the API and Postgres together; tracing is the expensive part and
 * the question being answered here is "did a customer hit a 500 on
 * checkout", which needs an exception and a stack.
 */

/** Header names never sent, regardless of Sentry's own defaults. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'idempotency-key',
]);

/** Roughly-an-email and roughly-a-phone, for scrubbing free text. */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g;
/** Any run of 4-8 digits standing alone — an OTP code, if one ever leaks into a message. */
const OTP_RE = /\b\d{4,8}\b/g;

export function scrubText(value: string): string {
  return value
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(OTP_RE, '[redacted]');
}

/**
 * The `beforeSend` hook, exported so it can be tested without a live DSN.
 *
 * Returns `null` to drop the event entirely, or the event with everything
 * sensitive removed.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Client errors are not our bugs and would drown the quota — a public
  // API collects bot 401s and scanner 404s continuously. Anything without
  // a status is an unexpected throw, which is exactly what we want.
  const status = extractStatus(event);
  if (status !== undefined && status < 500) return null;

  if (event.request) {
    // The body can hold a password, a card token, an OTP code or an
    // address. None of it helps debug a 500 enough to justify sending it.
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
          delete event.request.headers[name];
        }
      }
    }
    if (event.request.query_string && typeof event.request.query_string === 'string') {
      event.request.query_string = scrubText(event.request.query_string);
    }
  }

  // Breadcrumbs are where console output lands, and console output on this
  // server contains OTP codes. Dropped wholesale rather than filtered:
  // an allowlist would need updating every time somebody adds a log line.
  event.breadcrumbs = undefined;

  if (event.message) event.message = scrubText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
  }

  // A signed-in user's id is useful and not personal; their email and IP are.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}

function extractStatus(event: Sentry.ErrorEvent): number | undefined {
  const raw =
    (event.contexts?.response as { status_code?: number } | undefined)?.status_code ??
    (event.tags?.['http.status_code'] as number | string | undefined);
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return typeof parsed === 'number' && !Number.isNaN(parsed) ? parsed : undefined;
}

/**
 * Call once, from `instrument.ts`, before `AppModule` is imported.
 *
 * Returns whether it actually armed, so boot logging can say so — a
 * silently-inert error reporter is the failure mode this whole file is
 * arranged to avoid.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    // Never attach IPs, emails or usernames automatically.
    sendDefaultPii: false,
    // Errors only — see the file header.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    // Belt to `event.breadcrumbs = undefined`'s braces: stop console
    // output being collected in the first place.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== 'Console' && i.name !== 'Http'),
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
  });

  return true;
}
