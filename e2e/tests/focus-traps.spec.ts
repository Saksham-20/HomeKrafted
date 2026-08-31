import { test, expect, Page } from '@playwright/test';

/**
 * Every dialog in the app, against the contract all three owe.
 *
 * `CLAUDE.md` (M16) states the rule they exist to hold: **a dialog owes
 * three things, not one** — move focus in on open, trap Tab at both ends,
 * and restore focus to whatever opened it. `aria-modal` without those is a
 * claim the page does not honour, and it is a claim no unit test can
 * check, because there is no focus in a `node` test environment.
 *
 * The drawer and the location prompt announced `aria-modal="true"` and did
 * none of the three before M16. **`ReelViewer` was the third one and was
 * missed** — a full-screen video player, reachable from the home rail,
 * claiming `aria-modal` while honouring only the scroll lock, from the day
 * it shipped until M29. Its case is at the bottom of this file. All three
 * now share one implementation (`client/lib/focus-trap.ts`), so this file
 * is what stops that sharing from silently regressing.
 */

/**
 * Precise selectors, because a consumer page can hold **three**
 * `aria-modal` dialogs — the mobile drawer (present but hidden on
 * desktop), the location prompt, and the reel viewer.
 * `[role="dialog"][aria-modal="true"]` matches several, which is a
 * strict-mode violation rather than a useful assertion.
 */
const LOCATION_PROMPT = '[role="dialog"][aria-labelledby="hk-loc-title"]';
const REEL_VIEWER = '#hk-reel-viewer';
const MOBILE_DRAWER =
  '#hk-mobile-drawer, [role="dialog"]:not([aria-labelledby="hk-loc-title"]):not(#hk-reel-viewer)';

/** Where the browser thinks focus is, as something readable in a failure. */
async function focusedDescriptor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '(body)';
    const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '';
    return `${el.tagName.toLowerCase()}${label ? `: ${label}` : ''}`;
  });
}

/** True when focus is inside the given element. */
async function focusIsInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const container = document.querySelector(sel);
    return Boolean(container && document.activeElement && container.contains(document.activeElement));
  }, selector);
}

test.describe('the mobile drawer', () => {
  // The drawer only exists below the header's ~1190px collapse point.
  test.use({ viewport: { width: 390, height: 844 } });

  test('moves focus in, traps Tab, and gives it back', async ({ page }) => {
    await page.goto('/');
    // Answer the location prompt so it is not the thing holding focus.
    await dismissLocationPrompt(page);

    const opener = page.getByRole('button', { name: /menu/i }).first();
    await opener.click();

    const drawer = page.locator(MOBILE_DRAWER);
    await expect(drawer).toBeVisible();

    // 1. Focus moved in.
    expect(await focusIsInside(page, MOBILE_DRAWER)).toBe(true);

    // 2. Tab is trapped. Twenty presses is well past the drawer's own
    //    control count, so anything that escapes has plenty of chances to.
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      if (!(await focusIsInside(page, MOBILE_DRAWER))) {
        throw new Error(
          `Tab escaped the drawer after ${i + 1} presses — focus is on ${await focusedDescriptor(page)}`,
        );
      }
    }

    // Shift+Tab has to hold the other end too. A trap that only wraps
    // forwards lets Shift+Tab walk out of the top.
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Shift+Tab');
      if (!(await focusIsInside(page, MOBILE_DRAWER))) {
        throw new Error(
          `Shift+Tab escaped the drawer after ${i + 1} presses — focus is on ${await focusedDescriptor(page)}`,
        );
      }
    }

    // 3. Focus comes back to the button that opened it. Without this a
    //    keyboard user closes the drawer and lands at the top of the
    //    document, having lost their place entirely.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('leaves the tab order when closed, not just the screen', async ({ page }) => {
    await page.goto('/');
    await dismissLocationPrompt(page);

    // A panel parked off-screen with `transform: translateX(100%)` is
    // still focusable — `CLAUDE.md`'s M16 rule. Tabbing through a closed
    // drawer's links is the failure, and it is invisible by definition.
    const hidden = await page.evaluate(() => {
      const drawer = document.querySelector('[role="dialog"]:not([aria-labelledby="hk-loc-title"])');
      if (!drawer) return 'absent';
      return getComputedStyle(drawer as Element).visibility;
    });
    expect(['absent', 'hidden']).toContain(hidden);
  });
});

test.describe('the location prompt', () => {
  test('opens on a first visit, takes focus, and traps it', async ({ page }) => {
    // A fresh context has never been asked.
    await page.goto('/');

    const dialog = page.locator(LOCATION_PROMPT);
    await expect(dialog).toBeVisible();

    expect(await focusIsInside(page, LOCATION_PROMPT)).toBe(true);

    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      if (!(await focusIsInside(page, LOCATION_PROMPT))) {
        throw new Error(
          `Tab escaped the location prompt after ${i + 1} presses — focus is on ${await focusedDescriptor(page)}`,
        );
      }
    }
  });

  test('Escape is a real answer, so it is not asked again', async ({ page }) => {
    await page.goto('/');
    const dialog = page.locator(LOCATION_PROMPT);
    await expect(dialog).toBeVisible();

    // Escape maps to "skip" rather than a silent close: dismissing is a
    // legitimate answer, and recording it is what stops the prompt
    // reappearing on every page of the visit.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.goto('/shop');
    await expect(page.locator(LOCATION_PROMPT)).toBeHidden();
  });

  test('never opens over a staff surface', async ({ page }) => {
    // It is mounted in the root layout, which `/admin` and `/seller`
    // share, so it used to open over the admin login page — a focus-
    // trapping modal asking an admin which neighbourhood to deliver their
    // groceries to, while they tried to type a password.
    await page.goto('/admin/login');
    await expect(page.locator(LOCATION_PROMPT)).toBeHidden();

    // And not over the consumer login form either, for the same reason:
    // the visitor already has a task in hand.
    await page.goto('/login');
    await expect(page.locator(LOCATION_PROMPT)).toBeHidden();
  });
});

test.describe('the reel viewer', () => {
  // A phone is where a full-screen 9:16 player is actually used.
  test.use({ viewport: { width: 390, height: 844 } });

  test('moves focus in, traps Tab, and gives it back', async ({ page }) => {
    await page.goto('/');
    await dismissLocationPrompt(page);

    // The rail renders nothing at all when there are no reels
    // (`ReelsRailClient` returns null), so an empty catalogue must skip
    // rather than fail — this asserts the dialog contract, not the seed.
    const reelCard = page.locator('#hk-reels-rail > button').first();
    test.skip(!(await reelCard.count()), 'no reels seeded — nothing to open');

    await reelCard.click();

    const dialog = page.locator(REEL_VIEWER);
    await expect(dialog).toBeVisible();

    // 1. Focus moved in — and specifically onto Close. There are two
    //    "Close reel" buttons (the full-bleed scrim hit area and the real
    //    control); the scrim's carries `tabIndex={-1}` so `FOCUSABLE` skips
    //    it, which is the whole reason the first stop is the one a keyboard
    //    user wants. Asserted through the focused element rather than by
    //    index, so it does not depend on DOM order.
    expect(await focusIsInside(page, REEL_VIEWER)).toBe(true);
    expect(await focusedDescriptor(page)).toBe('button: Close reel');

    // 2. Tab is trapped, both directions.
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      for (let i = 0; i < 20; i += 1) {
        await page.keyboard.press(key);
        if (!(await focusIsInside(page, REEL_VIEWER))) {
          throw new Error(
            `${key} escaped the reel viewer after ${i + 1} presses — focus is on ${await focusedDescriptor(page)}`,
          );
        }
      }
    }

    // 3. Focus returns to the card that opened it. Without this a keyboard
    //    user closes a full-screen player and lands at the top of the home
    //    page, having lost the rail entirely.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(reelCard).toBeFocused();
  });

  test('keeps focus inside while moving between reels', async ({ page }) => {
    await page.goto('/');
    await dismissLocationPrompt(page);

    const reelCard = page.locator('#hk-reels-rail > button').first();
    test.skip(!(await reelCard.count()), 'no reels seeded — nothing to open');

    await reelCard.click();
    await expect(page.locator(REEL_VIEWER)).toBeVisible();

    /*
     * The regression this guards. The key handler needs the current index,
     * so it re-runs on every prev/next; the focus-in and focus-restore must
     * NOT. Holding both in one effect meant each ArrowRight ran the cleanup
     * — restoring focus to the card behind the still-open dialog — so a
     * keyboard user stepping through reels was silently tabbing around the
     * home page underneath a full-screen player.
     */
    await page.keyboard.press('ArrowRight');
    expect(await focusIsInside(page, REEL_VIEWER)).toBe(true);
    await expect(page.locator(REEL_VIEWER)).toBeVisible();
  });
});

test.describe('the mobile filter sheet (M56)', () => {
  // The Filters button only exists below the sidebar's 900px collapse.
  test.use({ viewport: { width: 390, height: 844 } });

  const FILTER_SHEET = '[role="dialog"][aria-label="Filters"]';

  test('moves focus in, traps Tab, closes on Escape, and gives focus back', async ({ page }) => {
    await page.goto('/gifts');
    await dismissLocationPrompt(page);

    const opener = page.getByRole('button', { name: /^Filters/ }).first();
    test.skip(!(await opener.count()), 'no filter toggle — catalogue empty');

    await opener.click();
    await expect(page.locator(FILTER_SHEET)).toBeVisible();
    expect(await focusIsInside(page, FILTER_SHEET)).toBe(true);

    // Enough presses to walk past every checkbox and both footer buttons
    // — focus must wrap, never escape into the grid behind the scrim.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(
        await focusIsInside(page, FILTER_SHEET),
        `Tab press ${i + 1} left the sheet (focus: ${await focusedDescriptor(page)})`,
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator(FILTER_SHEET)).toBeHidden();
    // Back to the Filters button that opened it.
    await expect(opener).toBeFocused();
  });
});

/**
 * Answers the first-visit prompt by actually pressing Escape.
 *
 * Only used inside this file, where the prompt's own behaviour is the
 * subject. Everywhere else, `fixtures/location.ts#skipLocationPrompt`
 * seeds the answer before navigation — waiting for a dialog that may not
 * have rendered yet is a race, and the losing side of it is a test that
 * quietly passes without clicking anything.
 */
async function dismissLocationPrompt(page: Page) {
  const dialog = page.locator(LOCATION_PROMPT);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}
