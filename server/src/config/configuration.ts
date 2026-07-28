/**
 * Typed config shape read via `@nestjs/config`'s `ConfigService`. Values
 * come from `process.env` (populated from `.env` in dev, real env vars in
 * prod) — see `.env.example` for every key + its purpose.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  clientOrigin: string[];
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
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
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
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
    authTtlSeconds: parseInt(process.env.THROTTLE_AUTH_TTL_SECONDS ?? '60', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '5', 10),
  },
});
