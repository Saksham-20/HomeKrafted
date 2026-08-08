#!/usr/bin/env bash
#
# Stand up a throwaway QA stack for the M26 sweep.
#
#   ./scripts/qa-up.sh
#   QA_DB=hk_qa2 QA_WEB_PORT=3101 QA_API_PORT=4101 ./scripts/qa-up.sh   # a second sweeper
#
# It prepares everything and then *prints* the two long-running commands
# rather than running them — `start:dev` blocks, so this genuinely needs
# two terminals and pretending otherwise is how the documented setup ended
# up with `cd client` on the line after a command that never returns.
#
# Everything here is idempotent. Re-running against an existing database
# re-seeds it, which is usually what you want mid-sweep; `dropdb $QA_DB`
# first for a clean pass.
#
# This replaces the six-line block that used to live in the plan. That
# block did not work on a cold clone: it assumed `npm install`, it never
# created `server/.env` (gitignored, and the API refuses to boot without
# `JWT_ACCESS_SECRET`), it ran one of the three catalogue seeds so
# `/gifts` and `/meal-plans` came up empty and read as product defects,
# and it left `NEXT_PUBLIC_SITE_URL` unset so every canonical on a
# localhost build pointed at production.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${QA_DB:=hk_qa}"
: "${QA_API_PORT:=4100}"
: "${QA_WEB_PORT:=3100}"
: "${QA_DB_USER:=$USER}"

DB_URL="postgresql://${QA_DB_USER}@localhost:5432/${QA_DB}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --- preconditions ---------------------------------------------------

if ! command -v createdb >/dev/null 2>&1; then
  cat >&2 <<'MSG'
No Postgres client on PATH.

Either install one:      brew install postgresql@16
or use the repo's Docker Postgres, which owns a different role:
                         QA_DB_USER=homekrafted ./scripts/qa-up.sh

(server/.env.example and docs/DEPLOY.md both assume the Docker one; a
host install uses your own username. That mismatch is why the previous
setup block failed with `FATAL: role "<you>" does not exist`.)
MSG
  exit 1
fi

for port in "$QA_API_PORT" "$QA_WEB_PORT"; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo "Port $port is already in use — a previous stack, or another sweeper." >&2
    echo "  free it:      lsof -ti:$port | xargs kill" >&2
    echo "  or move:      QA_WEB_PORT=3101 QA_API_PORT=4101 $0" >&2
    exit 1
  fi
done

# --- database --------------------------------------------------------

say "Database ($QA_DB)"
if createdb "$QA_DB" 2>/dev/null; then
  echo "  created"
else
  echo "  exists — reusing it. You are about to sweep whatever is already in it."
  echo "  For a clean pass:  dropdb $QA_DB && $0"
fi

# --- server ----------------------------------------------------------

say "API"
cd "$ROOT/server"

[ -d node_modules ] || { echo "  npm install"; npm install --silent; }

if [ ! -f .env ]; then
  cp .env.example .env
  # Two *different* secrets. `env.validation.ts` rejects them being equal,
  # and rejects the dev placeholders in production — so generate rather
  # than copy whatever the example ships.
  ACCESS="$(openssl rand -base64 48 | tr -d '\n/+=' | head -c 48)"
  REFRESH="$(openssl rand -base64 48 | tr -d '\n/+=' | head -c 48)"
  # BSD sed (macOS) needs the empty -i argument; GNU sed does not.
  sedi() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }
  sedi "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$ACCESS|" .env
  sedi "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$REFRESH|" .env
  echo "  wrote server/.env with fresh JWT secrets"
else
  echo "  server/.env exists — left alone"
fi

echo "  prisma generate + migrate"
DATABASE_URL="$DB_URL" npx prisma generate >/dev/null
DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null

# All four, and the reason each one matters is in docs/TESTS.md. Seeding
# only the first is how a sweeper opens /meal-plans, sees nothing, and
# files a false P1 about the product.
for seed in seed seed-crafts seed-meal-plans seed-browser-orders; do
  echo "  seed: $seed"
  DATABASE_URL="$DB_URL" npx ts-node "prisma/$seed.ts" >/dev/null
done

# --- client ----------------------------------------------------------

say "Web app"
cd "$ROOT/client"
[ -d node_modules ] || { echo "  npm install"; npm install --silent; }

cat > .env.qa <<EOF
NEXT_PUBLIC_API_URL=http://localhost:$QA_API_PORT/api/v1
# Unset, lib/seo.ts falls back to https://homekrafted.in and Wave 1's
# canonical pass reads production URLs off a localhost build.
NEXT_PUBLIC_SITE_URL=http://localhost:$QA_WEB_PORT
NEXT_PUBLIC_USE_MOCK=false
EOF
echo "  wrote client/.env.qa"

# --- what to run -----------------------------------------------------

cat <<EOF

$(printf '\033[1mReady. Two terminals:\033[0m')

  1)  cd server && DATABASE_URL="$DB_URL" PORT=$QA_API_PORT \\
        CLIENT_ORIGIN=http://localhost:$QA_WEB_PORT SITE_URL=http://localhost:$QA_WEB_PORT \\
        npm run start:dev

  2)  cd client && env \$(grep -v '^#' .env.qa | xargs) PORT=$QA_WEB_PORT npm run dev

Then open http://localhost:$QA_WEB_PORT

  Sweep card:     docs/M26-QA-PLAN.md §7.1 + §7.2
  Coverage:       docs/route-inventory.tsv
  When it breaks: docs/M26-QA-PLAN.md §0.1

A corporate quote token is minted per run and cannot be seeded (it is
stored only as a hash). Mint one from /admin/corporate once the stack is
up; the link is written to the API log, since email is a stub.
EOF
