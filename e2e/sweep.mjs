/**
 * M26 breadth sweep — every route in `docs/route-inventory.tsv`, in every
 * role that can reach it, at 1280 and 390, with the machine-checkable half
 * of the judgement recorded per route.
 *
 * This is not a replacement for opening pages and looking at them. It is
 * what makes looking at them affordable: a person cannot reliably notice
 * a 4.4:1 contrast ratio, a 38px tap target or a heading that jumps h2→h4
 * across 87 routes, and those are exactly the defects that survive a
 * visual pass. What it finds becomes a shortlist; the eyes go there.
 *
 *   node e2e/sweep.mjs                     # both viewports, all roles
 *   node e2e/sweep.mjs --only=/shop,/cart  # a subset while iterating on a fix
 *
 * Output: `.qa-shots/<viewport>/<slug>.png` and `.qa-shots/sweep.json`.
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, '.qa-shots');

/**
 * Dynamic-route fixtures, resolved from the seeded QA database.
 *
 * **Two of these rot, and rotting used to be silent.** Most are stable
 * seed values — explicit ids (`pr1`, `ord-seed-1987`) or slugs — but
 * `inquiry` and `ownPlan` are **cuids**, generated fresh by every
 * `dropdb hk_qa && ./scripts/qa-up.sh`. A stale cuid resolves to a row
 * that no longer exists, so the route renders a not-found card on a 200
 * with one `h1` and no axe violations, and the sweep printed `ok` for a
 * page it had never opened (found 2026-08-10, same class as M28-004).
 *
 * The `NOTFOUND` flag now catches that, so drift is loud rather than
 * invisible. When it fires on these two, refresh them:
 *
 *   psql -d hk_qa -tAc 'select id from "CorporateInquiry" limit 1;'
 *   psql -d hk_qa -tAc 'select mp.id from "MealPlan" mp
 *     join "Vendor" v on v.id = mp."vendorId"
 *     where v.slug = '"'"'anjalis-kitchen'"'"' limit 1;'
 *
 * `ownPlan` must belong to **the seller storage state's own vendor**, or
 * the route correctly 404s as somebody else's plan and the flag fires for
 * a second, unrelated reason.
 */
const F = {
  product: 'mango-thokku-pickle',
  vendor: 'anjalis-kitchen',
  collection: 'diwali-gifting-edit',
  occasion: 'birthday',
  mealPlan: 'anjalis-kitchen-ghar-ka-khana-lunch',
  order: 'ord-seed-1987',
  user: 'user-demo',
  inquiry: 'cmsmqui980037pnn4xuzrlaqm',
  ownListing: 'pr1',
  ownPlan: 'cmsmqujle0001j5fmn65tdfg5',
  sellerOrder: 'ord-seed-2039',
  pickup: 'lb-seed-1020',
  snack: 'sk1',
};

/**
 * `role` is the storage state to use. `anon` deliberately runs with no
 * cookies at all rather than a signed-out signed-in browser — the first
 * visit is a distinct state and half the empty-state defects live there.
 */
const ROUTES = [
  ['/', 'anon'],
  ['/about', 'anon'],
  ['/shop', 'anon'],
  ['/gifts', 'anon'],
  ['/hamper', 'anon'],
  ['/snacks', 'anon'],
  ['/meal-plans', 'anon'],
  [`/meal-plans/${F.mealPlan}`, 'anon'],
  ['/collections', 'anon'],
  [`/collections/${F.occasion}`, 'anon'],
  [`/guides/${F.collection}`, 'anon'],
  [`/product/${F.product}`, 'anon'],
  [`/storefront/${F.vendor}`, 'anon'],
  ['/search?q=pickle', 'anon'],
  ['/search', 'anon'],
  ['/cart', 'anon'],
  ['/checkout', 'anon'],
  ['/login', 'anon'],
  ['/signup', 'anon'],
  ['/forgot-password', 'anon'],
  ['/reset-password', 'anon'],
  ['/admin/login', 'anon'],
  ['/seller/login', 'anon'],
  ['/sell', 'anon'],
  ['/corporate', 'anon'],
  ['/contact', 'anon'],
  ['/support', 'anon'],
  ['/app-promo', 'anon'],
  ['/terms', 'anon'],
  ['/privacy', 'anon'],
  ['/refunds', 'anon'],
  ['/laundry', 'anon'],
  ['/gallery', 'anon'],

  ['/account', 'consumer'],
  ['/account/orders', 'consumer'],
  [`/account/orders/${F.order}`, 'consumer'],
  ['/account/addresses', 'consumer'],
  ['/account/profile', 'consumer'],
  ['/account/wishlist', 'consumer'],
  ['/account/reviews', 'consumer'],
  ['/account/referrals', 'consumer'],
  ['/account/following', 'consumer'],
  ['/account/notifications', 'consumer'],
  ['/account/subscriptions', 'consumer'],
  ['/wallet', 'consumer'],
  ['/cart', 'consumer'],
  ['/checkout', 'consumer'],

  ['/seller', 'seller'],
  ['/seller/listings', 'seller'],
  [`/seller/listings/${F.ownListing}`, 'seller'],
  ['/seller/listings/new', 'seller'],
  ['/seller/menu', 'seller'],
  ['/seller/menu/new', 'seller'],
  ['/seller/meal-plans', 'seller'],
  [`/seller/meal-plans/${F.ownPlan}`, 'seller'],
  ['/seller/meal-plans/new', 'seller'],
  ['/seller/meal-plans/deliveries', 'seller'],
  ['/seller/orders', 'seller'],
  [`/seller/orders/${F.sellerOrder}`, 'seller'],
  ['/seller/payouts', 'seller'],
  ['/seller/pickups', 'seller'],
  ['/seller/profile', 'seller'],
  ['/seller/storefront', 'seller'],
  ['/seller/reviews', 'seller'],
  ['/seller/analytics', 'seller'],

  ['/admin', 'admin'],
  ['/admin/sellers', 'admin'],
  ['/admin/catalog', 'admin'],
  [`/admin/catalog/${F.ownListing}`, 'admin'],
  ['/admin/catalog/reviews', 'admin'],
  ['/admin/orders', 'admin'],
  [`/admin/orders/marketplace/${F.order}`, 'admin'],
  ['/admin/payouts', 'admin'],
  ['/admin/support', 'admin'],
  ['/admin/users', 'admin'],
  [`/admin/users/${F.user}`, 'admin'],
  ['/admin/wallet', 'admin'],
  [`/admin/wallet/${F.user}`, 'admin'],
  ['/admin/collections', 'admin'],
  ['/admin/collections/new', 'admin'],
  ['/admin/collections/occasions', 'admin'],
  ['/admin/collections/promo', 'admin'],
  ['/admin/corporate', 'admin'],
  [`/admin/corporate/${F.inquiry}`, 'admin'],
  ['/admin/analytics', 'admin'],
  ['/admin/audit', 'admin'],
  ['/admin/settings', 'admin'],
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const viewportArg = process.argv.find((a) => a.startsWith('--viewport='))?.slice(11);

const slugify = (r) => r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';

/**
 * The per-page probe. Everything here answers a question a reviewer would
 * otherwise have to answer by hand and would get wrong at this volume.
 */
async function probe(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;

    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    // Horizontal overflow, attributed to the widest offender rather than
    // reported as a bare boolean — "the page scrolls sideways" is not
    // actionable, "this table does" is.
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.right > vw + 2;
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 70),
        overhang: Math.round(el.getBoundingClientRect().right - vw),
      }))
      .sort((a, b) => b.overhang - a.overhang)
      .slice(0, 5);

    // A link that goes nowhere. `#` and `` are the two shapes a dead
    // control takes when the destination does not exist yet.
    const deadLinks = [...document.querySelectorAll('a')]
      .filter((a) => visible(a))
      .filter((a) => {
        const h = a.getAttribute('href');
        return h === '#' || h === '' || h === null || h === 'javascript:void(0)';
      })
      .map((a) => (a.textContent || a.getAttribute('aria-label') || '(no name)').trim().slice(0, 50));

    // Tap targets. 24×24 is the WCAG 2.2 AA floor (2.5.8); 44 is Apple's
    // guidance. Reported against 24 so the list is defects, not opinions.
    //
    // Visually-hidden controls are excluded rather than counted: the
    // clipped 1×1 recipe is how a screen-reader-only submit button is
    // *supposed* to look, and reporting it as an undersized tap target
    // buried the real findings under one false positive per page.
    const srOnly = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') && r.width <= 2 && r.height <= 2;
    };

    // 2.5.8's own "inline" exception: a link inside a run of prose is
    // sized by the sentence around it, and padding one out would break
    // the line box it lives in. `mailto:` in a support paragraph is the
    // canonical case. A link that is the only thing in its block is not
    // inline and gets no exemption.
    const inlineInProse = (el) => {
      if (el.tagName !== 'A') return false;
      const prose = el.closest('p,li,figcaption,blockquote,dd,td');
      if (!prose) return false;
      return (prose.textContent || '').trim().length > (el.textContent || '').trim().length + 12;
    };

    // A card whose title is a stretched link: the anchor's text box is
    // small, but its `::after` covers the whole card, which is the real
    // target. Measured via the card, not the text.
    const stretched = (el) => {
      if (el.tagName !== 'A') return false;
      return getComputedStyle(el, '::after').position === 'absolute';
    };

    const candidates = [...document.querySelectorAll('a,button,[role="button"],input[type="checkbox"],input[type="radio"],select')]
      .filter((el) => visible(el) && !srOnly(el) && !inlineInProse(el) && !stretched(el));
    const boxes = candidates.map((el) => el.getBoundingClientRect());

    // 2.5.8's *spacing* exception, which is not optional to model: an
    // undersized control passes if a 24px-diameter circle centred on it
    // touches no other target's circle. A 18px checkbox alone in a
    // well-spaced grid row is conformant, and reporting it anyway pushes
    // somebody to enlarge controls that were already fine — a cosmetic
    // regression bought with a false positive.
    const wellSpaced = (i) => {
      const a = boxes[i];
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      return boxes.every((b, j) => {
        if (i === j) return true;
        const bx = b.left + b.width / 2;
        const by = b.top + b.height / 2;
        return Math.hypot(ax - bx, ay - by) >= 24;
      });
    };

    const smallTargets = candidates
      .map((el, i) => {
        const r = boxes[i];
        return {
          name: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
          spaced: wellSpaced(i),
        };
      })
      .filter((t) => (t.w < 24 || t.h < 24) && !t.spaced)
      .slice(0, 8);

    // Heading order. A jump (h2 → h4) is how a screen-reader user loses
    // the shape of a page, and it is invisible to everyone else.
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((h) => visible(h))
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || '').trim().slice(0, 45) }));
    const jumps = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level - headings[i - 1].level > 1) {
        jumps.push(`h${headings[i - 1].level} → h${headings[i].level} at "${headings[i].text}"`);
      }
    }

    const brokenImages = [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')?.slice(0, 90));

    // An input with no programmatic label. Placeholder-only is the common
    // shape and it disappears the moment somebody types.
    const unlabelledInputs = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')]
      .filter((el) => visible(el))
      .filter((el) => {
        // Not in the accessibility tree, so it has no name to be missing.
        // `ImageUpload`/`PhotoUpload` deliberately keep a visually-hidden,
        // `aria-hidden`, `tabIndex={-1}` file input beside a named
        // `role="button"` zone — that arrangement is the *fix* for a real
        // nested-interactive violation, and reading it as twelve
        // unlabelled inputs across the seller editors was this probe
        // disagreeing with axe (which reports no `label` violation on any
        // of them). A check that cries wolf on correct code is worse than
        // no check: it teaches people to skip the column.
        if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) {
          return false;
        }
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
        if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        return !el.closest('label');
      })
      .map((el) => el.getAttribute('name') || el.getAttribute('placeholder') || el.tagName)
      .slice(0, 6);

    /*
     * Text controls that make iOS Safari zoom.
     *
     * Safari zooms the whole page when a focused input/select/textarea has
     * a computed font-size under 16px, and it does not zoom back out. Every
     * text control in this codebase was 12.5–14.5px — 36 of them across 34
     * modules — so *every* form on an iPhone shifted the layout under the
     * visitor's thumb: the login field at the start of a session, the
     * checkout address, the wallet top-up amount, the whole seller portal.
     * Fixed globally in M29 (`styles/globals.css`).
     *
     * This probe is the half that keeps it fixed. The rule it guards is one
     * global declaration, so the realistic regression is not somebody
     * editing that rule — it is a new module whose input carries
     * `!important` of its own, or a control outside the rule's selector.
     * Only meaningful at the mobile viewport, where the zoom happens.
     */
    const inputZoom = [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => visible(el))
      // Carry no text and are sized by the UA, so font-size is irrelevant.
      .filter((el) => !['checkbox', 'radio', 'range'].includes(el.getAttribute('type') || ''))
      .map((el) => ({
        el,
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((r) => r.size > 0 && r.size < 16)
      .map(
        (r) =>
          `${r.el.tagName.toLowerCase()}${
            r.el.getAttribute('name') || r.el.getAttribute('placeholder')
              ? `[${r.el.getAttribute('name') || r.el.getAttribute('placeholder')}]`
              : ''
          } ${r.size}px`,
      )
      .slice(0, 8);

    return {
      title: document.title,
      h1Count: document.querySelectorAll('h1').length,
      headings: headings.slice(0, 14),
      headingJumps: jumps,
      horizontalScroll: de.scrollWidth > vw + 2,
      scrollWidth: de.scrollWidth,
      overflowing,
      deadLinks,
      smallTargets,
      brokenImages,
      unlabelledInputs,
      inputZoom,
      textLength: (document.querySelector('main')?.innerText || document.body.innerText || '').trim().length,
    };
  });
}

async function run() {
  const results = [];
  const browser = await chromium.launch();

  const viewports = viewportArg ? VIEWPORTS.filter((v) => v.name === viewportArg) : VIEWPORTS;

  for (const vp of viewports) {
    mkdirSync(path.join(SHOTS, vp.name), { recursive: true });

    for (const role of ['anon', 'consumer', 'seller', 'admin']) {
      const routes = ROUTES.filter(([r, ro]) => ro === role).filter(
        ([r]) => !only || only.some((o) => r.startsWith(o)),
      );
      if (routes.length === 0) continue;

      const statePath = path.join(import.meta.dirname, '.auth', `${role}.json`);
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: role !== 'anon' && existsSync(statePath) ? statePath : undefined,
      });

      // The location prompt is a real `aria-modal` dialog over the first
      // paint, so without this every screenshot photographs the modal and
      // every route reports the modal's own headings. `hk_location_v1` in
      // localStorage is what `LocationContext` persists — the cookie
      // (`hk_loc`) is only the Server Component mirror, so setting the
      // cookie alone leaves the client prompt up. Both are set: the
      // cookie so `/shop` and `/snacks` filter server-side, the
      // localStorage key so the prompt does not reopen.
      await ctx.addInitScript((area) => {
        window.localStorage.setItem(
          'hk_location_v1',
          JSON.stringify({ source: 'area', asked: true, areaId: area.areaId, label: area.label, lat: area.lat, lng: area.lng }),
        );
      }, { areaId: 'chd-sector-17', label: 'Sector 17', lat: 30.7418, lng: 76.7822 });
      await ctx.addCookies([
        {
          name: 'hk_loc',
          value: encodeURIComponent(JSON.stringify({ lat: 30.7418, lng: 76.7822, label: 'Sector 17', areaId: 'chd-sector-17' })),
          url: BASE,
        },
      ]);

      for (const [route] of routes) {
        const page = await ctx.newPage();
        const consoleErrors = [];
        const failedRequests = [];
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
        });
        page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 100)}`));

        const record = { route, role, viewport: vp.name };
        try {
          const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
          record.status = resp?.status() ?? 0;
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          // Force lazy images to resolve — a full-page screenshot of an
          // unscrolled page photographs empty boxes and reads as a defect.
          await page.evaluate(async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y < h; y += 600) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 45));
            }
            window.scrollTo(0, 0);
            await new Promise((r) => setTimeout(r, 350));
          });

          Object.assign(record, await probe(page));

          const axe = await new AxeBuilder({ page })
            .withRules([
              'color-contrast',
              'button-name',
              'link-name',
              'input-button-name',
              'label',
              'aria-allowed-attr',
              'aria-required-attr',
              'aria-valid-attr-value',
              'aria-hidden-focus',
              'image-alt',
              'html-has-lang',
              'duplicate-id-aria',
              'form-field-multiple-labels',
              'select-name',
              'frame-title',
              'list',
              'listitem',
              'definition-list',
              'td-headers-attr',
              'th-has-data-cells',
              'nested-interactive',
              'landmark-unique',
            ])
            .analyze();
          record.axe = axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            count: v.nodes.length,
            sample: v.nodes.slice(0, 3).map((n) => ({
              target: String(n.target[0]).slice(0, 110),
              summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(1, 3).join(' | ').slice(0, 190),
            })),
          }));

          await page.screenshot({
            path: path.join(SHOTS, vp.name, `${slugify(route)}.png`),
            fullPage: vp.name === 'desktop',
          });
        } catch (err) {
          record.error = String(err).slice(0, 200);
        }
        record.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
        record.failedRequests = [...new Set(failedRequests)].slice(0, 6);
        results.push(record);

        /*
          An error boundary is not always an error *status*.

          Found by this sweep's own output on 2026-08-10: eleven routes
          rendered "This page didn't load" after the API rate-limited the
          run, and while the ones that 500'd were flagged `HTTP500`,
          `/shop` came back **200** with the boundary painted — so the
          sweep printed `ok` next to a page showing an error. That is the
          same shape as the M26 finding where the browser layer reported
          "0 failed" while running almost nothing: an instrument that
          passes what it cannot see.

          The boundary titles are the four `error.tsx` files under
          `client/app`, matched on the shared "didn't load" stem so a
          reworded title does not silently switch this off. Curly and
          straight apostrophes both, because the codebase has both.
        */
        const boundaryHit = (record.headings ?? []).some((h) =>
          /didn[’']t load/i.test(h.text ?? ''),
        );

        /*
          A not-found page is the same trap one step further along, and it
          bit this sweep on 2026-08-10 too.

          Two of the fixtures in `F` are **cuids** — `inquiry` and
          `ownPlan` — and a cuid is regenerated by every reseed. So after
          `dropdb hk_qa && ./scripts/qa-up.sh`, `/admin/corporate/<id>`
          resolves to a row that no longer exists and renders the admin
          "No such record" card. Status **200**, one `h1`, zero axe
          violations: `ok`. The sweep reported a clean measurement of a
          page it had never actually opened, which is the whole failure
          class `ERRBOUNDARY` exists to close.

          Matched against the three `not-found.tsx` titles rather than
          resolving the ids live, because this catches *any* fixture drift
          — a renamed slug, a deleted seed row, a route quietly moved —
          not only the two known to rot.

          `/laundry` trips this and is correct to: it is withdrawn (M19)
          and already carries `HTTP404`. A route that is expected to
          404 shows both flags; one that is not shows this alone, which
          is exactly the signal worth having.
        */
        const notFoundHit = (record.headings ?? []).some((h) =>
          /couldn[’']t find that page|not in your portal|no such record/i.test(h.text ?? ''),
        );

        const flags = [
          record.error && 'ERR',
          boundaryHit && 'ERRBOUNDARY',
          notFoundHit && 'NOTFOUND',
          record.status >= 400 && `HTTP${record.status}`,
          record.horizontalScroll && 'OVERFLOW',
          record.axe?.length && `axe:${record.axe.reduce((n, v) => n + v.count, 0)}`,
          record.deadLinks?.length && `dead:${record.deadLinks.length}`,
          record.headingJumps?.length && `hjump:${record.headingJumps.length}`,
          record.brokenImages?.length && `img:${record.brokenImages.length}`,
          record.smallTargets?.length && `tap:${record.smallTargets.length}`,
          // Was collected into the JSON and never printed, so it could
          // only be found by someone already reading the raw file.
          record.unlabelledInputs?.length && `input:${record.unlabelledInputs.length}`,
          // Mobile only: a sub-16px text control zooms iOS Safari on focus
          // and does not zoom back. Meaningless at 1280, where nothing
          // zooms, so printing it there would train people to ignore it.
          vp.name === 'mobile' &&
            record.inputZoom?.length &&
            `inputzoom:${record.inputZoom.length}`,
          record.h1Count !== 1 && `h1x${record.h1Count}`,
        ].filter(Boolean);
        console.log(`${vp.name.padEnd(7)} ${role.padEnd(8)} ${route.padEnd(48)} ${flags.join(' ') || 'ok'}`);
        await page.close();
      }
      await ctx.close();
    }
  }

  await browser.close();
  const outPath = path.join(SHOTS, viewportArg ? `sweep-${viewportArg}.json` : 'sweep.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n${results.length} page-visits → ${outPath}`);
}

run();
