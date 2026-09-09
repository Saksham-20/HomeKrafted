/**
 * Remove comments from TypeScript source, for the structural specs that
 * scan source text.
 *
 * **A copy of `client/lib/testing/strip-comments.ts`, and it must stay
 * identical** — `strip-comments-parity.spec.ts` fails the build if it
 * drifts. Same reason as `src/common/geo.ts` and its client twin: these
 * are separate npm packages, so there is nothing to import.
 *
 * It exists because every structural spec here carried the same one-line
 * regex recipe and that recipe fails open. This codebase writes route
 * patterns in prose constantly — "/seller" plus a star, "/admin" plus a
 * star — and each contains the two characters that open a block comment.
 * The regex reads one as an opener and deletes everything to the next
 * closer.
 *
 * Measured on `server/src`: **10 files** carry unmatched openers.
 * `src/seller/seller.controller.ts` was **54% visible** to
 * `rbac-structure.spec.ts`, which is the spec that fails the build on an
 * ungated portal controller; `src/admin/audit.module.ts` was 14%.
 *
 * That is the same incident `CLAUDE.md` already records from the other
 * direction — a scan that counted a comment as code reported three
 * ungated controllers as gated — and the same rule applies: **a
 * structural scan that fails open is worse than no scan, because it
 * reports success.**
 */

type State = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';

export function stripComments(source: string): string {
  let out = '';
  let state: State = 'code';
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    switch (state) {
      case 'code':
        if (char === '/' && next === '/') {
          state = 'line';
          index += 2;
          continue;
        }
        if (char === '/' && next === '*') {
          state = 'block';
          index += 2;
          continue;
        }
        if (char === "'") state = 'single';
        else if (char === '"') state = 'double';
        else if (char === '`') state = 'template';
        out += char;
        index += 1;
        continue;

      case 'line':
        if (char === '\n') {
          state = 'code';
          out += char;
        }
        index += 1;
        continue;

      case 'block':
        if (char === '*' && next === '/') {
          state = 'code';
          index += 2;
          continue;
        }
        if (char === '\n') out += char;
        index += 1;
        continue;

      case 'single':
      case 'double':
      case 'template': {
        if (char === '\\') {
          out += char;
          if (next !== undefined) out += next;
          index += next === undefined ? 1 : 2;
          continue;
        }
        const closer = state === 'single' ? "'" : state === 'double' ? '"' : '`';
        if (char === closer) state = 'code';
        out += char;
        index += 1;
        continue;
      }
    }
  }

  return out;
}
