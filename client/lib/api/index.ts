/**
 * Typed client-stub API. Every export here is `async` and today resolves
 * mock data from `lib/data`; in M8 these bodies swap for real `fetch`
 * calls against the Next.js route handlers (documented in
 * `docs/API.md`) without changing any call site.
 */

export * from "./products";
export * from "./vendors";
export * from "./catalog";
export * from "./reviews";
export * from "./snacks";
export * from "./laundry";
export * from "./wallet";
export * from "./site";
export * from "./orders";
export * from "./addresses";
export * from "./history";
export * from "./referrals";
export * from "./notifications";
export * from "./support";
export * from "./corporate";
export * from "./sell";
