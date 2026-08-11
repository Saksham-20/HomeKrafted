import { test, expect } from '@playwright/test';
import { ACCOUNTS, DEMO_PASSWORD } from '../fixtures/accounts';
import { skipLocationPrompt } from '../fixtures/location';

/**
 * What a HomeKrafter sees between pressing Continue and their dashboard.
 *
 * `SellerShell` used to gate on `!seller`, and `seller` arrives from
 * AuthContext's `GET /seller/me`. For the whole of that round trip a
 * HomeKrafter who had just signed in **correctly** was shown the
 * "Sign in as a HomeKrafter" wall, and then the dashboard. Measured on
 * the production build against the local QA stack, where that request
 * takes about 5ms, it still appeared in **3 of 8 logins**; in production
 * it is a full RTT plus server time, so it is the normal case rather than
 * a race. It is also the first thing a home cook sees after typing their
 * password, and it reads as a rejection.
 *
 * **This test does not wait for the race — it forces it.** `/seller/me`
 * is held for 600ms so the resolving window is wide and certain, which
 * turns a 3-in-8 flake into a deterministic assertion. A regression here
 * fails every run rather than a third of them.
 *
 * The fix is `sellerResolving` (AuthContext): "the answer has not
 * arrived" and "the answer was no" are different states, and only the
 * second is a gate. So the pin is two-sided — the wall must never appear,
 * *and* the real shell must be up while the record is still in flight,
 * because rendering nothing at all would be the same bug with better
 * manners. Never a fixture in the gap (M17): no other kitchen's name, no
 * "undefined".
 */

test.describe('signing in as a HomeKrafter', () => {
  // Explicitly signed out: the setup project leaves three cached sessions
  // around and inheriting one would skip the transition entirely.
  test.use({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });

  test('never shows the sign-in wall to somebody who just signed in', async ({ page }) => {
    await skipLocationPrompt(page);

    // Records the wall the moment it appears, from before the click until
    // the dashboard is up. Polling from Node would sample too coarsely to
    // catch a flash that is only a few frames long.
    await page.addInitScript(() => {
      const w = window as unknown as { __sawWall?: boolean };
      w.__sawWall = false;
      setInterval(() => {
        if (/Sign in as a HomeKrafter/i.test(document.body.innerText)) w.__sawWall = true;
      }, 8);
    });

    await page.goto('/login');

    // Hold the seller record so the resolving state is wide and certain.
    await page.route('**/api/v1/seller/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    await page.getByLabel(/mobile number or email|email address/i).fill(ACCOUNTS.seller.email);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /continue/i }).click();

    await page.waitForURL(/\/seller/, { timeout: 30000 });

    // Mid-flight: the portal chrome is up and usable, and the kitchen name
    // is a placeholder rather than a wrong answer.
    const portalNav = page.locator('nav[aria-label="HomeKrafter"]');
    await expect(portalNav).toBeVisible();
    await expect(page.getByRole('heading', { name: /sign in as a homekrafter/i })).toHaveCount(0);
    const topbar = page.locator('header').first();
    await expect(topbar).not.toContainText('undefined');
    // The seeded kitchens other than this one — a fixture fallback here is
    // exactly what M17 forbids, and it is invisible unless asserted.
    await expect(topbar).not.toContainText(/Meera's Snack Box|Fresh Fold/i);

    // And it resolves into the real thing.
    await expect(page.getByRole('heading', { name: /Anjali/i })).toBeVisible({ timeout: 30000 });

    const sawWall = await page.evaluate(
      () => (window as unknown as { __sawWall?: boolean }).__sawWall,
    );
    expect(sawWall, 'the "Sign in as a HomeKrafter" wall flashed during a successful sign-in').toBe(
      false,
    );
  });

  /**
   * The dashboard read must not wait for `/seller/me`, and must not be
   * issued twice.
   *
   * `sellerDataReady` (M30) exists so `GET /seller/dashboard` — which is
   * scoped by the JWT and ignores the seller record entirely — can fire
   * the moment a HomeKrafter session exists. That was quietly undone by
   * listing `seller` in the effect's dependencies: the record landing
   * changed the effect's identity, so the first request's answer was
   * discarded and an identical second one was issued after it, putting
   * the round trip back in front of the dashboard (M31).
   *
   * Holding `/seller/me` again is what makes this decisive rather than a
   * race: if the dashboard read is coupled to the record, it cannot
   * possibly land inside the hold.
   */
  test('fetches the dashboard once, without waiting for the seller record', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');

    const dashboardCalls: number[] = [];
    const start = Date.now();
    await page.route('**/api/v1/seller/dashboard*', async (route) => {
      dashboardCalls.push(Date.now() - start);
      await route.continue();
    });
    await page.route('**/api/v1/seller/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    await page.getByLabel(/mobile number or email|email address/i).fill(ACCOUNTS.seller.email);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /continue/i }).click();

    // The figures are on screen — that is the dashboard read having landed.
    await expect(page.getByTestId('stat-card').first()).toBeVisible({ timeout: 30000 });

    // Settle, so a late duplicate is caught rather than raced past.
    await page.waitForTimeout(1500);

    expect(
      dashboardCalls.length,
      `GET /seller/dashboard was requested ${dashboardCalls.length} times; it must be requested once`,
    ).toBe(1);
  });
});
