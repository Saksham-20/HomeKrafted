import { test as setup, expect } from '@playwright/test';
import { ACCOUNTS, RoleName, storageStateFor } from '../fixtures/accounts';

/**
 * Signs each role in once and caches the browser state, so the specs that
 * follow start signed in instead of paying for a login apiece.
 *
 * **These are also the first real assertions.** `/admin/login` once called
 * a hardcoded-credential helper and threw the typed inputs away, handing
 * full admin to anyone who opened a publicly routable page (`CLAUDE.md`,
 * M17). A setup step that logs in and checks *which account it became* is
 * the cheapest possible guard against that returning — and unlike a unit
 * test, it goes through the real form.
 */

async function signInConsumerOrSeller(page: import('@playwright/test').Page, role: RoleName) {
  const account = ACCOUNTS[role];
  await page.goto(role === 'seller' ? '/login?role=seller' : '/login');

  // Phone OTP is the default tab, and must stay offered — an approved
  // HomeKrafter may have no password at all (`CLAUDE.md`, M17). These
  // seeded accounts do, so switch to the email tab.
  await page.getByRole('tab', { name: 'Email', exact: true }).click();

  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  // The two role panes label their submit differently — "Continue with
  // email" for a shopper, "Sign in to sell" for a HomeKrafter.
  await page
    .getByRole('button', { name: role === 'seller' ? /sign in to sell/i : /continue with email/i })
    .click();

  await expect(page).toHaveURL(role === 'seller' ? /\/seller/ : /\/account/);
}

setup('sign in as a shopper', async ({ page }) => {
  await signInConsumerOrSeller(page, 'consumer');
  await page.context().storageState({ path: storageStateFor('consumer') });
});

setup('sign in as a HomeKrafter', async ({ page }) => {
  await signInConsumerOrSeller(page, 'seller');
  await page.context().storageState({ path: storageStateFor('seller') });
});

setup('sign in as an admin, using what was typed', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/work email/i).fill(ACCOUNTS.admin.email);
  await page.getByLabel(/password/i).fill(ACCOUNTS.admin.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/admin(?!\/login)/);

  // The form's inputs have to be the ones that were used. If this page
  // ever goes back to signing in a hardcoded account, it still lands on
  // `/admin` — so assert the session belongs to the email that was typed,
  // read from the app's own stored session rather than from the URL.
  const sessionEmail = await page.evaluate(() => {
    // `hk_session_v1` is where `lib/auth/session.ts` keeps the tokens and
    // the user snapshot. `hk_auth_v1` is the separate UI-state store and
    // holds only `{ signedIn, role }` — no identity.
    const raw = window.localStorage.getItem('hk_session_v1');
    return raw ? (JSON.parse(raw).user?.email ?? null) : null;
  });
  expect(sessionEmail).toBe(ACCOUNTS.admin.email);

  await page.context().storageState({ path: storageStateFor('admin') });
});
