import { Page } from '@playwright/test';

/**
 * Marks this browser as already asked "where are you?", before the first
 * navigation.
 *
 * The prompt is a real `aria-modal` dialog with a real focus trap, so on a
 * fresh context it sits over whatever a test is trying to click — which is
 * correct behaviour and exactly what `focus-traps.spec.ts` asserts. Every
 * *other* spec wants to be past it.
 *
 * Done with an init script rather than by pressing Escape after loading:
 * dismissing means waiting for the dialog to appear first, and "wait for
 * a thing that may or may not show up" is a race that resolves as a
 * silently skipped test about half the time. Seeding the answer has no
 * such window — the page renders already answered.
 *
 * `{ source: "none", asked: true }` is exactly what `LocationContext`
 * persists when somebody dismisses the prompt: asked, with no coordinates.
 * The catalogue then comes back unfiltered, which is the documented
 * behaviour for a visitor who declines (`CLAUDE.md`, M12: location is
 * never a gate).
 */
export async function skipLocationPrompt(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'hk_location_v1',
      JSON.stringify({ source: 'none', asked: true }),
    );
  });
}
