/**
 * Splitting a line of policy text around its tokens (2026-09-21).
 *
 * Pure, so the rule is testable without rendering: a token is looked up in
 * `lib/legal.ts` by the renderer, and a literal email address in the text is
 * still made a link. Nothing here decides *what* a token says — only where
 * one starts and ends.
 */

export type PolicyTextPart =
  | { type: "text"; value: string }
  | { type: "token"; name: PolicyToken }
  | { type: "email"; value: string };

/** The only two tokens the documents may use — see `types.ts`. */
export const POLICY_TOKENS = ["supportEmail", "grievanceEmail"] as const;
export type PolicyToken = (typeof POLICY_TOKENS)[number];

const TOKEN_OR_EMAIL = /(\{\{[A-Za-z]+\}\}|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

function isToken(name: string): name is PolicyToken {
  return (POLICY_TOKENS as readonly string[]).includes(name);
}

/**
 * `"Email: {{supportEmail}}"` → `[text "Email: ", token supportEmail]`.
 *
 * An unknown `{{name}}` is left as literal text rather than swallowed: a
 * typo should show up on the page, where somebody will see it, and not
 * quietly render as nothing.
 */
export function splitPolicyText(text: string): PolicyTextPart[] {
  const parts: PolicyTextPart[] = [];
  let last = 0;

  for (const match of text.matchAll(TOKEN_OR_EMAIL)) {
    const start = match.index ?? 0;
    const found = match[0];
    const token = found.startsWith("{{") ? found.slice(2, -2) : null;

    if (token !== null && !isToken(token)) continue;

    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push(token !== null ? { type: "token", name: token as PolicyToken } : { type: "email", value: found });
    last = start + found.length;
  }

  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
