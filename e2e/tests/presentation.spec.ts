import { test, expect } from '@playwright/test';
import { skipLocationPrompt } from '../fixtures/location';

/**
 * Sweep chunk 8 — what every page owes at every width.
 *
 * These are properties rather than pixel comparisons. A screenshot diff
 * of a page that legitimately changes every time the catalogue does is a
 * test that gets deleted within a month; "the page never scrolls
 * sideways" is true forever and is the thing a visitor actually feels.
 */

const PUBLIC_ROUTES = ['/', '/shop', '/snacks', '/gifts', '/hamper', '/collections', '/about', '/meal-plans'];

test.describe('no page scrolls sideways', () => {
  for (const width of [360, 768, 1180]) {
    test(`at ${width}px`, async ({ page }) => {
      await skipLocationPrompt(page);
      await page.setViewportSize({ width, height: 900 });

      const overflowing: string[] = [];
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        // `documentElement.scrollWidth` past the viewport is the horizontal
        // scrollbar a visitor gets on a phone: it makes every tap land
        // slightly off, and it is invisible on a desktop browser.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        // One pixel of rounding is not a layout bug.
        if (overflow > 1) overflowing.push(`${route} (+${overflow}px)`);
      }

      expect(overflowing).toEqual([]);
    });
  }
});

test.describe('the header collapses where it has to', () => {
  test('the hamburger appears below the measured breakpoint', async ({ page }) => {
    await skipLocationPrompt(page);

    // ~1190px is where the six-item nav plus search, wallet chip and icons
    // stops fitting inside the 1180px container — measured during M21,
    // not guessed. Below it, the drawer trigger has to be there or the nav
    // is simply unreachable.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /menu/i }).first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /menu/i }).first()).toBeHidden();
  });
});

test.describe('every page has one h1', () => {
  test('exactly one, so the document has a single title', async ({ page }) => {
    await skipLocationPrompt(page);

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      // Zero leaves a screen reader with no page title; more than one
      // leaves it with no way to tell which is the page.
      //
      // `.count()` is the non-waiting kind — the same trap as `isVisible()`.
      // A dev-server render still in flight reads as 0 and a navigation
      // caught mid-swap reads as 2, so the bare count reported a heading
      // bug that no settled page ever had. `toHaveCount` retries; `soft`
      // keeps the sweep going so one bad route doesn't hide the rest.
      await expect
        .soft(page.locator('h1'), `${route} should have exactly one <h1>`)
        .toHaveCount(1);
    }
  });
});

test.describe('images carry alt text', () => {
  test('no image on a browse page is unlabelled', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/shop');

    // `alt=""` is correct and deliberate where the name is the next thing
    // in the DOM (`ImageSlot`'s own rule), so this checks the attribute is
    // *present* — a missing one makes a screen reader read the filename.
    const missing = await page.evaluate(
      () =>
        [...document.querySelectorAll('img')].filter((img) => !img.hasAttribute('alt')).length,
    );
    expect(missing).toBe(0);
  });
});

test.describe('the skip link', () => {
  test('is the first thing a keyboard reaches, and it works', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/');

    // A page whose first Tab lands somewhere in the header makes every
    // keyboard visitor walk the whole nav on every page.
    await page.keyboard.press('Tab');
    const first = page.locator(':focus');
    await expect(first).toHaveText(/skip to content/i);
    await expect(first).toHaveAttribute('href', '#main-content');

    // And the target it names must exist.
    await expect(page.locator('#main-content')).toHaveCount(1);
  });
});
