import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent, scrubText } from '../../src/observability/sentry';

/**
 * What Sentry is allowed to leave the box with.
 *
 * **This is a privacy control, not a tidiness preference.** While
 * `TWILIO_*` and `SENDGRID_API_KEY` are placeholders, this server writes
 * working one-time sign-in codes to its own log, and Sentry's defaults
 * collect console output as breadcrumbs and request bodies as context. So
 * "turn on error monitoring" is one careless config away from streaming
 * live OTP codes, refresh tokens and home addresses to a third party.
 *
 * Every assertion below is a thing that must not appear in an outbound
 * event. If one of these starts failing, do not relax it — the reason it
 * exists is that the failure mode is silent and only visible from
 * outside.
 */
function eventWith(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { event_id: 'e1', ...overrides } as ErrorEvent;
}

describe('Sentry event scrubbing', () => {
  describe('what never leaves', () => {
    it('drops the request body wholesale', () => {
      const event = scrubEvent(
        eventWith({
          request: {
            url: 'https://homekrafted.in/api/v1/auth/otp/verify',
            data: { identifier: 'cook@example.com', code: '482915', password: 'hunter2' },
          },
        }),
      );
      expect(event?.request?.data).toBeUndefined();
    });

    it('drops the Authorization header and cookies', () => {
      const event = scrubEvent(
        eventWith({
          request: {
            url: 'https://homekrafted.in/api/v1/wallet',
            headers: {
              Authorization: 'Bearer eyJhbGciOi.a-real-access-token',
              Cookie: 'hk_role=admin',
              'user-agent': 'Mozilla/5.0',
            },
            cookies: { hk_role: 'admin' },
          },
        }),
      );
      expect(event?.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0' });
      expect(event?.request?.cookies).toBeUndefined();
    });

    it('drops breadcrumbs, which is where console output lands', () => {
      // The specific hazard: `SmsProviderService` logs the OTP when Twilio
      // is a stub, and a console breadcrumb would carry it verbatim.
      const event = scrubEvent(
        eventWith({
          breadcrumbs: [
            { category: 'console', message: 'OTP for +919845012345 is 482915' },
          ],
        }),
      );
      expect(event?.breadcrumbs).toBeUndefined();
    });

    it('reduces the user to an id', () => {
      const event = scrubEvent(
        eventWith({
          user: { id: 'user-1', email: 'buyer@example.com', ip_address: '203.0.113.9' },
        }),
      );
      expect(event?.user).toEqual({ id: 'user-1' });
    });

    it('redacts emails, phone numbers and codes inside exception text', () => {
      const event = scrubEvent(
        eventWith({
          exception: {
            values: [
              {
                type: 'Error',
                value:
                  'Failed sending to buyer@example.com at +91 9845012345 with code 482915',
              },
            ],
          },
        }),
      );
      const text = event?.exception?.values?.[0].value ?? '';
      expect(text).not.toMatch(/buyer@example\.com/);
      expect(text).not.toMatch(/9845012345/);
      expect(text).not.toMatch(/482915/);
    });

    it('redacts the query string', () => {
      const event = scrubEvent(
        eventWith({
          request: { url: '/api/v1/admin/users', query_string: 'q=buyer@example.com' },
        }),
      );
      expect(event?.request?.query_string).toBe('q=[email]');
    });
  });

  describe('what gets dropped entirely', () => {
    it('discards client errors so the quota survives bots and scanners', () => {
      // A public API collects 401s and 404s continuously. At a few
      // thousand events a month, letting those through means the one real
      // 500 arrives after the quota is spent.
      for (const status of [400, 401, 404, 429]) {
        expect(
          scrubEvent(eventWith({ contexts: { response: { status_code: status } } })),
        ).toBeNull();
      }
    });

    it('keeps server errors', () => {
      expect(
        scrubEvent(eventWith({ contexts: { response: { status_code: 500 } } })),
      ).not.toBeNull();
    });

    it('keeps an error with no status at all — an unexpected throw', () => {
      expect(scrubEvent(eventWith({}))).not.toBeNull();
    });
  });

  describe('scrubText', () => {
    it('leaves ordinary prose alone', () => {
      expect(scrubText('Order HK-ABC could not be packed')).toBe(
        'Order HK-ABC could not be packed',
      );
    });

    it('redacts a bare six-digit code', () => {
      expect(scrubText('code 482915 expired')).toBe('code [redacted] expired');
    });
  });
});
