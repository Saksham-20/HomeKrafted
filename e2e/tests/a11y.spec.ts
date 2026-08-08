import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { skipLocationPrompt } from '../fixtures/location';

/**
 * Sweep chunk 8 — the accessibility floor, measured rather than reviewed.
 *
 * `CLAUDE.md` states the rules (gold is decorative-only because it is
 * 3.6:1 on white; icon-only buttons carry an `aria-label`; a card that
 * navigates is a link). Nothing checked them, and the audit had already
 * found three duplicated `.sr-only` recipes and a product grid of
 * `role="button"` divs that no keyboard could open.
 *
 * **Scoped to two rule sets on purpose.** `color-contrast` and the
 * structural WCAG A/AA rules are the ones that are unambiguous and worth
 * failing a build over. A blanket `withTags(['wcag2a', 'wcag2aa',
 * 'best-practice'])` run over a marketing home page produces a list
 * nobody triages, and a suite nobody triages gets `.skip`ped within a
 * month.
 */

const PUBLIC_ROUTES = ['/', '/shop', '/snacks', '/gifts', '/collections', '/about', '/meal-plans'];

/** Everything axe found, flattened to something a failure message can print. */
function describe(violations: { id: string; nodes: { target: unknown[] }[] }[]): string[] {
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} @ ${String(n.target[0])}`));
}

test.describe('contrast', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`text on ${route} is readable`, async ({ page }) => {
      await skipLocationPrompt(page);
      await page.goto(route);

      // Gold (`--hk-gold` #B98724) is 3.6:1 on white — fine as decoration
      // or at ≥16px bold, and a contrast failure anywhere else. This is
      // the rule CLAUDE.md has carried since M1 with nothing enforcing it.
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();

      expect(describe(results.violations)).toEqual([]);
    });
  }
});

test.describe('structure', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} names its controls and regions`, async ({ page }) => {
      await skipLocationPrompt(page);
      await page.goto(route);

      const results = await new AxeBuilder({ page })
        .withRules([
          // An icon-only button with no accessible name is a button a
          // screen reader announces as "button".
          'button-name',
          'link-name',
          'input-button-name',
          // A control whose visible label is not its accessible name
          // cannot be operated by voice.
          'label',
          'aria-input-field-name',
          // `aria-hidden` over something focusable is itself a violation —
          // CLAUDE.md's M16 rule, previously unchecked.
          'aria-hidden-focus',
          'aria-valid-attr-value',
          'aria-required-attr',
          'aria-roles',
          // An image with no `alt` makes a screen reader read the filename.
          'image-alt',
          // Headings in order, and the document identified.
          'heading-order',
          'html-has-lang',
          'landmark-one-main',
          'list',
          'listitem',
          'duplicate-id-aria',
        ])
        .analyze();

      expect(describe(results.violations)).toEqual([]);
    });
  }
});
