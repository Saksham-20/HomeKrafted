import { test, expect } from '@playwright/test';
import { skipLocationPrompt } from '../fixtures/location';
import { signIn, codeInsteadLink } from '../fixtures/sign-in';

/**
 * The sign-in form's own branches — the ones that decide whether a real
 * HomeKrafter can get in at all.
 *
 * `server/test/e2e/auth-continue.e2e-spec.ts` already pins the server half:
 * `POST /auth/continue` answers **409**, not 401, when the account exists
 * with `passwordHash: null`. Nothing pinned the browser half — that the
 * form turns that 409 into the code step instead of showing "incorrect
 * password" for a password that never existed.
 *
 * That gap is not hypothetical. An approved HomeKrafter has no password at
 * the moment of approval (an admin must never be able to set one), so the
 * one-time code is their only door, and this exact path has broken twice
 * (`CLAUDE.md`, M17/M25).
 *
 * The 409 is **forced** rather than staged through a real approval. Minting
 * a genuinely passwordless account needs an application, an admin approval
 * and an invite token that is stored only as a hash — a fixture with more
 * moving parts than the thing under test, and one that would fail for
 * reasons unrelated to the branch. Forcing the response is the same
 * technique `error-paths.spec.ts` uses for its 429, and it tests the half
 * that has no other coverage: what the *form* does with the answer.
 */

const APPROVED_HOMEKRAFTER = 'newly.approved@anjaliskitchen.example';

test.describe('the account with no password', () => {
  test('a 409 sends you to the code step, not to "incorrect password"', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');

    await page.route('**/api/v1/auth/continue', (route) =>
      route.fulfill({
        status: 409,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: 'PASSWORD_NOT_SET',
            message: 'This account has no password yet — we can send you a code instead.',
          },
        }),
      }),
    );
    // The form fires this on its own once it takes the code route. It has
    // no bearing on the branch, so it is answered rather than asserted.
    await page.route('**/api/v1/auth/otp/request', (route) =>
      route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: '{}' }),
    );

    await signIn(page, { identifier: APPROVED_HOMEKRAFTER, password: 'anything at all' });

    // The code step, reached without the person doing anything.
    await expect(page.getByText('Enter the code')).toBeVisible();

    // And the reason, in the server's own words. If this ever regresses to
    // a 401 "for consistency", supply-side onboarding is broken again and
    // the only visible symptom is this sentence turning into a lie.
    await expect(page.getByText(/no password yet/i)).toBeVisible();
    await expect(page.getByText(/incorrect (email|password)/i)).toHaveCount(0);
  });

  test('"use a code instead" is offered before any failure, not only after one', async ({ page }) => {
    await skipLocationPrompt(page);
    await page.goto('/login');

    // Deliberate: an approved HomeKrafter should not have to guess a
    // password and fail once to discover the door that is actually theirs.
    // A build that revealed this link only after an error would pass a
    // test written the other way round.
    await expect(codeInsteadLink(page)).toBeVisible();
  });
});
