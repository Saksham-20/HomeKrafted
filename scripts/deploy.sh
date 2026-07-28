#!/usr/bin/env bash
#
# Pull the latest main and redeploy Homekrafted on the box.
#
#   ssh root@<host>
#   /var/www/homekrafted/HomeKrafted/scripts/deploy.sh
#
# Safe to re-run. Everything it does is idempotent, and it refuses to start
# rather than half-deploy: it stops on the first error, and it checks the
# things that have actually bitten us before touching a running service.
#
# Flags:
#   --skip-install   reuse node_modules (faster when only app code changed)
#   --api-only       rebuild + restart the API, leave the web app alone
#   --web-only       rebuild + restart the web app, leave the API alone

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_INSTALL=0
DO_API=1
DO_WEB=1
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --api-only) DO_WEB=0 ;;
    --web-only) DO_API=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
# The env files are never in git. If a deploy ran without them the API would
# boot-loop on its own env validation, so fail loudly here instead.
[ -f server/.env ] || die "server/.env is missing. Restore it before deploying (see docs/DEPLOY.md)."
[ -f client/.env.production ] || die "client/.env.production is missing. Restore it before deploying (see docs/DEPLOY.md)."
command -v pm2 >/dev/null || die "pm2 is not installed."

# Modified tracked files mean someone edited the app directly on the box.
# Refuse rather than clobber their work with a pull. Untracked files are
# deliberately ignored — stray logs, tarballs and editor droppings collect on
# a long-lived box and shouldn't be able to block a deploy.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  die "Working tree on this box has local changes to tracked files. Commit, stash or discard them first."
fi

# --- pull --------------------------------------------------------------------
say "Pulling latest main"
BEFORE="$(git rev-parse HEAD)"
git fetch origin main
git merge --ff-only origin/main
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date at $(git log --oneline -1)"
else
  echo "Updated $(git log --oneline -1 "$BEFORE")  ->  $(git log --oneline -1)"
fi

# --- API ---------------------------------------------------------------------
if [ "$DO_API" = 1 ]; then
  say "Building API"
  cd "$ROOT/server"
  [ "$SKIP_INSTALL" = 1 ] || npm ci
  npx prisma generate
  npx prisma migrate deploy
  npm run build
  [ -f dist/main.js ] || die "server build produced no dist/main.js"

  say "Restarting API"
  cd "$ROOT"
  pm2 restart homekrafted-api --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only homekrafted-api

  # The client build prerenders pages that fetch this API, so it has to be
  # answering before we build the web app — otherwise the export fails on
  # pages like `/` and `/account/wishlist`.
  say "Waiting for API health"
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:4000/health; then
      echo "API healthy after ${i}s"
      break
    fi
    [ "$i" = 30 ] && die "API did not become healthy in 30s. Check: pm2 logs homekrafted-api"
    sleep 1
  done
fi

# --- web ---------------------------------------------------------------------
if [ "$DO_WEB" = 1 ]; then
  if [ "$DO_API" = 0 ]; then
    # --web-only skips the health gate above, but the same build-time
    # dependency on a live API still applies.
    curl -fsS -o /dev/null http://127.0.0.1:4000/health \
      || die "API is not responding on :4000 — the client build needs it. Start it first."
  fi

  say "Building web"
  cd "$ROOT/client"
  [ "$SKIP_INSTALL" = 1 ] || npm ci
  # 1 vCPU / ~4GB box: cap the heap so the build can't OOM the machine.
  NODE_OPTIONS="--max-old-space-size=3072" npm run build

  say "Restarting web"
  cd "$ROOT"
  pm2 restart homekrafted-web --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only homekrafted-web
fi

# --- verify ------------------------------------------------------------------
say "Verifying"
pm2 save --force >/dev/null
sleep 3
FAILED=0
for check in "http://127.0.0.1:4000/health|API" "http://127.0.0.1:3000|web"; do
  url="${check%|*}"; name="${check#*|}"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)"
  if [ "$code" = "200" ]; then
    printf '  %-4s %s\n' "$name" "OK ($code)"
  else
    printf '  %-4s FAILED (%s)\n' "$name" "$code"
    FAILED=1
  fi
done

pm2 list

[ "$FAILED" = 0 ] || die "A service is not serving 200. Check: pm2 logs"
say "Deployed $(git log --oneline -1)"
