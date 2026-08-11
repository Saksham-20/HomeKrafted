import { test, expect, Page } from '@playwright/test';
import { storageStateFor } from '../fixtures/accounts';

/**
 * The portal nav strip shows you where you are.
 *
 * All three shells — HomeKrafter, account, admin — collapse their sidebar to
 * a horizontal strip below 780px. At 390px the strip is 356px wide and its
 * content is 1082px, so about four of ten items fit. Until M29 it always
 * started at item one, which meant a HomeKrafter on Payouts (866px into the
 * strip) saw four tabs that were not the one they were on, and
 * `aria-current="page"` pointed at something off-screen — a screen reader
 * announcing a position the sighted user cannot see.
 *
 * **This test exists because the obvious fix did not work and the reason was
 * invisible.** M28 tried it, measured it going to the right place and coming
 * back to 0, and shipped the edge fades alone rather than a broken effect.
 * The cause turned out to be a *late mount*: `SellerShell` gates its body
 * behind an async HomeKrafter resolve, so the nav does not exist on the
 * first effect pass and `pathname` never changes afterwards. An effect keyed
 * on the pathname alone therefore never ran again.
 *
 * The signature is what makes this worth pinning: with a plain `useRef`, the
 * **account and admin strips scrolled correctly on every route while the
 * seller strip stayed at 0 on all of them**. A test covering one portal
 * would have passed on two of the three implementations and proved nothing.
 * So all three are checked here, and the seller case is the one that matters
 * most — it is the surface a home cook actually runs their business from.
 */

/** Assert the active item is inside the strip's visible box. */
async function activeItemIsVisible(page: Page, navLabel: string) {
  return page.evaluate((label) => {
    const nav = document.querySelector(`nav[aria-label="${label}"]`);
    if (!nav) return { ok: false, why: `no nav[aria-label="${label}"]` };

    const active = nav.querySelector('[aria-current="page"]');
    if (!active) return { ok: false, why: 'nothing carries aria-current="page"' };

    // Above the collapse point the strip is a vertical column and there is
    // nothing to scroll — not a failure, just not this test's subject.
    if (nav.scrollWidth <= nav.clientWidth) {
      return { ok: true, why: 'strip fits, nothing to scroll' };
    }

    const nb = nav.getBoundingClientRect();
    const ab = active.getBoundingClientRect();
    const visible = ab.left >= nb.left - 1 && ab.right <= nb.right + 1;
    return {
      ok: visible,
      why: visible
        ? 'visible'
        : `"${active.textContent?.trim()}" sits at ${Math.round(ab.left - nb.left)}px ` +
          `within a ${Math.round(nb.width)}px strip (scrollLeft ${Math.round(nav.scrollLeft)})`,
    };
  }, navLabel);
}

const PORTALS = [
  {
    role: 'seller' as const,
    navLabel: 'HomeKrafter',
    // `/seller` first so the "already visible, do not jump" case is covered
    // too; then three items far enough along the strip to need scrolling.
    routes: ['/seller', '/seller/orders', '/seller/payouts', '/seller/profile'],
  },
  {
    role: 'consumer' as const,
    navLabel: 'Account',
    routes: ['/account/profile', '/account/notifications', '/account/referrals'],
  },
  {
    role: 'admin' as const,
    navLabel: 'Admin',
    routes: ['/admin', '/admin/settings', '/admin/audit'],
  },
];

for (const portal of PORTALS) {
  test.describe(`the ${portal.navLabel} nav strip at 390px`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      storageState: storageStateFor(portal.role),
    });

    for (const route of portal.routes) {
      test(`scrolls the active item into view on ${route}`, async ({ page }) => {
        await page.goto(route);

        // The strip can mount late (the seller gate above), so this waits
        // for the scroll rather than asserting on the first paint.
        await expect
          .poll(async () => (await activeItemIsVisible(page, portal.navLabel)).ok, {
            timeout: 5000,
            message: `active nav item never came into view on ${route}`,
          })
          .toBe(true);

        // And it stays — M28's report was of a scroll that came back to 0
        // within 500ms. That turned out not to be happening, and this is
        // what would say so if it ever starts.
        await page.waitForTimeout(700);
        const settled = await activeItemIsVisible(page, portal.navLabel);
        expect(settled.ok, settled.why).toBe(true);
      });
    }
  });
}
