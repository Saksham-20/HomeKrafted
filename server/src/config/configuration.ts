/**
 * Typed config shape read via `@nestjs/config`'s `ConfigService`. Values
 * come from `process.env` (populated from `.env` in dev, real env vars in
 * prod) — see `.env.example` for every key + its purpose.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  clientOrigin: string[];
  /**
   * Public origin of the web app, for links the server *sends* (password
   * reset today). Distinct from `clientOrigin`, which is a CORS allowlist
   * and may hold several entries — a link needs exactly one, and it must
   * be the canonical one, so it gets its own key rather than
   * `clientOrigin[0]`.
   */
  siteUrl: string;
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  otp: {
    ttlSeconds: number;
    /** Named `codeLength`, not `length` — a nested config key literally
     * named `length` breaks `@nestjs/config`'s typed dotted-path inference
     * (it collides with `Array`/`String`'s built-in `.length`). */
    codeLength: number;
    /**
     * A fixed code that verifies without a real SMS, for testing the OTP
     * flow while `TWILIO_*` is still a placeholder.
     *
     * **Only ever accepted for a number in `testPhones`.** A bypass that
     * worked for any number would be a total authentication bypass: phone
     * OTP creates the account if none exists, so one guessed code would
     * sign the guesser in as *anybody*, including a HomeKrafter whose
     * payouts they could then redirect. Both halves must be set or the
     * bypass stays off. `OtpService` additionally refuses to apply it to
     * an admin account.
     */
    testCode: string;
    /** E.164-ish phone numbers the `testCode` is accepted for. Empty = bypass disabled. */
    testPhones: string[];
  };
  social: {
    /**
     * Google OAuth client ids accepted as the `aud` of an id-token.
     *
     * A **list**, because `server/` is shared with the native apps and
     * Google issues one client id per platform. The first entry is the
     * web one and is what `GET /auth/social/config` hands the browser.
     * Empty = Google sign-in is off: the endpoint answers 503 and no
     * button renders.
     */
    google: { clientIds: string[] };
    /** Apple Services ids, same shape and same rules as Google's. */
    apple: { serviceIds: string[] };
    /**
     * Points JWKS fetching at a local key set so the e2e suite can mint
     * tokens it controls. **Refused in production by `validateEnv`** — a
     * knob that redirects where signing keys come from is a mint-your-own
     * -Google bypass, which is precisely the hole this whole feature
     * exists to close. It replaces only the URL; issuer and audience stay
     * real, so "a wrong-issuer token is refused" stays testable.
     */
    jwksUrlOverride: string;
  };
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  };
  whatsapp: {
    token: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
    apiVersion: string;
    /** Optional approved template name for status sends — falls back to a plain-text message when unset (see `WhatsAppService`). */
    statusTemplate: string;
  };
  sms: {
    /** Twilio-shaped (Account SID / Auth Token / from-number) — MSG91's REST shape is an equivalent swap behind the same `SmsProviderService.send`. */
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
  email: {
    /** SendGrid-shaped (Bearer API key) — an SMTP transport is a drop-in alternative behind the same `EmailProviderService.send`. */
    apiKey: string;
    fromAddress: string;
  };
  throttle: {
    ttlSeconds: number;
    limit: number;
    authTtlSeconds: number;
    authLimit: number;
  };
  uploads: {
    /** `local` today. Any other value must have a driver registered in `UploadsModule` or boot fails loudly. */
    driver: string;
    /** Absolute path for the `local` driver. Keep it OUTSIDE the git clone — deploys reset the clone. */
    dir: string;
    /** URL prefix nginx maps to `dir`. Also the prefix stored in the database. */
    publicPrefix: string;
    maxBytes: number;
    gcs: {
      bucket: string;
      /**
       * Public origin the bucket is served from, no trailing slash.
       * Defaults to `https://storage.googleapis.com/<bucket>`; set it to a
       * custom domain once Cloud CDN is in front, which is also where the
       * `nosniff`/CSP response headers nginx adds today get restored.
       */
      publicBaseUrl: string;
      /** Path to a service-account key file. Mutually exclusive with `credentialsJson`. */
      keyFile: string;
      /** The key itself, inline — friendlier under pm2 than shipping a file. */
      credentialsJson: string;
      projectId: string;
    };
  };
}

/** Comma-separated env value → trimmed, non-empty entries. */
function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  siteUrl: (process.env.SITE_URL ?? process.env.CLIENT_ORIGIN?.split(',')[0] ?? 'http://localhost:3000')
    .trim()
    .replace(/\/$/, ''),
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
    codeLength: parseInt(process.env.OTP_LENGTH ?? '6', 10),
    testCode: process.env.OTP_TEST_CODE ?? '',
    testPhones: (process.env.OTP_TEST_PHONES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  social: {
    google: { clientIds: csv(process.env.GOOGLE_CLIENT_IDS) },
    apple: { serviceIds: csv(process.env.APPLE_SERVICE_IDS) },
    jwksUrlOverride: (process.env.SOCIAL_JWKS_URL_OVERRIDE ?? '').trim(),
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    statusTemplate: process.env.WHATSAPP_STATUS_TEMPLATE ?? '',
  },
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  },
  email: {
    apiKey: process.env.SENDGRID_API_KEY ?? '',
    fromAddress: process.env.EMAIL_FROM ?? 'notifications@homekrafted.example',
  },
  throttle: {
    ttlSeconds: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    authTtlSeconds: parseInt(process.env.THROTTLE_AUTH_TTL_SECONDS ?? '60', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '20', 10),
  },
  uploads: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    dir: process.env.UPLOAD_DIR ?? '/var/lib/homekrafted/uploads',
    publicPrefix: (process.env.UPLOAD_PUBLIC_PREFIX ?? '/uploads').replace(/\/$/, ''),
    // 12MB. Deliberately generous, because nothing this size is ever
    // stored: `image-pipeline.ts` re-encodes every accepted upload down to
    // a capped WebP first. The limit is an abuse ceiling, not a storage
    // budget, and 5MB used to reject an ordinary photo off a phone.
    maxBytes: parseInt(process.env.UPLOAD_MAX_BYTES ?? '12582912', 10),
    gcs: {
      bucket: (process.env.GCS_BUCKET ?? '').trim(),
      publicBaseUrl: (
        process.env.GCS_PUBLIC_BASE_URL ??
        (process.env.GCS_BUCKET ? `https://storage.googleapis.com/${process.env.GCS_BUCKET.trim()}` : '')
      )
        .trim()
        .replace(/\/$/, ''),
      keyFile: (process.env.GCS_KEY_FILE ?? '').trim(),
      credentialsJson: (process.env.GCS_CREDENTIALS_JSON ?? '').trim(),
      projectId: (process.env.GCS_PROJECT_ID ?? '').trim(),
    },
  },
});
