# design-sync notes — homekrafted-web

Everything here lives under `client/` (the Next.js app *is* the design-system
package). Run every command from `client/`, not the repo root.

## Repo shape

- **Not a component library.** There is no `dist/`, no published package, no
  Storybook. `cfg.shape` is pinned to `package` and the converter runs in
  synth-entry mode over `cfg.srcDir = components/ui` (31 primitives + the two
  under `components/ui/icons`).
- **`node_modules/homekrafted-web` is a symlink to `client/`** (`ln -sfn ..
  node_modules/homekrafted-web`). The converter resolves `PKG_DIR` through
  `node_modules/<cfg.pkg>`; npm won't self-install, so the link is what makes
  it find the package. **Recreate it on a fresh clone / after `npm ci`** or the
  build dies with `ENOENT ... node_modules/homekrafted-web/package.json`.
- **`.d.ts` come from `npx tsc -p .design-sync/tsconfig.dts.json`**, which emits
  declarations into `client/dist/types` (gitignored). Without them every
  `<Name>Props` degrades to `[key: string]: unknown` — a useless contract for
  the design agent. **Re-run tsc before the converter whenever component props
  change.** `findTypesRoot` picks `dist/types` ahead of `lib/`, which is why it
  works with no `types` field in package.json.
- `.design-sync/css-modules.d.ts` exists only so that tsc run can resolve
  `*.module.css` imports (next-env.d.ts is not in that project's include).

## Build order (the whole loop)

```sh
cd client
ln -sfn .. node_modules/homekrafted-web        # once per clone
npx tsc -p .design-sync/tsconfig.dts.json      # regenerate dist/types
./.design-sync/build-css.sh                    # regenerate ds-styles.css
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]
```

## Config decisions

- **`cfg.cssEntry` is generated.** `.design-sync/ds-styles.css` is
  `styles/tokens.css` + `styles/tokens.extend.css` + `styles/globals.css` +
  `.design-sync/fonts/fonts.css`, concatenated by `.design-sync/build-css.sh`.
  It is a build artifact — edit the `styles/*.css` sources, then re-run the
  script. (The converter appends it to `_ds_bundle.css`, so it must be one flat
  file: a leading `@import` list would be dropped as invalid there.)
- **Fonts are committed.** The app loads Fraunces / IBM Plex Sans / IBM Plex
  Mono through `next/font/google`, so nothing is on disk. `.design-sync/
  fetch-fonts.sh` downloads the latin + latin-ext woff2 into
  `.design-sync/fonts/` and writes `fonts.css`, which also declares the
  `--font-fraunces` / `--font-plex-sans` / `--font-plex-mono` variables that
  `globals.css` bridges into `--hk-font-*`. Without that bridge every card
  renders in a system fallback. (SIL Open Font License; re-run the script only
  to change the cast.)
- **`.design-sync/overrides/bundle.mjs` is a declared fork** (`cfg.libOverrides`)
  adding esbuild `define` entries for `process.env.NEXT_PUBLIC_*`. App source
  reads them at module scope (`lib/api/http.ts`, `lib/api/uploads.ts`), and
  without the defines **every** preview throws `ReferenceError: process is not
  defined`. **A new `process.env.X` read in any synced component needs a new
  define here** — esbuild rejects a blanket `'process.env': '({})'`.
- **`cfg.tsconfig` is `.design-sync/tsconfig.dssync.json`**, not the app's. It
  maps `next/link` and `next/image` to the shims in `.design-sync/shims/`
  (the real ones need Next's runtime context) and pins the *directory* imports
  `@/lib/format`, `@/lib/types`, `@/lib/data` at their `index.ts`. The paths
  plugin's extension probe treats a directory hit as a file, so a bare `@/*`
  rule resolves `@/lib/format` to the folder and esbuild fails with
  `is a directory`. **Any new directory-style `@/...` import needs its own exact
  entry, listed before the `@/*` wildcard.**
- **17 components carry `cfg.overrides.<Name>.cardMode = "column"`** — their
  stories are wider than a grid cell, so the product's card view cropped them.

## Previews

- `.design-sync/preview-lib/fixtures.ts` re-exports real rows from the app's own
  `lib/data`, **with image `src`/`imageSrc` stripped**: the upload plan ships no
  photography, so a real path renders as a broken image. `ImageSlot`'s labelled
  placeholder is the honest fallback.
- `demoCategories` deliberately uses the four **craft** slugs
  (`candles-home`, `handmade-jewellery`, `art-prints`, `personalised-gifts`):
  `CraftIcon`'s `CATEGORY_ART` map only covers those, so a row of food
  categories with photos stripped renders four identical gift glyphs.
- `PreOrderPicker`'s preview passes `days` explicitly. Left to itself the
  component builds a rolling window from `new Date()`, and the render hash would
  change every day, re-triggering a regrade on every sync.
- `PhotoUpload`'s filled story uses inline `data:image/svg+xml` swatches — the
  only way to show the populated gallery without shipping files. Its `disabled`
  story was dropped: with no photos, disabled renders literally nothing.

## Known render warns (expected — a warn NOT in this list is new)

- `[RENDER_THIN] CraftIcon` — it is an icon; the cells paint SVG and no text.
  Screenshot confirmed correct.
- `[TOKENS_MISSING]` for `--hk-radius-sm/-md/-lg`, `--hk-ink-muted`, `--hk-sand`
  — see "Findings for the app" below. These are genuinely undefined in the repo.
- `Card`'s `Default` and `Hoverable` cells look identical: `hoverable` only
  changes the hover state, which a still cannot show.

## Findings for the app (not sync problems)

- **Five `--hk-*` variables are referenced by component CSS and defined
  nowhere**: `--hk-radius-sm`, `--hk-radius-md`, `--hk-radius-lg`,
  `--hk-ink-muted`, `--hk-sand`. Used in `components/ui/PreOrderPicker.module.css`
  and several `components/seller/*.module.css` files. `var()` with no fallback
  and no definition drops the declaration, so those radii are square and those
  colours inherit — silently, in the live app. The real tokens are `--hk-r-sm/
  -md/-lg`, `--hk-muted` and `--hk-gold-tint`/`--hk-surface-2`. Worth a fix in
  the app, separately from this sync.
- The emitted `.d.ts` carry a stray `tw?: string` prop on components extending
  `HTMLAttributes` — it comes from Next's bundled satori JSX typings, not from
  this codebase. Harmless, cosmetic.

## Re-sync risks

- **The symlink and `dist/types` are both gitignored**, so a fresh clone builds
  a *worse* bundle silently if the two setup steps above are skipped: the build
  succeeds and every prop contract collapses to `[key: string]: unknown`. Check
  one emitted `.d.ts` after any first build on a new machine.
- **`ds-styles.css` and `dist/types` are snapshots.** Editing `styles/*.css` or
  a component's props without re-running the two generators ships a bundle that
  disagrees with the app.
- **Google Fonts is a network dependency of `fetch-fonts.sh` only.** The woff2
  files are committed, so a normal build needs no network.
- **`next/link` and `next/image` shims are approximations.** `next/image`'s
  `fill` is emulated with absolute positioning; a component that starts relying
  on Next's image loader, `next/navigation`, `next/font` or a server-only API
  will need a new shim entry rather than a config tweak.
- **`DesignSync` needs `/design-login`, and that cannot run from a
  non-interactive session** (VS Code extension, headless, `-p`). The first
  attempt in this repo failed on exactly that; the fix is to run `/design-login`
  once from an interactive `claude` in a terminal on the same machine — every
  later session on that machine reuses the authorization.
- The project is **`Homekrafted`**, `projectId`
  `4a9a2ca9-d29d-47c5-8730-dff9c97703bf`, pinned in `config.json`. First upload:
  184 files, 33 components, 2026-09-01.
