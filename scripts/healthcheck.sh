#!/usr/bin/env bash
#
# Uptime watch for Homekrafted.
#
# `/health` and `/health/db` have existed since M8 and nothing has ever
# looked at them, so the site being down and somebody noticing were
# unrelated events. This closes that: a cron checks the two endpoints and
# the public site, and restarts a process that has actually stopped
# answering.
#
#   Install:  sudo bash scripts/healthcheck.sh --install
#   Run now:  sudo bash scripts/healthcheck.sh
#
# Two deliberate limits, so nobody mistakes this for real monitoring:
#
# * **It runs on the box it watches.** If the box is off, nothing reports
#   it. An external check (UptimeRobot, Better Stack — both have free
#   tiers) is the actual answer and takes five minutes to point at
#   https://homekrafted.in/health. This is the half that can be done in
#   code, not a replacement for that.
# * **It restarts, but only after repeated failure.** A single failed
#   request is a blip; restarting on one would turn a hiccup into an
#   outage and hide the cause. Three consecutive failures is a process
#   that is genuinely stuck.
set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/homekrafted-health.log}"
STATE_DIR="${STATE_DIR:-/var/lib/homekrafted-health}"
API_URL="${API_URL:-http://127.0.0.1:4000/health}"
DB_URL="${DB_URL:-http://127.0.0.1:4000/health/db}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000/}"
PUBLIC_URL="${PUBLIC_URL:-https://homekrafted.in/health}"
# The non-canonical host, and what it must redirect to. See
# `check_canonical_host` for why this is worth a check of its own.
WWW_URL="${WWW_URL:-https://www.homekrafted.in/login}"
CANONICAL_HOST="${CANONICAL_HOST:-https://homekrafted.in}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

install_cron() {
  local script_path
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  mkdir -p "$STATE_DIR"
  touch "$LOG_FILE"

  cat > /etc/cron.d/homekrafted-health <<CRON
# Homekrafted uptime check. Installed by scripts/healthcheck.sh.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root /usr/bin/flock -n /tmp/homekrafted-health.lock ${script_path} >> ${LOG_FILE} 2>&1
CRON
  chmod 644 /etc/cron.d/homekrafted-health
  log "Installed /etc/cron.d/homekrafted-health (every 5 minutes). Logs: ${LOG_FILE}"
}

# Returns 0 when the URL answers 200 within the timeout.
check() {
  local url="$1"
  curl -fsS --max-time 10 -o /dev/null "$url" 2>/dev/null
}

# Counts consecutive failures per service, so a blip and a stuck process
# are told apart.
record() {
  # Assigned on separate lines on purpose: `local a="$1" b="${a}.x"` does
  # not reliably see `a` within the same `local` builtin, and under
  # `set -u` that surfaces as "name: unbound variable" at runtime rather
  # than as anything visible while reading the code.
  local name="$1"
  local ok="$2"
  local file="${STATE_DIR}/${name}.fails"
  mkdir -p "$STATE_DIR"
  if [ "$ok" = "yes" ]; then
    if [ -f "$file" ] && [ "$(cat "$file")" != "0" ]; then
      log "RECOVERED: ${name} is answering again after $(cat "$file") failed check(s)"
    fi
    echo 0 > "$file"
    return 0
  fi

  local fails=$(( $( [ -f "$file" ] && cat "$file" || echo 0 ) + 1 ))
  echo "$fails" > "$file"
  log "DOWN: ${name} failed check ${fails}/${FAIL_THRESHOLD}"
  [ "$fails" -ge "$FAIL_THRESHOLD" ]
}

restart() {
  local process="$1"
  log "ACTION: restarting ${process} after ${FAIL_THRESHOLD} consecutive failures"
  pm2 restart "$process" >/dev/null 2>&1 || log "ERROR: pm2 restart ${process} failed"
  # Reset so a restart that works doesn't immediately restart again, and
  # a restart that doesn't gets another full threshold before the next.
  echo 0 > "${STATE_DIR}/${process}.fails"
}

run_checks() {
  mkdir -p "$STATE_DIR"

  if check "$API_URL"; then record api yes || true; else
    record api no && restart homekrafted-api
  fi

  # The database check is reported but never triggers a restart: if
  # Postgres is down, bouncing the API changes nothing and destroys the
  # evidence.
  if check "$DB_URL"; then record db yes || true; else
    record db no || true
    log "NOTE: /health/db is failing — check Postgres, not the API"
  fi

  if check "$WEB_URL"; then record web yes || true; else
    record web no && restart homekrafted-web
  fi

  # The only check that exercises nginx, TLS and DNS together — i.e. what
  # a visitor actually experiences.
  if check "$PUBLIC_URL"; then record public yes || true; else
    record public no || true
    log "NOTE: the public URL is failing while local checks may pass — suspect nginx, TLS or DNS"
  fi

  check_canonical_host
}

# `www` must 301 to the apex, and this is checked because it silently did
# not for months.
#
# One nginx vhost answered for both names, so `www` served the entire
# application on a second origin. Every page rendered — SSR does not care
# about origins — and then every API call from the browser was blocked by
# CORS, because the bundle calls the apex and `CLIENT_ORIGIN` is the apex.
# `fetch` rejects on a CORS block exactly as it does when the network is
# down, so the UI told the visitor to check their connection. Nothing
# reached the server, so nothing was logged, and the only signal that
# anybody could not log in was a customer sending a screenshot.
#
# Every other check here asks "is it up". This one asks "is it the site we
# think it is", which is the class of fault that stays invisible otherwise.
# It restarts nothing: no process is unhealthy, the vhost is wrong, and
# only a human editing nginx can fix that. Most likely cause of a
# regression is a `certbot --nginx` run rewriting the file.
check_canonical_host() {
  local status
  status="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 \
    "$WWW_URL" 2>/dev/null || echo 'ERR')"

  case "$status" in
    301*"$CANONICAL_HOST"* | 308*"$CANONICAL_HOST"*)
      record canonical yes || true
      ;;
    ERR*|"")
      record canonical no || true
      log "NOTE: could not reach ${WWW_URL} to check the canonical redirect"
      ;;
    *)
      record canonical no || true
      log "WRONG: ${WWW_URL} answered '${status}' instead of a 301 to ${CANONICAL_HOST}."
      log "       If www serves the app, nobody arriving there can sign in:"
      log "       the browser calls the apex API and CORS blocks it, which the"
      log "       UI reports as 'check your connection'. See docs/DEPLOY.md,"
      log "       'One origin, and only one'. Fix nginx; no restart will help."
      ;;
  esac
}

case "${1:-}" in
  --install) install_cron; run_checks; log "First run complete." ;;
  "") run_checks ;;
  *) echo "usage: $0 [--install]" >&2; exit 2 ;;
esac
