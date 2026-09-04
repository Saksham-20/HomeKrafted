import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing may open Razorpay Checkout without first checking that the order
 * behind it is real.
 *
 * **The bug this exists to catch.** `POST /payments/razorpay/order` returns
 * `mock: true` when the server has no usable Razorpay keys — it minted an
 * `order_mock_…` id locally rather than calling Razorpay. Both callers
 * (`WalletContext.topUp` and `CheckoutClient`) read every other field of
 * that response and dropped this one, then handed the fake id to the real
 * `checkout.js` SDK with the placeholder key.
 *
 * That does not fail loudly. Razorpay's servers answer 401, the widget
 * quietly sets its own container to `display: none`, and **neither the
 * success handler nor `modal.ondismiss` ever fires** — so the promise
 * awaiting one of them stays pending forever and the SDK's scroll lock
 * (`document.body { overflow: hidden }`) is left on the page. The wallet's
 * "Top up" button therefore did nothing at all, with no error, no toast and
 * no console message; checkout did the same *after* creating a real `Order`,
 * stranding it at `pending_payment`.
 *
 * It survived review because the code reads correctly — the flag is
 * documented on the type, the happy path is exactly right, and the failure
 * needs a deployment with no Razorpay keys to appear. Which is every
 * deployment there has ever been.
 *
 * Scanned at source rather than rendered: the client test environment is
 * `node` with no DOM, and the thing worth asserting is a rule about call
 * sites, not about markup. Same technique and same reason as
 * `keyboard-activation.spec.ts` and `seo-titles.spec.ts`.
 */

const CLIENT_ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["components", "lib"];

/** The SDK entry point. A file that doesn't import this cannot open the modal. */
const SDK_IMPORT = "openRazorpayCheckout";

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
  // Comments are removed before matching so a file that *documents* the
  // rule isn't credited with enforcing it — and so this file's own prose
  // could never satisfy the check for another one.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("opening Razorpay Checkout", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(CLIENT_ROOT, dir)));

  it("finds files to check (guards against the scan silently matching nothing)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("is always gated on the order not being a mock", () => {
    const callers: string[] = [];
    const ungated: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      // The module that *defines* the wrapper is not a caller of it.
      if (file.endsWith(join("lib", "payments", "razorpay.ts"))) continue;
      if (!source.includes(SDK_IMPORT)) continue;

      const relative = file.replace(CLIENT_ROOT + "/", "");
      callers.push(relative);

      // `.mock` is the flag from `RazorpayOrderResult`. Any caller must
      // read it — whether it bails, throws or branches is its own business.
      if (!/\.mock\b/.test(source)) ungated.push(relative);
    }

    // Every known call site must still be found. If a refactor moves one,
    // this fails and the rule gets re-pointed rather than silently lapsing.
    // `CompletePaymentPanel` joined them on 2026-09-04 — reopening the
    // payment for an order created and never paid.
    expect(callers.sort()).toEqual([
      "components/account/CompletePaymentPanel.tsx",
      "components/checkout/CheckoutClient.tsx",
      "lib/wallet/WalletContext.tsx",
    ]);
    expect(ungated).toEqual([]);
  });
});
