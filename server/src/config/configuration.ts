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
  throttle: {
    ttlSeconds: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
    authTtlSeconds: parseInt(process.env.THROTTLE_AUTH_TTL_SECONDS ?? '60', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '5', 10),
  },
});
