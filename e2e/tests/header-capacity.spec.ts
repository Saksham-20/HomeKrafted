import { test, expect, Page } from '@playwright/test';
import { storageStateFor } from '../fixtures/accounts';
import { skipLocationPrompt } from '../fixtures/location';

/**
 * The desktop header row has a fixed budget, and it was over it.
 *
 * `.container` caps the row at 1180px at *every* viewport width, which is
 * 1092px of content once its 44px-a-side padding is taken off. Nothing
 * about that changes when the screen gets wider, so "it fits on my
 * monitor" is not a thing that can be true here.
 *
 * Reported as "the searchbar is broken and unusable for sellers", and the
 * measurement on 2026-08-11 was worse than the report: a signed-in
 * HomeKrafter's row overran the container by 145px, which put the **cart
 * icon 59px past the right edge of a 1280px screen** — and `body
 * { overflow-x: hidden }` (`styles/globals.css`) meant it could not be
 * scrolled to either. Unreachable, not merely ugly. The search input
 * measured 0px wide for every role at every width from 1190 to 1920: it
 * looked like a search box, focused like one, and could not be typed in.
 *
 * The first fix (M21) kept all six nav labels and made the field expand
 * over the nav on focus, holding a 38px place in the line at rest. It
 * worked, and it still shipped a 38px circle that claimed to be a search
 * box.
 *
 * **M34 paid for the field out of the nav instead.** `primaryNav` carries
 * three catalogue items; the other three moved to the home page's
 * quick-entry strip, which is more visible than a 90px nav link. That
 * frees ~287px, the slot gets ~325–370px depending on role, and the field
 * is typable where it stands — so the expansion is deleted and this file
 * asserts the field is **already** usable, with no interaction. Both
 * halves still matter, because either alone is the bug: a field that fits
 * but cannot be typed in, or a typable field that shoves the cart off the
 * screen.
 *
 * **Why this file asserts per-child geometry rather than page overflow.**
 * That same `overflow-x: hidden` is why `documentElement.scrollWidth`
 * never grew, so the QA sweep's OVERFLOW flag could not see any of this
 * and reported the header as clean for months. The scroll-width check is
 * kept below because it is cheap, but it is the weakest of the set — the
 * assertion that actually catches a control leaving the screen is the one
 * that walks the actions row and measures each child.
 */

const VIEWPORT = { width: 1280, height: 900 };

/** The header pill, not the drawer's block variant — both live in `<header>`. */
const searchForm = (page: Page) => page.locator('header form[role="search"]').first();

/**
 * Wait until the row is carrying everything it will carry.
 *
 * The mode switch and the wallet balance both arrive after hydration and
 * they are the two widest things in this strip, so a measurement taken
 * before they land is a measurement of the anon header — which was never
 * the broken case. `WalletContext` shows "…" until it is ready and only
 * then writes the balance into the chip's accessible name, so that name
 * is the honest readiness signal for every role, signed in or not.
 */
async function settled(page: Page) {
  await expect(page.locator('header a[aria-label^="Wallet, "]')).toBeVisible();
  // The seller's mode switch resolves off a separate auth read; one frame
  // after the wallet is enough for it, and for flex to settle.
  await page.waitForTimeout(300);
}

/** Geometry of the header, read from the live DOM. */
async function headerGeometry(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) throw new Error('no <header> on the page');

    const row = header.querySelector('div');
    const actions = row?.lastElementChild;
    if (!row || !actions) throw new Error('header row / actions strip not found');

    const form = header.querySelector('form[role="search"]');
    const input = form?.querySelector<HTMLInputElement>('input[type="search"]');

    const named = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      // The `.container` box the row is allowed to occupy.
      rowRight: row.getBoundingClientRect().right,
      formWidth: form?.getBoundingClientRect().width ?? -1,
      inputWidth: input?.clientWidth ?? -1,
      inputFocused: !!input && document.activeElement === input,
      children: [...actions.children]
        // The hamburger is `display: none` above the collapse width and
        // reports a zero box there; measuring it would assert nothing.
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => ({ name: named(el), right: el.getBoundingClientRect().right })),
    };
  });
}

/**
 * Signed out is a first-class case, not a warm-up: it is the widest the
 * slot ever gets (no mode switch, a ₹0 wallet chip), so it is where an
 * expansion that only ever *shrinks* the field would show up.
 */
const ROLES = [
  { name: 'signed out', storageState: { cookies: [], origins: [] } },
  { name: 'a shopper', storageState: storageStateFor('consumer') },
  { name: 'a HomeKrafter', storageState: storageStateFor('seller') },
] as const;

for (const role of ROLES) {
  test.describe(`the header row at ${VIEWPORT.width}px, ${role.name}`, () => {
    test.use({ viewport: VIEWPORT, storageState: role.storageState });

    // The location prompt is a real modal with a real focus trap, so on a
    // fresh context it sits over the header and swallows the click on the
    // magnifier. Seeded rather than dismissed — see the fixture.
    test.beforeEach(async ({ page }) => {
      await skipLocationPrompt(page);
    });

    test('keeps every action control on the screen', async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const geo = await headerGeometry(page);

      const offscreen = geo.children.filter((c) => c.right > geo.innerWidth);
      expect(
        offscreen,
        `${offscreen.map((c) => `"${c.name}" ends at ${Math.round(c.right)}px`).join(', ')} ` +
          `on a ${geo.innerWidth}px screen — and body{overflow-x:hidden} means it cannot be scrolled to`,
      ).toEqual([]);

      // And the weaker-but-earlier signal: staying on the screen is the
      // floor, staying inside the 1180px `.container` box is the contract.
      // Checked second so a failure reports the severe breach first.
      const spilled = geo.children.filter((c) => c.right > geo.rowRight + 1);
      expect(
        spilled,
        `${spilled.map((c) => `"${c.name}" ends ${Math.round(c.right - geo.rowRight)}px past the container`).join(', ')}`,
      ).toEqual([]);
    });

    test('does not push the document sideways', async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const geo = await headerGeometry(page);
      expect(geo.scrollWidth).toBeLessThanOrEqual(geo.innerWidth + 2);
    });

    /**
     * The field is typable **at rest** — no click, no focus, no
     * expansion. This is the assertion the whole M34 nav cut exists to
     * make true, and it is the one that fails the moment somebody adds
     * nav items back until the row is over budget again.
     *
     * 200px against the slot's 210px floor so sub-pixel rounding cannot
     * make it flap, and 120px of actual `<input>` because a pill that
     * measures right with a zero-width field inside it is the original
     * bug wearing the fix's clothes.
     */
    test('carries a typable search field with no interaction', async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const geo = await headerGeometry(page);
      expect(
        geo.formWidth,
        'the search pill is back to a stub — the row is over budget again, cut the nav rather than hiding the field',
      ).toBeGreaterThanOrEqual(200);
      expect(geo.inputWidth, 'the pill is wide but the input inside it is not').toBeGreaterThanOrEqual(120);
    });

    /**
     * The magnifier is a `<label>`, so clicking it puts the caret in the
     * field. Post-M34 that must *not* resize anything: a field that jumps
     * width on focus is the deleted expansion coming back by accident.
     */
    test('focuses on the magnifier without resizing the row', async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const before = await headerGeometry(page);
      await searchForm(page).locator('label').click();
      const after = await headerGeometry(page);

      expect(after.inputFocused, 'clicking the magnifier did not focus the input').toBe(true);
      expect(
        Math.abs(after.formWidth - before.formWidth),
        'the field changed width on focus — the M34 expansion has been reintroduced',
      ).toBeLessThanOrEqual(2);
    });

    test('searches what was typed', async ({ page }) => {
      await page.goto('/');
      await settled(page);

      const input = searchForm(page).locator('input[type="search"]');
      await searchForm(page).locator('label').click();
      await input.fill('pickle');
      await input.press('Enter');

      await expect(page).toHaveURL(/\/search\?q=pickle$/);
    });
  });
}
