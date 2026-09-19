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

type Page = import('@playwright/test').Page;

/**
 * The category rail — one shelf at a time (2026-09-19).
 *
 * A category is a scope, not a filter: the rail is a `radiogroup`, so a
 * shelf is `getByRole('radio')`, and it is on screen at every width — no
 * sheet to open first. (This block used to open the "All filters" sheet
 * and tick a checkbox, which was the multi-select model; the sheet has no
 * Category group any more.)
 *
 * `exact` because two shelves can share a prefix ("Snacks", "Snacks &
 * Namkeen") and a strict-mode locator that matches both fails on the
 * click, pointing at the rail instead of at the name.
 */
const categoryRail = (page: Page) => page.getByRole('radiogroup', { name: 'Category' });
const shelf = (page: Page, name: string) =>
  categoryRail(page).getByRole('radio', { name, exact: true });

/**
 * Every `category=` in the address bar, not just the first — "exactly one"
 * is the assertion, and `toHaveURL(/category=snacks/)` is also satisfied by
 * `category=pickles,snacks`. Poll it: the URL is written by a debounced
 * `router.replace`, so it trails the click by ~250ms.
 */
const categoryParams = (page: Page) => new URL(page.url()).searchParams.getAll('category');

/**
 * The "All filters" sheet's opener. The button is named "All filters" —
 * this and `focus-traps.spec.ts` both looked for `/^Filters/`, which
 * matches no button anywhere in the app (the sheet is a dialog *labelled*
 * "Filters", its heading a span), so the wait timed out here and the
 * focus-trap test skipped itself on `count() === 0`.
 */
async function openAllFilters(page: Page) {
  const opener = page.getByRole('button', { name: /^All filters/ });
  // Waited for, not probed with `isVisible()` — that is an *instant* check,
  // and on a page still hydrating it answers false. It is the same trap
  // `e2e/README.md` names.
  await expect(opener).toBeVisible({ timeout: 15_000 });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
}

test.describe('browsing survives the Back button', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a filtered, sorted page comes back the way it was left', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');

    // Until 2026-08-08 every filter, the sort and the page number lived
    // only in component state. Narrow the catalogue, open a listing, press
    // Back — and land on an unsorted, unfiltered page 1. On a browse page
    // whose whole job is narrowing before you buy, that is the loop broken
    // at the point it matters.
    const sort = page.getByRole('combobox', { name: 'Sort' });
    await sort.selectOption('price-asc');
    await shelf(page, 'Snacks').click();

    // The URL is the fix and the assertion: state that is not in it cannot
    // survive a navigation, and a filtered view that cannot be sent to
    // anybody is half a browse page.
    await expect(page).toHaveURL(/category=snacks/);
    await expect(page).toHaveURL(/sort=price-asc/);

    await page.locator('a[href^="/product/"]').first().click();
    await expect(page).toHaveURL(/\/product\/[^/]+$/);

    await page.goBack();
    await expect(page).toHaveURL(/category=snacks/);
    await expect(sort).toHaveValue('price-asc');
    await expect(shelf(page, 'Snacks')).toBeChecked();
  });

  test('a filtered URL opens filtered for somebody else', async ({ page }) => {
    await skipLocationPrompt(page);
    // The shareable half. A cold load has none of the state the first test
    // built up, so this is the only thing proving the URL is read and not
    // merely written.
    await page.goto('/shop?category=snacks&sort=price-desc');

    await expect(shelf(page, 'Snacks')).toBeChecked();
    await expect(shelf(page, 'All')).not.toBeChecked();
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
    // An unknown shelf is All — and the rail says so, rather than lighting
    // nothing.
    await expect(shelf(page, 'All')).toBeChecked();
  });

  test('choosing All clears the category from the URL', async ({ page }) => {
    await skipLocationPrompt(page);
    // `?category=` used to seed the sidebar once and never be rewritten,
    // so un-ticking left the URL still claiming it — and a refresh put the
    // filter back with nothing on screen explaining why.
    await page.goto('/shop?category=snacks');
    await expect(shelf(page, 'Snacks')).toBeChecked();
    await shelf(page, 'All').click();

    await expect(shelf(page, 'All')).toBeChecked();
    await expect(page).not.toHaveURL(/category=/);
    await page.reload();
    await expect(shelf(page, 'All')).toBeChecked();
    await expect(shelf(page, 'Snacks')).not.toBeChecked();
  });

  test('a tracking parameter on a shared link survives a category click', async ({ page }) => {
    await skipLocationPrompt(page);
    // The rewrite owns eleven keys and must leave everything else alone —
    // otherwise the first click on a filter deletes the attribution on
    // every link the business shares.
    await page.goto('/shop?utm_source=whatsapp');
    await shelf(page, 'Pickles').click();

    await expect(page).toHaveURL(/utm_source=whatsapp/);
    await expect(page).toHaveURL(/category=pickles/);
  });
});

test.describe('a category is one shelf, not a filter (2026-09-19)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a second category replaces the first — the URL carries exactly one', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');

    await shelf(page, 'Pickles').click();
    await expect.poll(() => categoryParams(page)).toEqual(['pickles']);

    // The old rail was `aria-pressed` toggles over one Set: this produced
    // `category=pickles,snacks` and both shelves stayed lit.
    await shelf(page, 'Snacks').click();
    await expect.poll(() => categoryParams(page)).toEqual(['snacks']);
    await expect(shelf(page, 'Snacks')).toBeChecked();
    await expect(shelf(page, 'Pickles')).not.toBeChecked();
    await expect(page).not.toHaveURL(/pickles/);
  });

  test('a legacy multi-select link opens on its first category and is rewritten', async ({ page }) => {
    await skipLocationPrompt(page);
    // What the old rail wrote, and so what is in every link somebody sent
    // before the change.
    await page.goto('/shop?category=pickles,snacks&utm_source=whatsapp');

    await expect(shelf(page, 'Pickles')).toBeChecked();
    await expect(shelf(page, 'Snacks')).not.toBeChecked();
    // The first-run guard rewrites the address bar so it stops claiming a
    // state the page is not in, and leaves what it does not own alone.
    await expect.poll(() => categoryParams(page)).toEqual(['pickles']);
    await expect(page).toHaveURL(/utm_source=whatsapp/);
  });

  test('a diet filter and the sort survive a category change, and the page resets to 1', async ({ page }) => {
    await skipLocationPrompt(page);
    // Page 2 is a URL the codec accepts whatever the catalogue holds; the
    // state keeps it until something resets it, which is what is under
    // test. Nothing is ticked by hand — the filters arrive in the link.
    await page.goto('/shop?view=dishes&diet=vegetarian&sort=price-asc&page=2');
    await expect(shelf(page, 'All')).toBeChecked();

    await shelf(page, 'Pickles').click();
    await expect(page).toHaveURL(/category=pickles/);
    await expect(page).toHaveURL(/diet=vegetarian/);
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page).toHaveURL(/view=dishes/);
    await expect(page).not.toHaveURL(/page=/);
  });

  test('a quick filter is a refinement: it does not touch the shelf, and the shelf does not clear it', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop?category=snacks');

    const pureVeg = page
      .getByRole('group', { name: 'Quick filters' })
      .getByRole('button', { name: 'Pure veg' });
    await pureVeg.click();
    await expect(pureVeg).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/diet=vegetarian/);
    await expect(page).toHaveURL(/category=snacks/);

    await shelf(page, 'Pickles').click();
    await expect(page).toHaveURL(/category=pickles/);
    await expect(pureVeg).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/diet=vegetarian/);
  });

  test('Clear all clears the refinements and leaves the shelf', async ({ page }) => {
    await skipLocationPrompt(page);
    // Two dietary tags = two chips, which is what makes "Clear all" appear
    // (a single chip's own × is the same tap). It used to wipe the category
    // too, because the category was one of the chips.
    await page.goto('/shop?category=snacks&diet=vegetarian,vegan');

    await page.getByRole('button', { name: 'Clear all' }).click();

    await expect(page).not.toHaveURL(/diet=/);
    await expect(page).toHaveURL(/category=snacks/);
    await expect(shelf(page, 'Snacks')).toBeChecked();
  });

  test('the "All filters" sheet no longer offers a Category group', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');
    await openAllFilters(page);

    // Two controls for one choice was the defect: the sheet's checkboxes
    // and the rail edited the same state. The rail is the one place.
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByRole('button', { name: /^Category/ })).toHaveCount(0);
    await expect(sheet.getByRole('checkbox', { name: /^Snacks/ })).toHaveCount(0);
  });

  test('the gifts departments are one shelf at a time, and a subcategory replaces its department', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/gifts');

    // "All gifts" then one tile per live department.
    const tiles = categoryRail(page).getByRole('radio');
    await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    test.skip((await tiles.count()) < 3, 'fewer than two live departments — nothing to replace');

    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toBeChecked();
    await tiles.nth(2).click();
    await expect(tiles.nth(2)).toBeChecked();
    await expect(tiles.nth(1)).not.toBeChecked();
    await expect.poll(() => categoryParams(page)).toHaveLength(1);

    // Find a department that has subcategories. Choosing it renders its
    // chip row in the same commit as `toBeChecked` passing, so the
    // `count()` after it is not the instant-probe race.
    const inside = page.getByRole('radiogroup', { name: /^Inside / });
    let withChildren = -1;
    for (let i = 1; i < (await tiles.count()); i += 1) {
      await tiles.nth(i).click();
      await expect(tiles.nth(i)).toBeChecked();
      if (await inside.count()) {
        withChildren = i;
        break;
      }
    }
    test.skip(withChildren === -1, 'no live department has subcategories');

    // A subcategory REPLACES the department selection: the tile steps back
    // to "you are inside this one" (`aria-current`, never `checked`) and
    // the URL still carries a single slug.
    const chips = inside.getByRole('radio');
    await chips.nth(1).click();
    await expect(chips.nth(1)).toBeChecked();
    await expect(tiles.nth(withChildren)).not.toBeChecked();
    await expect(tiles.nth(withChildren)).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => categoryParams(page)).toHaveLength(1);

    // And "All {department}" is the department selection again.
    await chips.first().click();
    await expect(tiles.nth(withChildren)).toBeChecked();
    await expect(chips.nth(1)).not.toBeChecked();

    // "All gifts" leaves the shelf.
    await tiles.first().click();
    await expect(tiles.first()).toBeChecked();
    await expect.poll(() => categoryParams(page)).toEqual([]);
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
