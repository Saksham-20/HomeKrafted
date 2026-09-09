/**
 * The two `stripComments` implementations must not drift.
 *
 * Same shape and same reason as `geo.ts`'s parity: `client/` and
 * `server/` are separate packages, so the scanner every structural spec
 * depends on exists twice. If one is fixed and the other is not, half the
 * build's structural guarantees quietly stop holding — and they stop by
 * reporting success, which is the failure mode that motivated writing it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from './strip-comments';

const CLIENT_COPY = join(
  __dirname,
  '..',
  '..',
  '..',
  'client',
  'lib',
  'testing',
  'strip-comments.ts',
);

/**
 * The executable half of each file: everything from the state type down,
 * with its own comments removed **by the function under test** — the two
 * copies are allowed to explain themselves differently, and are not
 * allowed to behave differently. Quotes are normalised because one file
 * is Prettier'd with double and the other with single.
 */
function body(source: string): string {
  const start = source.indexOf('type State');
  expect(start).toBeGreaterThan(-1);
  return stripComments(source.slice(start))
    .replace(/['"]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

it('is byte-identical logic to the client copy', () => {
  const ours = readFileSync(join(__dirname, 'strip-comments.ts'), 'utf8');
  const theirs = readFileSync(CLIENT_COPY, 'utf8');
  expect(body(ours)).toBe(body(theirs));
});

it('does not treat a route pattern in prose as a comment opener', () => {
  const source = [
    '// gated when /seller/' + '* and /admin/' + '* were mock',
    "@Roles('admin')",
    '/** a later comment */',
    'export class Thing {}',
  ].join('\n');

  const old = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  // The regression: the decorator this build gates on was invisible.
  expect(old).not.toMatch(/@Roles/);

  const now = stripComments(source);
  expect(now).toMatch(/@Roles\('admin'\)/);
  expect(now).toMatch(/export class Thing/);
  expect(now).not.toMatch(/gated when/);
});
