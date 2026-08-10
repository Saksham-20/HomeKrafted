/**
 * Fail-fast env validation, run by `@nestjs/config` at boot
 * (`ConfigModule.forRoot({ validate })`). Missing/weak secrets in
 * production stop the app from starting rather than silently running
 * insecure — see `docs/ARCHITECTURE.md`'s security model.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    if (!env[key] || String(env[key]).trim() === '') {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    const weakDefaults = ['dev-only-access-secret-change-me', 'dev-only-refresh-secret-change-me'];
    if (weakDefaults.includes(String(env.JWT_ACCESS_SECRET))) {
      errors.push('JWT_ACCESS_SECRET is still the dev placeholder — set a real secret in production.');
    }
    if (weakDefaults.includes(String(env.JWT_REFRESH_SECRET))) {
      errors.push('JWT_REFRESH_SECRET is still the dev placeholder — set a real secret in production.');
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
    }

    // A test knob that redirects where provider signing keys are fetched
    // from is an authentication bypass: whoever sets it can mint tokens
    // that verify as Google's. It exists so the e2e suite can serve its
    // own JWKS, and it must never reach a box that real people sign in to.
    if (env.SOCIAL_JWKS_URL_OVERRIDE && String(env.SOCIAL_JWKS_URL_OVERRIDE).trim() !== '') {
      errors.push(
        'SOCIAL_JWKS_URL_OVERRIDE is set. It redirects social-provider key fetching and is a sign-in bypass — it is for tests only and must be unset in production.',
      );
    }
  }

  // Cloud storage: fail at boot with the missing variable named, rather
  // than on the first upload a HomeKrafter attempts. The driver would
  // otherwise construct fine and only throw once somebody photographs a
  // jar of pickle, which is the worst moment to discover a config gap.
  if (env.STORAGE_DRIVER === 'gcs') {
    if (!env.GCS_BUCKET || String(env.GCS_BUCKET).trim() === '') {
      errors.push('STORAGE_DRIVER=gcs requires GCS_BUCKET.');
    }
    const hasKeyFile = env.GCS_KEY_FILE && String(env.GCS_KEY_FILE).trim() !== '';
    const hasInlineKey = env.GCS_CREDENTIALS_JSON && String(env.GCS_CREDENTIALS_JSON).trim() !== '';
    if (!hasKeyFile && !hasInlineKey) {
      errors.push(
        'STORAGE_DRIVER=gcs requires credentials: set GCS_KEY_FILE (a path) or GCS_CREDENTIALS_JSON (the key inline).',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return env;
}
