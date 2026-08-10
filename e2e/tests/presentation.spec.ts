import { test, expect } from '@playwright/test';
import { storageStateFor } from '../fixtures/accounts';
import { skipLocationPrompt } from '../fixtures/location';
import { PUBLIC_ROUTES } from './public-routes';

/**
 * Sweep chunk 8 — what every page owes at every width.
 *
 * These are properties rather than pixel comparisons. A screenshot diff
 * of a page that legitimately changes every time the catalogue does is a
 * test that gets deleted within a month; "the page never scrolls
 * sideways" is true forever and is the thing a visitor actually feels.
 */


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

test.describe('focus is always visible', () => {
  // Signed in, because `/wallet` is gated: without this the walk would
  // quietly traverse the login page and report that the wallet is fine.
  test.use({ storageState: storageStateFor('consumer') });

  /**
   * Walks the tab order and checks each stop shows *something*.
   *
   * `globals.css` sets a 2px pine ring on `:focus-visible` for everything,
   * which is the floor — but nine modules override it with `outline:
   * none`, usually because the input is borderless inside a styled
   * wrapper. Most of them put the indicator back on the wrapper
   * (`SearchField`, `SearchForm`, `PriceRange` all do). The wallet's
   * top-up amount and auto-top-up fields did not, so tabbing into the box
   * where somebody types an amount of money showed nothing at all.
   *
   * **That last one is fixed but not covered here**, and the gap is worth
   * knowing about: the top-up UI only renders when payments are
   * configured, and with Razorpay on a placeholder key the whole section
   * is replaced by "not available yet". So this walk exercises the rest
   * of `/wallet` and will only reach those two fields once real keys
   * exist.
   *
   * The check accepts a ring on the element *or* on an ancestor, because
   * putting it on the wrapper is the correct fix, not a workaround.
   */
  const hasVisibleFocus = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return true;
    // `<nextjs-portal>` is the dev overlay, not the app. Custom elements
    // are excluded wholesale rather than by name so this never becomes a
    // list of framework internals to keep up to date.
    if (el.tagName.includes('-')) return true;

    const ringed = (node: Element, pseudo?: string) => {
      const s = getComputedStyle(node, pseudo);
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) return true;
      return s.boxShadow !== 'none';
    };

    // A range input paints its ring on `::-webkit-slider-thumb`, and
    // `getComputedStyle` cannot read a UA pseudo-element — it silently
    // returns the element's own style, so the rule in
    // `PriceRange.module.css` is invisible from here. Confirmed by
    // screenshotting the slider focused and unfocused: the pixels differ,
    // so the ring is really painted. Exempted rather than asserted, since
    // the alternative is a pixel comparison of a control whose appearance
    // is the browser's to change.
    if (el instanceof HTMLInputElement && el.type === 'range') return true;

    // Six levels, not three: `ProductCard` deliberately hangs the ring on
    // the whole card rather than on the few characters of the title, and
    // the anchor sits five wrappers inside it at the mobile layout. Still
    // bounded, so a shadow on a page-level container cannot pass for a
    // focus ring.
    for (let node: Element | null = el, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      if (ringed(node)) return true;
    }
    return false;
  };

  for (const route of ['/wallet', '/shop', '/']) {
    test(`every tab stop on ${route} shows a ring`, async ({ page }) => {
      await skipLocationPrompt(page);
      await page.goto(route);

      const missing: string[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const ok = await page.evaluate(hasVisibleFocus);
        if (!ok) {
          missing.push(
            await page.evaluate(() => {
              const el = document.activeElement as HTMLElement;
              return `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`;
            }),
          );
        }
      }

      expect([...new Set(missing)]).toEqual([]);
    });
  }
});
