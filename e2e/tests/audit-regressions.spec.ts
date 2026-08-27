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
    // The pager label updates before the rows do, so waiting on it alone
    // can read a page-1 row and call it buried. Wait for the first row's
    // href to actually change.
    const firstRow = page.locator('a[href^="/admin/orders/"]').first();
    const onPageOne = await firstRow.getAttribute('href');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
    await expect(firstRow).not.toHaveAttribute('href', onPageOne!, { timeout: 15_000 });

    const buried = await firstRow.innerText();
    const reference = buried.match(/#(\S+)/)?.[1];
    expect(reference).toBeTruthy();

    await page.getByPlaceholder(/search/i).first().fill(reference!);

    await expect(page.locator('a[href^="/admin/orders/"]')).toHaveCount(1, { timeout: 15_000 });
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

/**
 * The filter sidebar is collapsed behind a "Filters" toggle below the
 * layout breakpoint, so on the mobile project every checkbox is out of the
 * accessibility tree until it is opened. Without this the mobile runs pass
 * vacuously or fail on a locator that was never going to resolve.
 */
async function openFilters(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  const anyFilter = page.getByRole('checkbox').first();

  // Wait for whichever shape this viewport renders before deciding, rather
  // than probing with `isVisible()`. That is an *instant* check: on a page
  // still hydrating it answers false, the click never happens, and the
  // failure surfaces 30 seconds later at whichever checkbox the test wanted
  // — pointing at the filter panel instead of at this line. It is the same
  // trap `e2e/README.md` names, and it bit only the mobile project, because
  // above the sidebar breakpoint the filters are always rendered and there
  // is no toggle to miss.
  await expect(toggle.or(anyFilter).first()).toBeVisible({ timeout: 15_000 });

  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(anyFilter).toBeVisible();
  }
}

test.describe('browsing survives the Back button', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a filtered, sorted page comes back the way it was left', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');
    await openFilters(page);

    // Until 2026-08-08 every filter, the sort and the page number lived
    // only in component state. Narrow the catalogue, open a listing, press
    // Back — and land on an unsorted, unfiltered page 1. On a browse page
    // whose whole job is narrowing before you buy, that is the loop broken
    // at the point it matters.
    const sort = page.getByRole('combobox', { name: 'Sort' });
    await sort.selectOption('price-asc');
    await page.getByRole('checkbox', { name: /^Snacks/ }).check();

    // The URL is the fix and the assertion: state that is not in it cannot
    // survive a navigation, and a filtered view that cannot be sent to
    // anybody is half a browse page.
    await expect(page).toHaveURL(/category=snacks/);
    await expect(page).toHaveURL(/sort=price-asc/);

    await page.locator('a[href^="/product/"]').first().click();
    await expect(page).toHaveURL(/\/product\/[^/]+$/);

    await page.goBack();
    await expect(page).toHaveURL(/category=snacks/);
    await openFilters(page);
    await expect(sort).toHaveValue('price-asc');
    await expect(page.getByRole('checkbox', { name: /^Snacks/ })).toBeChecked();
  });

  test('a filtered URL opens filtered for somebody else', async ({ page }) => {
    await skipLocationPrompt(page);
    // The shareable half. A cold load has none of the state the first test
    // built up, so this is the only thing proving the URL is read and not
    // merely written.
    await page.goto('/shop?category=snacks&sort=price-desc');
    await openFilters(page);

    await expect(page.getByRole('checkbox', { name: /^Snacks/ })).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('price-desc');
  });

  test('nonsense in the query shows the catalogue rather than an empty grid', async ({ page }) => {
    await skipLocationPrompt(page);
    // Every one of these arrives from somebody else's URL. The failure to
    // avoid is not a crash — it is a page that quietly filters itself to
    // nothing and reads as the catalogue being gone.
    await page.goto('/shop?page=-3&sort=cheapest&minPrice=abc&category=does-not-exist');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('most-loved');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test('un-ticking a filter clears it from the URL', async ({ page }) => {
    await skipLocationPrompt(page);
    // `?category=` used to seed the sidebar once and never be rewritten,
    // so un-ticking left the URL still claiming it — and a refresh put the
    // filter back with nothing on screen explaining why.
    await page.goto('/shop?category=snacks');
    await openFilters(page);
    await page.getByRole('checkbox', { name: /^Snacks/ }).uncheck();

    await expect(page).not.toHaveURL(/category=/);
    await page.reload();
    await openFilters(page);
    await expect(page.getByRole('checkbox', { name: /^Snacks/ })).not.toBeChecked();
  });

  test('a tracking parameter on a shared link survives a filter click', async ({ page }) => {
    await skipLocationPrompt(page);
    // The rewrite owns six keys and must leave everything else alone —
    // otherwise the first click on a filter deletes the attribution on
    // every link the business shares.
    await page.goto('/shop?utm_source=whatsapp');
    await openFilters(page);
    await page.getByRole('checkbox', { name: /^Pickles/ }).check();

    await expect(page).toHaveURL(/utm_source=whatsapp/);
    await expect(page).toHaveURL(/category=pickles/);
  });
});

test.describe('the food page opens on kitchens (M51)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('kitchens first, dishes one toggle away, and the view survives Back', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');

    // The whole point of M51: `/shop` answers "whose kitchen" before it
    // answers "which jar". A regression here is a silent one — the page
    // still renders a full grid of things you can buy.
    const kitchens = page.getByRole('radio', { name: /^Kitchens/ });
    await expect(kitchens).toBeChecked();
    await expect(page.locator('a[href^="/storefront/"]').first()).toBeVisible();

    // And a dish is still one click away from the food page — the kitchen
    // card carries real listings, it is not a directory entry.
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();

    await page.getByRole('radio', { name: /^Dishes/ }).click();
    await expect(page).toHaveURL(/view=dishes/);

    await page.locator('a[href^="/product/"]').first().click();
    await expect(page).toHaveURL(/\/product\/[^/]+$/);
    await page.goBack();

    // State that is not in the URL cannot survive a navigation — the same
    // rule the filters and the sort are held to.
    await expect(page).toHaveURL(/view=dishes/);
    await expect(page.getByRole('radio', { name: /^Dishes/ })).toBeChecked();
  });

  test('an untouched food page does not put the default view in the URL', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');
    await expect(page.getByRole('radio', { name: /^Kitchens/ })).toBeChecked();
    await expect(page).not.toHaveURL(/view=/);
  });
});

test.describe('the split landing screen (M51)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const food = (page: import('@playwright/test').Page) =>
    page.locator('a[href="/shop"]').filter({ hasText: 'Find a kitchen' }).first();
  const gifts = (page: import('@playwright/test').Page) =>
    page.locator('a[href="/gifts"]').filter({ hasText: 'Browse gifts' }).first();

  test('keyboard focus opens a half, not only the mouse', async ({ page, viewport }) => {
    // Below 780 the halves are stacked and driven by the scroll position
    // instead (`hover: none` — see `SplitPanels.tsx`), so there is no
    // width to grow and the observer, not focus, owns the attribute.
    test.skip((viewport?.width ?? 0) < 780, 'the split is scroll-driven on a phone');
    await skipLocationPrompt(page);
    await page.goto('/');

    const even = await food(page).boundingBox();
    const evenGifts = await gifts(page).boundingBox();
    expect(Math.abs(even!.width - evenGifts!.width)).toBeLessThan(2);

    // Focus, not hover: an expansion only a pointer can trigger is
    // decoration, and this is the page's primary navigation.
    await gifts(page).focus();
    await page.waitForTimeout(900);
    const opened = await gifts(page).boundingBox();
    expect(opened!.width).toBeGreaterThan(even!.width * 1.3);
  });

  test('reduced motion keeps both halves level', async ({ page }) => {
    // The global reduced-motion floor removes the *transition*, so without
    // the media guard in `SplitPanels.module.css` this would jump from half
    // the screen to three quarters with no motion at all — worse than not
    // moving.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await skipLocationPrompt(page);
    await page.goto('/');

    await food(page).hover();
    await page.waitForTimeout(500);
    const foodBox = await food(page).boundingBox();
    const giftsBox = await gifts(page).boundingBox();
    expect(Math.abs(foodBox!.width - giftsBox!.width)).toBeLessThan(2);
  });
});
