import { test, expect } from '@playwright/test';
import { skipLocationPrompt } from '../fixtures/location';

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

    // Phone OTP is the default tab and must stay offered (`CLAUDE.md`, M17).
    await page.getByRole('tab', { name: 'Email', exact: true }).click();
    await page.getByLabel(/email/i).fill('ananya.iyer@example.com');
    await page.getByLabel(/password/i).fill('Passw0rd!123');
    await page.getByRole('button', { name: /continue with email/i }).click();

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
    await expect(alert).toContainText(/can't reach homekrafted/i);
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

    // Phone OTP is the default tab and must stay offered (`CLAUDE.md`, M17).
    await page.getByRole('tab', { name: 'Email', exact: true }).click();
    await page.getByLabel(/email/i).fill('ananya.iyer@example.com');
    await page.getByLabel(/password/i).fill('Passw0rd!123');
    await page.getByRole('button', { name: /continue with email/i }).click();

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

    await page.getByRole('tab', { name: 'Email', exact: true }).click();
    await page.getByLabel(/email/i).fill('anjali@anjaliskitchen.example');
    await page.getByLabel(/password/i).fill('Passw0rd!123');
    await page.getByRole('button', { name: /sign in to sell/i }).click();

    await expect(page).toHaveURL(/\/seller\/orders$/);
  });

  test('a destination off our own site is refused', async ({ page }) => {
    await skipLocationPrompt(page);

    // `?next=` is attacker-controlled. An unvalidated one turns our own
    // login page into the referrer for somebody else's credential form.
    await page.goto('/login?next=https://example.com/phish');
    await page.getByRole('tab', { name: 'Email', exact: true }).click();
    await page.getByLabel(/email/i).fill('ananya.iyer@example.com');
    await page.getByLabel(/password/i).fill('Passw0rd!123');
    await page.getByRole('button', { name: /continue with email/i }).click();

    await expect(page).toHaveURL(/localhost:\d+\/account$/);
  });

  test('a shopper is not returned into the portal', async ({ page }) => {
    await skipLocationPrompt(page);

    // The gate would bounce them straight back out to /sell, and a round
    // trip that ends somewhere else entirely reads as a failed sign-in.
    await page.goto('/login?next=%2Fseller%2Forders');
    await page.getByRole('tab', { name: 'Email', exact: true }).click();
    await page.getByLabel(/email/i).fill('ananya.iyer@example.com');
    await page.getByLabel(/password/i).fill('Passw0rd!123');
    await page.getByRole('button', { name: /continue with email/i }).click();

    await expect(page).toHaveURL(/\/account$/);
  });
});
