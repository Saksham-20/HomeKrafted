import type { Page } from '@playwright/test';

/**
 * The one place that knows what the sign-in form looks like.
 *
 * It exists because the previous shape — the same three selectors pasted
 * into `auth.setup.ts` and six blocks of `error-paths.spec.ts` — drifted
 * the moment M25 collapsed the form to a single field, and drifted
 * *silently*: `auth.setup.ts` is a setup project both viewport projects
 * declare in `dependencies`, so when it stopped finding its selectors the
 * dependent projects **skipped** and the run reported "0 failed". The
 * browser layer read as green while executing none of itself.
 *
 * So: one helper, and a failure that says what actually happened.
 */

/**
 * The identifier field's *label* is not stable — it relabels itself as you
 * type (`Mobile number or email` → `Email address` → `Mobile number`, see
 * `LoginClient.tsx:95`). The placeholder does not change, which makes it
 * the honest anchor. Anything keyed on the label passes on an empty form
 * and fails on a re-resolve.
 */
const IDENTIFIER = /98450 12345 or you@example.com/;

/** Thrown with the diagnosis rather than a bare 30s timeout. */
async function assertFormIsThere(page: Page) {
  const field = page.getByPlaceholder(IDENTIFIER);
  if (await field.count()) return;

  throw new Error(
    [
      'The sign-in form is not the one this fixture knows.',
      '',
      `  URL: ${page.url()}`,
      `  Looking for a text input with placeholder ${IDENTIFIER}`,
      '',
      'Since M25 the form is ONE field (mobile number or email) plus a',
      'password, and the submit button reads "Continue" — there are no',
      'Shopper/HomeKrafter or Phone/Email tabs. If the form changed again,',
      'fix this file, not the individual specs.',
      'See docs/TESTING.md, "How to log in".',
    ].join('\n'),
  );
}

/**
 * Fills the form and submits it. Does not assert where you land — the
 * caller does that, because *which account you became* is the assertion
 * that matters (`CLAUDE.md`, M17: `/admin/login` once threw the typed
 * inputs away and signed in a hardcoded account).
 */
export async function signIn(
  page: Page,
  credentials: { identifier: string; password: string },
) {
  await assertFormIsThere(page);

  await page.getByPlaceholder(IDENTIFIER).fill(credentials.identifier);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);

  // One button, one label, for every role. Where you land afterwards is
  // decided by the account the server returns, never by the form — which
  // is exactly why there is nothing role-shaped to select here any more.
  await page.getByRole('button', { name: /^continue$/i }).click();
}

/**
 * "Use a code instead" is on the form at all times, not only after a
 * failure, and that is deliberate: an approved HomeKrafter has no password
 * at the moment of approval, so a one-time code is their *only* door
 * (`CLAUDE.md`, M17/M25). A spec that only finds it after a 409 would pass
 * against a build that had hidden it.
 */
export const codeInsteadLink = (page: Page) =>
  page.getByRole('button', { name: /use a code instead/i });
