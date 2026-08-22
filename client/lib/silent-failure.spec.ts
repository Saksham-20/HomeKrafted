import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A save that fails must say so.
 *
 * **The bug this exists to catch.** Four screens — profile, the address
 * book, notification preferences and support — wrote their mutation
 * handlers as `try { await save() } finally { setBusy(false) }`, with no
 * `catch` anywhere in the file. The server refused with a perfectly clear
 * sentence and the UI showed nothing at all: the form stayed open, the
 * button un-greyed, and the only trace was an unhandled rejection in a
 * console nobody has open. To the person using it, Save did nothing.
 *
 * Two of the four were worse than silent. `NotificationsClient` flipped
 * the switch *before* awaiting and never put it back, so a failed save
 * left the page showing a preference the server had rejected — on the one
 * screen whose entire job is "what may we send you". And the support form
 * lost a message somebody had just typed out about a problem they were
 * having.
 *
 * The rule is `finally` implies `catch`, in the same file. That is
 * deliberately coarse: a handler that genuinely should ignore a failure
 * can still write an empty `catch` with a line saying why, which is
 * better code than an absent one because it records the decision. What it
 * cannot do is leave the question unasked.
 *
 * Scanned at source rather than rendered — the client test environment is
 * `node` with no DOM. Same technique as `keyboard-activation.spec.ts`.
 */

const CLIENT_ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["components", "lib"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".spec.ts")) found.push(full);
  }
  return found;
}

function stripComments(source: string): string {
  // So a file that only *describes* the rule is never credited with
  // following it — and so this file's own prose can never satisfy it.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("an await inside try/finally", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(CLIENT_ROOT, dir)));

  it("finds files to check (guards against the scan silently matching nothing)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("always has somewhere to put the failure", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (!/\}\s*finally\s*\{/.test(source)) continue;
      if (/\}\s*catch\b/.test(source)) continue;
      offenders.push(file.replace(CLIENT_ROOT + "/", ""));
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The same failure with the `try` removed as well.
 *
 * `SellerListingEditorClient` awaited `createSellerListing` with no `try`
 * at all, so the rule above — which keys on `finally` — did not see it.
 * The result was worse than a silent save: the rejected promise meant
 * `setSaving(false)` never ran either, so the button sat on **"Saving…"
 * forever** while a HomeKrafter watched the listing they had just written
 * up go nowhere.
 *
 * So this asks the question from the other side: a file that *changes
 * something on the server* must contain a `catch`. The verbs are the
 * naming convention `lib/api` already follows.
 */
/**
 * The same failure one layer lower — in `lib/api` itself.
 *
 * The two rules above exempt `lib/api` on the reasoning that a transport
 * wrapper is *supposed* to let the error through to its caller. That was
 * the intent and not the code: sixteen mutation wrappers ended
 * `catch { return undefined }`, which does the opposite. A refusal was
 * converted into a resolved promise carrying `undefined`, so every
 * `catch` built on top of them — including the ones the rules above
 * exist to enforce — was unreachable.
 *
 * **The bug this exists to catch.** `approveSellerApplication` swallowed
 * its 409. The server refuses an approval on purpose in three cases and
 * each one carries the sentence explaining what to do next; the admin
 * screen had an error banner, an `aria-live` region and a correct
 * `catch`, and none of them ever fired. Clicking Approve on a waitlisted
 * HomeKrafter looked exactly like clicking a dead button, with the
 * explanation discarded one layer below the code trying to display it.
 * Two of the sixteen were `issueRefund` and `adjustWallet`.
 *
 * The rule applies only to **mutations**. A read may legitimately answer
 * `undefined` for "no such thing" — that is how a missing product becomes
 * a 404 page. A write that reports nothing has thrown the only
 * explanation anybody was going to get.
 *
 * A wrapper that genuinely must absorb one specific outcome still can:
 * narrow the catch and rethrow the rest, the way `adjustWallet` now keeps
 * its documented "insufficient balance is not an exception" contract by
 * testing for a 402. That passes this rule, because it re-throws.
 */
describe("a lib/api mutation wrapper", () => {
  const API_ROOT = join(CLIENT_ROOT, "lib", "api");

  /** Same verbs as below, plus the ones the admin surfaces added later. */
  const MUTATION_VERB =
    /^(create|update|delete|remove|submit|cancel|approve|reject|moderate|pause|resume|skip|advance|request|apply|follow|unfollow|set|assign|issue|resend|refund|adjust|takedown|hide|feature|unfeature|flag|verify)[A-Z]/;

  /** `catch { return undefined }` and its equivalents — no rethrow, nothing said. */
  const SWALLOW = /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(?:undefined|null|\[\]|\{\})?\s*;?\s*\}/;

  it("never turns a refusal into a resolved promise", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(API_ROOT)) {
      const source = stripComments(readFileSync(file, "utf8"));
      // Split at each exported function so a swallow is attributed to the
      // function it actually sits in, not to anything else in the file.
      for (const block of source.split(/(?=export\s+(?:async\s+)?function\s)/)) {
        const name = /^export\s+(?:async\s+)?function\s+(\w+)/.exec(block)?.[1];
        if (!name || !MUTATION_VERB.test(name)) continue;
        if (SWALLOW.test(block)) {
          offenders.push(`${file.replace(CLIENT_ROOT + "/", "")} → ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("a component that mutates server state", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(CLIENT_ROOT, dir)));

  /**
   * The verbs `lib/api` names its mutations with.
   *
   * Matched against **what the file imports from `@/lib/api`**, not
   * against every identifier in scope. A bare name check flagged
   * `LocationPrompt`'s `requestBrowserLocation`, which is a browser
   * permission prompt that already returns a boolean and has nothing to
   * refuse — a false positive is how a scanning rule earns an
   * ignore-comment and then earns deletion.
   */
  const MUTATION_VERB =
    /^(create|update|delete|remove|submit|cancel|approve|reject|moderate|pause|resume|skip|advance|request|apply|follow|unfollow|set|mark)[A-Z]/;

  /** Every identifier this file pulls in from the api layer. */
  function apiImports(source: string): string[] {
    const names: string[] = [];
    const importBlock = /import\s*\{([\s\S]*?)\}\s*from\s*["']@\/lib\/api(?:\/[\w-]+)?["']/g;
    let match: RegExpExecArray | null;
    while ((match = importBlock.exec(source)) !== null) {
      for (const raw of match[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        if (name) names.push(name);
      }
    }
    return names;
  }

  /**
   * Handler-by-handler, not file-by-file — and that distinction is the
   * whole value of this rule.
   *
   * It used to be `if (/\}\s*catch\b/.test(source)) continue`: **one
   * `catch` anywhere in the file exempted every handler in it.** A
   * component with a careful `catch` around its data-loading effect was
   * credited for it on all six of its save buttons.
   *
   * M36 turned that blind spot into six live defects at once. It removed
   * `catch { return undefined }` from sixteen `lib/api` mutation wrappers
   * — correctly, that is the rule directly above — and every bare `await`
   * on one of them became an unhandled rejection. `SellerProfileClient`
   * had a `catch` in its loader and none in `handleSave`, so the guard
   * stayed green while saving a profile stuck the button on "Saving…"
   * permanently, with the message discarded. That is *worse* than the
   * swallow it replaced: the swallow at least let `setSaving(false)` run.
   *
   * Splitting on function declarations errs toward larger blocks, so it
   * still under-reports rather than crying wolf. It catches the case that
   * actually happens: a handler that awaits a mutation and handles only
   * the happy path.
   */
  const FUNCTION_START = /(?=\n\s*(?:export\s+)?(?:async\s+function|function)\s+\w+|\n\s*const\s+\w+\s*=\s*async\b)/;

  it("always catches the refusal, in the handler that awaits it", () => {
    const offenders: string[] = [];

    for (const file of files) {
      // `lib/api` itself is the transport, not a screen — a wrapper there
      // is supposed to let the error through to its caller.
      if (file.includes(join("lib", "api"))) continue;

      const source = stripComments(readFileSync(file, "utf8"));
      const mutators = apiImports(source).filter((name) => MUTATION_VERB.test(name));
      if (mutators.length === 0) continue;

      for (const block of source.split(FUNCTION_START)) {
        const awaited = mutators.find((name) =>
          new RegExp(`\\bawait\\s+${name}\\s*\\(`).test(block),
        );
        if (!awaited) continue;
        if (/\}\s*catch\b/.test(block)) continue;
        const handler =
          /(?:async\s+function|function)\s+(\w+)|const\s+(\w+)\s*=\s*async\b/.exec(block);
        const name = handler?.[1] ?? handler?.[2] ?? "(top level)";
        offenders.push(`${file.replace(CLIENT_ROOT + "/", "")} → ${name} (awaits ${awaited})`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
