/**
 * Remove comments from TypeScript source, for the structural specs that
 * scan source text.
 *
 * **Every one of those specs carried the same one-line regex recipe, and
 * it fails open (2026-09-06).** It stripped block comments with a
 * non-greedy match from an opener to the next closer, then line comments
 * with a colon guard.
 *
 * This repo writes route patterns in prose constantly — "POST /auth" plus
 * a star, "/seller" plus a star, "/admin" plus a star — and each of those
 * contains the two characters that open a block comment. Inside a JSDoc
 * block the regex reads one as a **new** opener and consumes everything
 * up to the next closer, which is the end of some later comment.
 * Everything in between is deleted before the scan ever looks at it.
 *
 * Measured across `client/`: **27 files** carry unmatched openers.
 * `lib/auth/AuthContext.tsx` has seven, and 42% of it — including
 * `requestOtp`, which awaits a mutation with no catch — was invisible to
 * `silent-failure.spec.ts`. `lib/api/auth.ts` was 41% visible;
 * `components/layout/ConsumerChrome.tsx`, 21%.
 *
 * `CLAUDE.md` already records the inverse of this — a scan that counted a
 * comment *as code* reported three ungated controllers as gated — and
 * draws the rule that matters here: **a structural scan that fails open
 * is worse than no scan, because it reports success.**
 *
 * So this is a small state machine rather than a regex. It knows four
 * states — code, line comment, block comment, string — and **inside a
 * block comment nothing opens a second one**, which is the whole bug.
 * String literals are tracked so a comment marker in a string is not an
 * opener either, and template literals are tracked because this codebase
 * builds URLs in them.
 *
 * Comments are replaced with their newlines kept: the scans split on
 * function boundaries and match line-anchored patterns, so collapsing a
 * comment to nothing would join two lines that were never adjacent.
 *
 * Pure and dependency-free so the app's specs import the same function —
 * a rule about what a scan can see must not exist in ten copies again.
 */

type State = "code" | "line" | "block" | "single" | "double" | "template";

export function stripComments(source: string): string {
  let out = "";
  let state: State = "code";
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    switch (state) {
      case "code":
        if (char === "/" && next === "/") {
          state = "line";
          index += 2;
          continue;
        }
        if (char === "/" && next === "*") {
          state = "block";
          index += 2;
          continue;
        }
        if (char === "'") state = "single";
        else if (char === '"') state = "double";
        else if (char === "`") state = "template";
        out += char;
        index += 1;
        continue;

      case "line":
        // Keep the newline: the scans are line-aware.
        if (char === "\n") {
          state = "code";
          out += char;
        }
        index += 1;
        continue;

      case "block":
        // The fix. Inside a block comment `/*` opens nothing — which is
        // what makes `POST /auth/*` in prose harmless.
        if (char === "*" && next === "/") {
          state = "code";
          index += 2;
          continue;
        }
        if (char === "\n") out += char;
        index += 1;
        continue;

      case "single":
      case "double":
      case "template": {
        if (char === "\\") {
          // An escape consumes the next character, so `"\\"` ends the
          // string and `"\""` does not.
          out += char;
          if (next !== undefined) out += next;
          index += next === undefined ? 1 : 2;
          continue;
        }
        const closer = state === "single" ? "'" : state === "double" ? '"' : "`";
        if (char === closer) state = "code";
        out += char;
        index += 1;
        continue;
      }
    }
  }

  return out;
}
