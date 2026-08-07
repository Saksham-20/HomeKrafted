import { test, expect } from '@playwright/test';
import { storageStateFor } from '../fixtures/accounts';
import { skipLocationPrompt } from '../fixtures/location';

/**
 * The defects the 2026-08-07 audit found by driving a browser, pinned so
 * they cannot come back quietly.
 *
 * Every one of these passed the whole existing suite — 460-odd server
 * tests and 114 client ones — because none of that layer opens a page.
 * They are here rather than in a Jest spec because each is only visible
 * through a rendered DOM, a real click, or a status line.
 */

test.describe('a product card is operable from a keyboard', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Enter on a focused card opens the listing', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');

    // Until M22 every product grid used a `role="button"` div. React's
    // `onClick` does not fire for Enter or Space on a div, so a card was
    // focusable and un-openable — the whole catalogue, unreachable to
    // anyone not using a mouse. The fix was a stretched link, which also
    // restores open-in-new-tab.
    const firstCardLink = page.locator('a[href^="/product/"]').first();
    await expect(firstCardLink).toBeVisible();

    await firstCardLink.focus();
    await expect(firstCardLink).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/product\/[^/]+$/);
  });
});

test.describe('the address book refuses what cannot be delivered', () => {
  test.use({ storageState: storageStateFor('consumer') });

  test('a pincode nobody could route to cannot be submitted at all', async ({ page }) => {
    // A signed-in session says nothing about whether this browser has been
    // asked where it is — the two are stored separately, so without this
    // the location prompt is up and intercepting every click.
    await skipLocationPrompt(page);
    await page.goto('/account/addresses');

    const addButton = page.getByRole('button', { name: /add (a new )?address/i }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    const save = page.getByRole('button', { name: 'Save address' });
    // Nothing typed yet: there is nothing to save, and the button says so
    // rather than letting a click produce a wall of server validation.
    await expect(save).toBeDisabled();

    await page.getByLabel('Label').fill('Audit test address');
    await page.getByLabel('Recipient name').fill('Audit Tester');
    await page.getByLabel('Phone', { exact: true }).fill('9876543210');
    await page.getByLabel('Address line 1').fill('1 Test Road');
    await page.getByLabel('City').fill('Chandigarh');
    await page.getByLabel('State').fill('Chandigarh');

    // The audit found this stored verbatim: an address book row with
    // `pincode: "ABCDEF"`, which no courier can route. The button's own
    // `disabled` only tracks whether fields are *present*, so this stays
    // clickable — the refusal is a real one, with a message.
    await page.getByLabel('Pincode').fill('ABCDEF');
    await expect(save).toBeEnabled();
    await save.click();

    // Named field, named problem. The server refuses this too
    // (`CreateAddressDto`), but saying it here avoids round-tripping a
    // combined validation message to tell somebody about one typo.
    await expect(page.getByText('Enter a valid 6-digit pincode.')).toBeVisible();

    // And nothing was written — the whole point. Before the audit this
    // reached the database.
    await page.reload();
    await expect(page.getByText('ABCDEF')).toHaveCount(0);

    // A real one goes through, so the guard is a filter rather than a wall.
    //
    // The label is unique per run because this writes to the shared demo
    // account and the two viewport projects run in parallel — asserting on
    // "160017" would match the *other* project's row and pass for the
    // wrong reason. It is deleted again at the end, so repeated runs do
    // not silt up the account.
    const label = `Audit ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await page.getByRole('button', { name: /add (a new )?address/i }).first().click();
    await page.getByLabel('Label').fill(label);
    await page.getByLabel('Recipient name').fill('Audit Tester');
    await page.getByLabel('Phone', { exact: true }).fill('9876543210');
    await page.getByLabel('Address line 1').fill('1 Test Road');
    await page.getByLabel('City').fill('Chandigarh');
    await page.getByLabel('State').fill('Chandigarh');
    await page.getByLabel('Pincode').fill('160017');
    await page.getByRole('button', { name: 'Save address' }).click();

    const saved = page.getByText(label, { exact: true });
    await expect(saved).toBeVisible({ timeout: 10_000 });

    // Tidy up after itself.
    const card = saved.locator('xpath=ancestor::*[self::li or self::div][1]');
    const remove = card.getByRole('button', { name: /delete|remove/i }).first();
    if (await remove.isVisible().catch(() => false)) {
      await remove.click();
      await expect(saved).toHaveCount(0, { timeout: 10_000 });
    }
  });
});

test.describe('the admin order list', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('search reaches an order that is not on the first page', async ({ page }) => {
    await page.goto('/admin/orders');

    // Wait for the pager rather than probing for it. `isVisible()` is an
    // instant check, so on a page that is still hydrating it reports false
    // and skips — a green run that tested nothing, which is worse than a
    // failure because nobody looks at it.
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible({ timeout: 15_000 });

    // Take a reference from page 2, then search for it from page 1. A
    // client-side filter over a page answers "no orders match" here, which
    // is what this endpoint's search moving server-side is for.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();

    const buried = await page.locator('a[href^="/admin/orders/"]').first().innerText();
    const reference = buried.match(/#(\S+)/)?.[1];
    expect(reference).toBeTruthy();

    await page.getByPlaceholder(/search/i).first().fill(reference!);

    await expect(page.locator('a[href^="/admin/orders/"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('a[href^="/admin/orders/"]').first()).toContainText(reference!);
  });

  test('a filtered count does not claim to span everything', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.getByText(/across marketplace, laundry and snacks/)).toBeVisible();

    await page.getByRole('button', { name: 'Snacks', exact: true }).click();

    // "27 orders across marketplace, laundry and snacks" stayed on screen
    // under a filter showing four. The number was right and the sentence
    // was not.
    await expect(page.getByText(/match these filters/)).toBeVisible();
  });
});

test.describe('the support queue badge', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('counts the queue, not the page in front of you', async ({ page }) => {
    await page.goto('/admin/support');
    await expect(page.getByText(/Waiting on us/i)).toBeVisible();

    const reading = async () =>
      (await page.getByText(/Waiting on us/i).locator('..').innerText()).match(/\d+/)?.[0];

    const before = await reading();
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    // Give the refetch a beat to land.
    await expect(page.getByText(/Waiting on us/i)).toBeVisible();
    const after = await reading();

    // Derived from the loaded rows, this dropped to 0 the moment an admin
    // filtered to resolved — a support queue reporting that nobody is
    // waiting, on the one screen whose job is saying who is.
    expect(after).toBe(before);
  });
});

test.describe('an unknown slug is a real 404', () => {
  test('the status line says 404, not just the page body', async ({ page }) => {
    // A `loading.tsx` over a route that can `notFound()` starts streaming
    // — status line included — before the page body runs, so the 404 can
    // never be set and the visitor gets a soft 404: the right page with a
    // 200. Measured during M15; only the body is visible to a human, which
    // is why this asserts the status.
    const product = await page.goto('/product/definitely-not-a-real-listing');
    expect(product?.status()).toBe(404);

    const storefront = await page.goto('/storefront/definitely-not-a-real-kitchen');
    expect(storefront?.status()).toBe(404);
  });

  test('the withdrawn laundry module 404s', async ({ page }) => {
    // M19 withdrew it. The models stay so existing bookings still render,
    // but the route is gone — and "gone" has to mean the status too.
    const response = await page.goto('/laundry');
    expect(response?.status()).toBe(404);
  });
});
