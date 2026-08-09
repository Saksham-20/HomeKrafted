#!/usr/bin/env bash
#
# Generate the route inventory from `client/app`, and check it for drift.
#
#   scripts/route-inventory.sh            # print the routes, one per line
#   scripts/route-inventory.sh --check    # exit 1 if docs/route-inventory.tsv
#                                         # disagrees with the filesystem
#
# It exists because every hand-maintained list in this repo has drifted.
# The M26 plan's first Definition-of-Done line is "every route opened", and
# the draft of that plan miscounted its own inventory: 85 where there are
# 87 files, seller listed as 18 where there are 21, admin as 24 where there
# are 23. A list a person retypes is a list that is wrong by the second
# milestone.
#
# `--check` is what CI runs. It compares the *route column* of the coverage
# file against this output, so adding a page without a row is a red build
# rather than a page nobody sweeps.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INVENTORY="docs/route-inventory.tsv"

routes() {
  # `s|/([^/]*)||g` — not `([a-z]*)`. Route groups are parentheses in a
  # directory name and are erased from the URL. The narrower class happened
  # to work while both groups were `(dashboard)`, and would silently keep a
  # `(v2)` or a `(marketing-pages)` in the path, producing a route that
  # 404s and a sweeper hunting a bug that does not exist.
  find client/app -name 'page.tsx' \
    | sed 's|^client/app||; s|/page\.tsx$||; s|/([^/]*)||g; s|^$|/|' \
    | sort -u
}

if [ "${1:-}" != "--check" ]; then
  routes
  exit 0
fi

if [ ! -f "$INVENTORY" ]; then
  echo "route-inventory: $INVENTORY is missing. Create it, or run without --check." >&2
  exit 1
fi

# Column 1, minus the header.
listed="$(tail -n +2 "$INVENTORY" | cut -f1 | sort -u)"
actual="$(routes)"

missing="$(comm -13 <(echo "$listed") <(echo "$actual") || true)"
extra="$(comm -23 <(echo "$listed") <(echo "$actual") || true)"

status=0
if [ -n "$missing" ]; then
  status=1
  echo "route-inventory: these routes exist in client/app and have no row in $INVENTORY:" >&2
  echo "$missing" | sed 's/^/  + /' >&2
fi
if [ -n "$extra" ]; then
  status=1
  echo "route-inventory: these rows in $INVENTORY no longer exist in client/app:" >&2
  echo "$extra" | sed 's/^/  - /' >&2
fi

if [ "$status" -eq 0 ]; then
  echo "route-inventory: $(echo "$actual" | wc -l | tr -d ' ') routes, inventory in step."
else
  echo "" >&2
  echo "A route with no row is a route nobody sweeps. Add it with a tier, the" >&2
  echo "roles that reach it, a resolver for any [dynamic] segment, and its" >&2
  echo "expected status. See docs/M26-QA-PLAN.md §10.1." >&2
fi
exit "$status"
