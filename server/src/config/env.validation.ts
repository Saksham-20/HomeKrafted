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
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return env;
}
