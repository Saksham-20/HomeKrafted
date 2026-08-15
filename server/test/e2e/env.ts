/**
 * Environment for the end-to-end suite, set **before** anything imports
 * `AppModule`.
 *
 * The ordering is not incidental: `AuthController`'s `@Throttle(...)`
 * decorator reads `process.env` when the module is first imported, the
 * same reason `main.ts` loads `dotenv/config` above its `AppModule`
 * import. Set from a `setupFiles` entry (which runs before the test file
 * itself) rather than inside a test, where it would already be too late.
 */

// A separate database, never the developer's own. `TEST_DATABASE_URL` is
// what CI sets; the local default matches `docker-compose.yml`'s
// credentials with a `_test` suffix, so running the suite locally cannot
// touch working data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://homekrafted:homekrafted@localhost:5432/homekrafted_test?schema=public';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';

// The suite signs a lot of users in. Rate limiting is real behaviour worth
// having, but throttling the tests would make failures depend on how many
// ran before them — so the budgets are raised here rather than the guard
// being removed, and one spec asserts the limiter still works.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_REVIEWS_LIMIT = '100000';

// The fixed test OTP code, scoped to two numbers — the shape production
// runs. Set here rather than in the spec because `otp-bypass.e2e-spec.ts`
// asserts on the *scoping*, and a spec that set its own allowlist would be
// asserting against its own fixture rather than against configuration.
process.env.OTP_TEST_CODE = '123456';
process.env.OTP_TEST_PHONES = '+919845000001,+919845000002';

// Social sign-in, pointed at a key set the suite controls.
//
// `SOCIAL_JWKS_URL_OVERRIDE` replaces only *where keys are fetched from*;
// issuer and audience are still checked against the real values, which is
// what keeps "a wrong-issuer token is refused" a meaningful assertion
// rather than something the harness switched off. `validateEnv` refuses
// to boot production with this set — `social-login.e2e-spec.ts` asserts
// that too, since it is the guard standing between a test convenience and
// a mint-your-own-Google bypass.
//
// Two Google ids on purpose: the audience check must accept a list, or
// the first native app build fails closed on every mobile sign-in.
process.env.GOOGLE_CLIENT_IDS =
  'e2e-web.apps.googleusercontent.com,e2e-ios.apps.googleusercontent.com';
process.env.APPLE_SERVICE_IDS = 'in.homekrafted.e2e';
process.env.SOCIAL_JWKS_URL_OVERRIDE = 'http://127.0.0.1:45677/jwks.json';

// Every outbound provider stays a logged stub. An e2e run must never be
// able to send a real WhatsApp message or charge a real card.
process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder';
process.env.RAZORPAY_KEY_SECRET = 'placeholder_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'placeholder_webhook_secret';
process.env.WHATSAPP_TOKEN = 'placeholder_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'placeholder_phone_number_id';
