#!/usr/bin/env bash
# Remove the seeded demo accounts, the day real customers arrive.
#
# `docs/LAUNCH-READINESS.md` §0.2 has carried this as an owed action since
# M18: the seed creates demo shoppers and three demo HomeKrafters sharing
# one password, their numbers are the `OTP_TEST_PHONES` allowlist, and
# anyone who reads `docs/TESTING.md` can sign in as them. That is fine
# while the site is being tested and stops being fine at the first real
# signup.
#
# It existed only as a sentence, which meant doing it under time pressure
# as hand-written SQL against production. This is that action, reviewable
# in advance and safe to dry-run.
#
# WHAT IT WILL NOT DO
#   - It deletes an explicit allowlist of seeded ids. It never pattern-
#     matches on "demo": a real HomeKrafter called "Demo Kitchen" is not a
#     hypothetical, and a LIKE '%demo%' would take them with it.
#   - It refuses any account that has real activity behind it — orders,
#     reviews, or a non-zero wallet. A demo account somebody actually
#     transacted with is evidence, not clutter, and deleting it would take
#     an order history with it.
#
# Run ON THE BOX:
#   bash /var/www/homekrafted/HomeKrafted/scripts/delete-demo-accounts.sh          # dry run
#   bash /var/www/homekrafted/HomeKrafted/scripts/delete-demo-accounts.sh --apply
#
# AFTERWARDS, and this is the half a script cannot do for you: unset
# OTP_TEST_CODE and OTP_TEST_PHONES in server/.env and restart. They are
# the same exposure — the accounts and the fixed code that opens them —
# and removing one without the other leaves a bypass pointed at nothing,
# which is the state somebody later "fixes" by re-adding a number.
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

DB="${DEMO_CLEANUP_DB:-homekrafted}"
# `sudo -u postgres` is how the box reaches its database, matching
# `rotate-admin.sh`. Overridable so the dry run can be exercised against a
# scratch database on a laptop, where there is no `postgres` user — a
# script whose safety checks have never been run is not a safety check.
if [ -n "${DEMO_CLEANUP_PSQL:-}" ]; then
  # shellcheck disable=SC2206
  PSQL=(${DEMO_CLEANUP_PSQL} -d "$DB" -v ON_ERROR_STOP=1 -tA)
else
  PSQL=(sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -tA)
fi

# The seeded ids, from `server/prisma/seed.ts`. Explicit on purpose — see
# the header. Add to this list only from the seed file.
DEMO_IDS=(
  'user-demo'
  'user-seller-demo'
  'user-seller-laundry-demo'
  'user-seller-snack-demo'
)

# `user-admin-demo` is deliberately absent. Deleting the only admin
# account locks everybody out of the panel; that one is rotated instead
# (`scripts/rotate-admin.sh`, LAUNCH-READINESS §0.1), and it should have
# been rotated long before this script is ever run.

ID_LIST=$(printf "'%s'," "${DEMO_IDS[@]}")
ID_LIST="${ID_LIST%,}"

echo "Database: $DB"
echo "Candidates: ${#DEMO_IDS[@]} seeded demo accounts"
echo

# --- Refuse anything with real activity behind it ----------------------
BLOCKED=$("${PSQL[@]}" <<SQL
SELECT u.id
     || '  orders=' || (SELECT count(*) FROM "Order" o WHERE o."userId" = u.id)
     || '  reviews=' || (SELECT count(*) FROM "Review" r WHERE r."userId" = u.id)
     || '  balance=' || COALESCE((SELECT w.balance FROM "Wallet" w WHERE w."userId" = u.id), 0)
FROM "User" u
WHERE u.id IN ($ID_LIST)
  AND (
    EXISTS (SELECT 1 FROM "Order" o WHERE o."userId" = u.id)
    OR EXISTS (SELECT 1 FROM "Review" r WHERE r."userId" = u.id)
    OR COALESCE((SELECT w.balance FROM "Wallet" w WHERE w."userId" = u.id), 0) <> 0
  );
SQL
)

if [ -n "$BLOCKED" ]; then
  echo "REFUSING — these demo accounts have real activity:"
  echo "$BLOCKED" | sed 's/^/  /'
  echo
  echo "Someone transacted with them. Deleting one would take an order"
  echo "history with it. Decide per account: either keep it (and rename it"
  echo "so it stops looking like a demo), or remove it from DEMO_IDS above"
  echo "and handle it deliberately."
  exit 1
fi

# --- What would go -----------------------------------------------------
echo "These accounts will be deleted:"
"${PSQL[@]}" -c "SELECT id || '  ' || COALESCE(email, phone, '(no contact)') || '  role=' || role FROM \"User\" WHERE id IN ($ID_LIST) ORDER BY id;" | sed 's/^/  /'
echo

if [ "$APPLY" -ne 1 ]; then
  echo "DRY RUN — nothing was deleted. Re-run with --apply."
  exit 0
fi

read -rp "Type DELETE to confirm: " CONFIRM
[ "$CONFIRM" = "DELETE" ] || { echo "Aborted."; exit 1; }

# One statement. Every table that references `User` does so with
# `onDelete: Cascade` or a nullable FK (see `prisma/schema.prisma`), so
# the cascade is the schema's own answer to "what else goes" — safer than
# a hand-maintained delete order that goes stale as tables are added.
"${PSQL[@]}" -c "DELETE FROM \"User\" WHERE id IN ($ID_LIST);"

echo
echo "Done. Remaining users:"
"${PSQL[@]}" -c 'SELECT count(*) FROM "User";' | sed 's/^/  /'
echo
echo "NOW DO THE OTHER HALF: unset OTP_TEST_CODE and OTP_TEST_PHONES in"
echo "server/.env and restart, or the fixed sign-in code is still live."
