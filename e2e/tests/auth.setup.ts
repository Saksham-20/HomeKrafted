import { test as setup, expect } from '@playwright/test';
import { ACCOUNTS, RoleName, storageStateFor } from '../fixtures/accounts';
import { signIn } from '../fixtures/sign-in';

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
 *
 * **And it is load-bearing in a way that hides its own failure.** Both
 * viewport projects declare `dependencies: ['setup']`, so when this file
 * breaks they do not fail — they **skip**, and the run prints "0 failed".
 * That is how it went unnoticed from M25 (which deleted the two-tab form
 * these steps were driving) until the 2026-08-08 review. The form
 * selectors now live in one fixture that throws a diagnosis instead of
 * timing out; see `fixtures/sign-in.ts`.
 */

async function signInAs(page: import('@playwright/test').Page, role: RoleName) {
  const account = ACCOUNTS[role];

  // Always the same URL. Since M25 there is no role tab and no
  // `?role=seller` pane — where you land is decided by the account, which
  // makes "go to /login as a seller and end up in /seller" a real
  // assertion rather than a restatement of a query parameter.
  await page.goto('/login');
  await signIn(page, { identifier: account.email, password: account.password });
}

setup('sign in as a shopper', async ({ page }) => {
  await signInAs(page, 'consumer');
  await expect(page).toHaveURL(/\/account/);
  await page.context().storageState({ path: storageStateFor('consumer') });
});

setup('sign in as a HomeKrafter, and land in the portal on the account alone', async ({ page }) => {
  await signInAs(page, 'seller');
  await expect(page).toHaveURL(/\/seller/);
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
