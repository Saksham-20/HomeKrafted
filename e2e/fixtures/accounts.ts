/**
 * The seeded demo accounts, as documented in `docs/TESTING.md`.
 *
 * Deliberately read from the environment with these as defaults rather
 * than hardcoded-only: a password in a repo is a password in a repo, and
 * `CLAUDE.md`'s M17 rule ("no credential belongs in a client module") is
 * about the shipped bundle, not about tests — but the habit is worth
 * keeping. These are seed fixtures for a throwaway database and are
 * already public in `docs/TESTING.md`; if that ever stops being true, set
 * the env vars instead of editing this file.
 */
export const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!123';

export const ACCOUNTS = {
  consumer: {
    email: process.env.E2E_CONSUMER_EMAIL ?? 'ananya.iyer@example.com',
    password: DEMO_PASSWORD,
    role: 'consumer' as const,
  },
  seller: {
    email: process.env.E2E_SELLER_EMAIL ?? 'anjali@anjaliskitchen.example',
    password: DEMO_PASSWORD,
    role: 'seller' as const,
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@homekrafted.example',
    password: DEMO_PASSWORD,
    role: 'admin' as const,
  },
};

export type RoleName = keyof typeof ACCOUNTS;

/** Where each role's signed-in browser state is cached by `auth.setup.ts`. */
export const storageStateFor = (role: RoleName) => `./.auth/${role}.json`;
