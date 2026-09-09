/**
 * Support screen content — the phone number the `/support` call CTA
 * (`tel:` link) points at, and the greeting the chat widget opens with.
 *
 * **The values themselves moved to `lib/support/contact.ts` on
 * 2026-09-06.** They are returned by `lib/api/support.ts` with no
 * `isMockMode()` branch, and the native app resolves this directory to a
 * throwing stub — so reading them from here made two `lib/api` functions
 * throw on a device. Re-exported so every existing importer is unchanged.
 */
export {
  SUPPORT_CHAT_GREETING,
  SUPPORT_HOURS,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from "@/lib/support/contact";
