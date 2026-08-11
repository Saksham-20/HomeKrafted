import { test, expect } from '@playwright/test';
import { storageStateFor } from '../fixtures/accounts';
import { skipLocationPrompt } from '../fixtures/location';
import { signIn } from '../fixtures/sign-in';

/**
 * Sweep chunk 7 — what the app says when the thing it depends on is gone.
 *
 * These are forced, not imagined: the API is made unreachable by aborting
 * its requests at the browser, which is exactly what a dropped connection,
 * a killed process or a phone in a lift looks like to `fetch`. Killing the
 * real server would work too, but it makes the test order-dependent and
 * leaves the suite broken if it fails half way.
 */

/** Every call to the API fails the way an unreachable host does. */
async function cutTheApi(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
}

test.describe('when the API is unreachable', () => {
  test('a sign-in attempt says so in words a person can act on', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');
    await cutTheApi(page);

    await signIn(page, { identifier: 'ananya.iyer@example.com', password: 'Passw0rd!123' });

    // A rejected `fetch` has no status and no error envelope, so before
    // this it arrived at the screens as its raw browser text — "Failed to
    // fetch", "Load failed", "NetworkError when attempting to fetch
    // resource" — shown in the same red region a refused password uses.
    // That reads as the server rejecting what was typed, so people edit a
    // form that was never wrong.
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    //
    // "Something went wrong — please try again" is not enough either: it
    // is what a generic catch produces for *every* failure, so it cannot
    // tell somebody whose wifi dropped that retrying will work. The
    // assertion is the specific copy, or this test passes against the bug.
    //
    // Which copy changed once: this line pinned "Can't reach Homekrafted
    // right now. Check your connection and try again." until 2026-08-11,
    // when `c11b56e` split the classification — that sentence blamed the
    // visitor's connection for our outage and was itself the incident bug
    // (docs/ERROR-HANDLING.md opens with it). The API being down while the
    // page origin answers is SERVER_UNREACHABLE, and the copy must own it.
    await expect(alert).toContainText(/something on our end/i);
    await expect(alert).toContainText(/us, not you/i);
    await expect(alert).not.toContainText(/check your connection/i);
    await expect(alert).not.toContainText(/failed to fetch|load failed|networkerror/i);
  });

  test('the browse page still renders its shell rather than a blank screen', async ({ page }) => {
    await skipLocationPrompt(page);
    await cutTheApi(page);
    await page.goto('/shop');

    // The header, the footer and the page's own heading are server-rendered
    // and owe nothing to the API. A visitor who loses connectivity mid-visit
    // should still see where they are.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('when the API rate-limits', () => {
  test('the 429 says to wait, not "Missing bearer token"', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');

    // `docs/DEPLOY.md` recorded 429s surfacing as blank modules or a
    // bearer-token complaint, which sends people looking in the wrong
    // place. Both throttle buckets key on client IP, so one office behind
    // a NAT shares them — this is a real user-facing state.
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '60', 'content-type': 'application/json' },
        body: JSON.stringify({
          error: { code: 'RATE_LIMITED', message: 'ThrottlerException: Too Many Requests' },
        }),
      }),
    );

    await signIn(page, { identifier: 'ananya.iyer@example.com', password: 'Passw0rd!123' });

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/too many requests/i);
    await expect(alert).not.toContainText(/throttlerexception|bearer/i);
  });
});

test.describe('being turned away at the gate', () => {
  // Explicitly signed out — the setup project leaves three cached
  // sessions around and inheriting one would skip the whole redirect.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sign-in returns you to the page you asked for, not the dashboard', async ({ page }) => {
    await skipLocationPrompt(page);

    // The edge gate sends a signed-out visitor to /login. Before this it
    // threw the destination away, so somebody following a link to a
    // specific order signed in and arrived at the top of the dashboard
    // with no route back to it.
    await page.goto('/seller/orders');
    await expect(page).toHaveURL(/\/login\?.*role=seller/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/seller/orders');

    await signIn(page, { identifier: 'anjali@anjaliskitchen.example', password: 'Passw0rd!123' });

    await expect(page).toHaveURL(/\/seller\/orders$/);
  });

  test('a destination off our own site is refused', async ({ page }) => {
    await skipLocationPrompt(page);

    // `?next=` is attacker-controlled. An unvalidated one turns our own
    // login page into the referrer for somebody else's credential form.
    await page.goto('/login?next=https://example.com/phish');
    await signIn(page, { identifier: 'ananya.iyer@example.com', password: 'Passw0rd!123' });

    await expect(page).toHaveURL(/localhost:\d+\/account$/);
  });

  test('a shopper is not returned into the portal', async ({ page }) => {
    await skipLocationPrompt(page);

    // The gate would bounce them straight back out to /sell, and a round
    // trip that ends somewhere else entirely reads as a failed sign-in.
    await page.goto('/login?next=%2Fseller%2Forders');
    await signIn(page, { identifier: 'ananya.iyer@example.com', password: 'Passw0rd!123' });

    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe('when the browser really is offline', () => {
  test('an action still speaks our language, not the network stack\'s', async ({ page, context }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');

    // `route.abort()` above simulates this; `setOffline` is the real
    // thing, through the real network stack, and the two produce
    // different `TypeError`s in different browsers. This is the one a
    // phone in a lift actually gets.
    //
    // What this deliberately does **not** claim: that a *navigation* while
    // offline is handled. It is not — Next falls back to a hard load and
    // the visitor gets Chrome's own error page, measured 2026-08-08. There
    // is no service worker and no offline shell, and adding one is a
    // feature with its own cache-invalidation problems, not an audit fix.
    await context.setOffline(true);

    await signIn(page, { identifier: 'ananya.iyer@example.com', password: 'Passw0rd!123' });

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    // The one state where connection advice is true — `c11b56e` kept it
    // for NETWORK_ERROR only, and the API-unreachable test above asserts
    // its absence there. Between them the classifier's split is pinned
    // from both sides.
    await expect(alert).toContainText(/you appear to be offline/i);
    await expect(alert).not.toContainText(/failed to fetch|load failed|networkerror/i);

    await context.setOffline(false);
  });
});

test.describe('refreshing while the order is being placed', () => {
  test.use({ storageState: storageStateFor('consumer') });

  test('the cart is gone, and the page says why before you try again', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/product/ragi-almond-cookies');
    await page.getByRole('button', { name: /add to cart/i }).first().click();

    await page.goto('/checkout');
    await expect(page.getByRole('button', { name: /^place order$/i })).toBeEnabled();

    // The request must genuinely reach the server — `route.fetch()`, then
    // sit on the response. Aborting instead would prove nothing: the first
    // attempt at this measured "no double order" from a POST that never
    // left the browser.
    await page.route('**/api/v1/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 4000));
      // The page is gone by now; fulfilling a route on a dead frame throws
      // and that is the whole point of the test.
      await route.fulfill({ response }).catch(() => {});
    });

    await page.getByRole('button', { name: /^place order$/i }).click();
    await expect(page.getByRole('button', { name: /placing order/i })).toBeVisible();
    await page.reload();

    // The order landed and the cart was cleared with it, which is what
    // stops a second one — the buyer cannot re-place what is no longer
    // there. Asserted through the UI rather than by counting orders,
    // because the desktop and mobile projects run this concurrently on the
    // same account and a delta would be racing itself.
    await expect(page.getByText('Your cart is empty')).toBeVisible();

    // And the part that was missing: the screen a refresh lands you on
    // said nothing about whether the money moved.
    await expect(page.getByRole('link', { name: /check your orders/i })).toBeVisible();
  });
});
