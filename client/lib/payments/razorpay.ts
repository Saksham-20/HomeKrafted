"use client";

/**
 * Razorpay Checkout SDK loader (M8.4a) — a thin wrapper over the
 * `checkout.js` script Razorpay expects a merchant site to embed
 * directly (there's no npm package for the client-side widget itself,
 * only for server SDKs). Used by `WalletContext.topUp` (`purpose:
 * "topup"`) and `CheckoutClient`'s Razorpay payment path (`purpose:
 * "order"`) — both first call `POST /payments/razorpay/order`
 * (`docs/API.md` "Payments — Razorpay (M8.2)") to open a Razorpay order,
 * then hand its `razorpayOrderId`/`amountPaise`/`keyId` to
 * `openRazorpayCheckout` here.
 *
 * **Needs a real `NEXT_PUBLIC_RAZORPAY_KEY_ID`** (a `rzp_test_...` key
 * from the Razorpay dashboard, Test Mode) to actually complete a
 * payment — with the `.env.example` placeholder, the server itself
 * degrades `POST /payments/razorpay/order` to `mock: true` (a locally-
 * minted order id, no real Razorpay order), and this modal will open but
 * can't process a real test card. See `CHANGELOG.md`'s M8.4a entry for
 * what to supply to exercise the live flow end to end.
 */

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayConstructorOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayConstructorOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout can only be opened in the browser"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay Checkout")));
        return;
      }
      const script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay Checkout"));
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface OpenRazorpayCheckoutOptions {
  keyId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description?: string;
  orderId: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onDismiss?: () => void;
}

/** Opens the Razorpay Checkout modal for a previously-created `RazorpayOrder`. Resolves once the modal has been opened (not once payment completes — that's `onSuccess`, fired asynchronously by the SDK). */
export async function openRazorpayCheckout(options: OpenRazorpayCheckoutOptions): Promise<void> {
  await loadRazorpayScript();
  if (!window.Razorpay) throw new Error("Razorpay Checkout SDK failed to load");

  const rzp = new window.Razorpay({
    key: options.keyId,
    amount: options.amountPaise,
    currency: options.currency,
    name: "Homekrafted",
    description: options.description,
    order_id: options.orderId,
    prefill: options.prefill,
    theme: { color: "#2f4f3f" },
    handler: options.onSuccess,
    modal: { ondismiss: options.onDismiss },
  });
  rzp.open();
}
