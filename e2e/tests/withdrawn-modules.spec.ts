import { test, expect } from '@playwright/test';
import { skipLocationPrompt } from '../fixtures/location';
import { DEMO_PASSWORD } from '../fixtures/accounts';

/**
 * Laundry was withdrawn in M19 — `/laundry` calls `notFound()`
 * unconditionally, and the create endpoints return 410. The models stayed
 * so that existing bookings still render, which is right, and is also the
 * trap: the module keeps working for the people who used it, so copy that
 * offers it to everyone else goes unnoticed.
 *
 * It went unnoticed for six milestones. The first screen a brand-new buyer
 * saw was `/account/orders`, subtitled "Marketplace orders and laundry
 * bookings, in one place", with an empty state reading "bookings made on
 * **Laundry** will show up here" and a Laundry filter chip — pointing at a
 * route that 404s. Found during the M26 review (ledger M26-004).
 *
 * The rule is not "delete the word laundry": somebody with six bookings
 * still needs to find them. It is that the offer is made only to people it
 * is true for.
 */

test.describe('a withdrawn module is not advertised to somebody who never used it', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a brand-new account is not offered laundry anywhere on its orders page', async ({ page }) => {
    await skipLocationPrompt(page);

    // A real signup through the real form. Unique per run so a second run
    // is not a duplicate-account failure — this writes a `User` row, so
    // point the suite at a throwaway database (docs/TESTS.md says so).
    const email = `sweep.newbuyer.${Date.now()}@example.com`;

    await page.goto('/login');
    await page.getByPlaceholder(/98450 12345 or you@example.com/).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /^continue$/i }).click();

    // An address it does not recognise becomes a signup: name, then the
    // confirm step M25 added.
    await page.getByLabel('Your name', { exact: true }).fill('Sweep New Buyer');
    await page.getByRole('button', { name: /create my account/i }).click();

    // A signup always lands on the confirm step, so assert it rather than
    // tolerating its absence. M25 shipped a bug at exactly this point (the
    // confirm step handed out a code it could not accept, 791287d), so a
    // run where the step silently does not appear is a finding, not a
    // condition to branch around.
    //
    // Asserted, not probed: an earlier draft waited on
    // `later.or(<the page h1>)`, and the h1 is visible from the first
    // paint — so the wait returned instantly, the click was skipped, and
    // the failure surfaced fifteen seconds later at the navigation. Same
    // family of mistake as `openFilters`, made while fixing `openFilters`.
    const later = page.getByRole('button', { name: /i.ll do this later/i });
    await expect(later).toBeVisible({ timeout: 15_000 });
    await later.click();

    await page.waitForURL(/\/account/, { timeout: 15_000 });
    await page.goto('/account/orders');

    const main = page.locator('main');
    await expect(main.getByText('No orders yet')).toBeVisible();

    // The whole point. Not the subtitle, not the empty copy, not a filter
    // chip — nowhere on the page, because every one of those was a
    // separate instance of the same mistake.
    await expect(main).not.toContainText(/laundry/i);

    // And the empty state still owes its three parts: what is missing, and
    // a way out. Copy that says only "No orders yet" is a dead end.
    await expect(main.getByRole('link', { name: /start shopping/i })).toBeVisible();
  });

  test('/laundry itself is gone, not merely unlinked', async ({ page }) => {
    const response = await page.goto('/laundry');
    expect(response?.status()).toBe(404);
  });

  test('the support bot no longer offers laundry, but still answers about it honestly (M37)', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/support');

    const main = page.locator('main');

    // The greeting is the offer — it must not list a withdrawn service.
    await expect(main).not.toContainText(/laundry pickup/i);

    // But the keyword still answers, because somebody with an old booking
    // will ask, and the honest reply is the withdrawal — not silence and
    // not instructions for using a module that no longer exists.
    const input = main.getByLabel('Type a message to support');
    await input.fill('Where is my laundry pickup?');
    await input.press('Enter');
    await expect(main.getByText(/no longer offered/i)).toBeVisible({ timeout: 10_000 });
  });
});
