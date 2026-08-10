#!/usr/bin/env bash
#
# Nightly Postgres backup for Homekrafted.
#
# Until now there were none at all: one bad migration or one dropped table
# lost every order, wallet balance and review, permanently. That was the
# highest-severity open item in docs/LAUNCH-READINESS.md.
#
#   Install:  sudo bash scripts/backup-db.sh --install
#   Run now:  sudo bash scripts/backup-db.sh
#   Restore:  see the drill at the bottom of this file, and DEPLOY.md
#
# Design notes, because each one is a decision someone will want to undo:
#
# * **Custom format** (`-Fc`), not plain SQL. It restores selectively
#   (`pg_restore -t Order`), compresses, and is what `pg_restore` wants.
# * **Verified after writing.** A backup nobody has read is a guess. Every
#   dump is immediately listed with `pg_restore -l`; a corrupt one is
#   deleted and the script exits non-zero rather than leaving a file that
#   *looks* like a backup.
# * **Retention is by count, not by age.** A box that has been off for a
#   week must not delete its only good copies on the day it comes back.
# * **Off-box copy is opt-in and env-gated** (M27). Set `BACKUP_REMOTE`
#   to an rclone/gsutil destination and each verified dump is pushed
#   there, along with the upload archive. Unset, the script behaves
#   exactly as it did before and says so once per run — a local-only
#   backup protects against a bad migration, a dropped table and a bad
#   deploy, but not against losing the box, and the box is a single VPS.
# * **The uploads directory is backed up too, and that is not incidental.**
#   `pg_dump` captures the *URLs* of every HomeKrafter's photographs and
#   none of the bytes. Restoring the database onto a new box without them
#   gives you a catalogue of broken images that no migration can rebuild:
#   those files exist nowhere else, and the people who took them are home
#   cooks who photographed a jar of pickle once.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/homekrafted}"
KEEP="${KEEP:-14}"
DB_NAME="${DB_NAME:-homekrafted}"
LOG_FILE="${LOG_FILE:-/var/log/homekrafted-backup.log}"

# Off-box destination, e.g. `gs://homekrafted-backups` (gsutil) or a
# configured rclone remote like `hk-backups:homekrafted`. Empty = disabled.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
# What holds the HomeKrafter photographs. Matches `UPLOAD_DIR`.
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/homekrafted/uploads}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

install_cron() {
  local script_path
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  touch "$LOG_FILE"

  # 03:15 local time — after the traffic, before anyone is awake to deploy.
  # `flock` so a slow dump can never overlap the next night's run.
  cat > /etc/cron.d/homekrafted-backup <<CRON
# Homekrafted nightly database backup. Installed by scripts/backup-db.sh.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root /usr/bin/flock -n /tmp/homekrafted-backup.lock ${script_path} >> ${LOG_FILE} 2>&1
CRON
  chmod 644 /etc/cron.d/homekrafted-backup

  log "Installed /etc/cron.d/homekrafted-backup (03:15 daily, keeping ${KEEP} dumps in ${BACKUP_DIR})"
  log "Logs: ${LOG_FILE}"
  log "Running one now so the first backup exists and the path is proven..."
}

run_backup() {
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  local stamp file
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="${BACKUP_DIR}/homekrafted-${stamp}.dump"

  log "Dumping ${DB_NAME} -> ${file}"
  sudo -u postgres pg_dump -Fc "$DB_NAME" > "$file"

  # A backup nobody has read is a guess. Reading the archive's table of
  # contents is cheap and catches a truncated or empty file, which is the
  # realistic failure (disk full mid-dump).
  if ! pg_restore -l "$file" > /dev/null 2>&1; then
    log "FAILED: ${file} is not a readable pg_dump archive — deleting it"
    rm -f "$file"
    exit 1
  fi

  local size tables
  size="$(du -h "$file" | cut -f1)"
  tables="$(pg_restore -l "$file" | grep -c 'TABLE DATA' || true)"
  log "OK: ${size}, ${tables} tables with data"

  if [ "$tables" -lt 10 ]; then
    log "FAILED: only ${tables} tables carry data — that is not this database"
    rm -f "$file"
    exit 1
  fi

  # Newest-first, drop everything past $KEEP. By count so an idle box
  # can't age out its last good copy.
  local pruned=0
  while IFS= read -r old; do
    rm -f "$old"
    pruned=$((pruned + 1))
  done < <(ls -1t "${BACKUP_DIR}"/homekrafted-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))")
  [ "$pruned" -gt 0 ] && log "Pruned ${pruned} old backup(s), keeping ${KEEP}"

  push_off_box "$file"

  log "Done. $(ls -1 "${BACKUP_DIR}"/homekrafted-*.dump 2>/dev/null | wc -l) backup(s) on disk."
}

# Copy the verified dump and the upload archive somewhere that is not this
# box. Never fatal: a failed push must not lose the local backup that was
# just taken and verified, so it warns loudly and returns 0. The
# healthcheck line to watch for is "OFF-BOX PUSH FAILED".
push_off_box() {
  local dump="$1"

  if [ -z "$BACKUP_REMOTE" ]; then
    log "Off-box copy: DISABLED (BACKUP_REMOTE unset) — these dumps and every"
    log "  HomeKrafter photo exist only on this box. See docs/DEPLOY.md."
    return 0
  fi

  local tool
  if command -v rclone >/dev/null 2>&1; then
    tool=rclone
  elif command -v gsutil >/dev/null 2>&1; then
    tool=gsutil
  else
    log "OFF-BOX PUSH FAILED: BACKUP_REMOTE is set but neither rclone nor gsutil is installed."
    return 0
  fi

  log "Pushing to ${BACKUP_REMOTE} with ${tool}"

  if [ "$tool" = rclone ]; then
    rclone copy "$dump" "${BACKUP_REMOTE}/db/" 2>&1 | sed 's/^/  /' \
      || { log "OFF-BOX PUSH FAILED: database dump"; return 0; }
    # `sync` rather than `copy` for uploads: it is an archive that only
    # grows (keys are UUIDs, nothing is overwritten), so sync stays cheap
    # and still mirrors deletions if the day comes.
    rclone sync "$UPLOAD_DIR" "${BACKUP_REMOTE}/uploads/" 2>&1 | sed 's/^/  /' \
      || { log "OFF-BOX PUSH FAILED: uploads"; return 0; }
  else
    gsutil -q cp "$dump" "${BACKUP_REMOTE}/db/" \
      || { log "OFF-BOX PUSH FAILED: database dump"; return 0; }
    gsutil -m -q rsync -r "$UPLOAD_DIR" "${BACKUP_REMOTE}/uploads/" \
      || { log "OFF-BOX PUSH FAILED: uploads"; return 0; }
  fi

  log "Off-box copy complete."
}

case "${1:-}" in
  --install) install_cron; run_backup ;;
  --restore-drill)
    # Proves the dump actually restores, into a throwaway database. Run it
    # after installing, and again after any schema change worth worrying
    # about — an untested backup is a hope, and the day you find out is
    # always the worst day.
    latest="$(ls -1t "${BACKUP_DIR}"/homekrafted-*.dump 2>/dev/null | head -1)"
    [ -z "$latest" ] && { log "No backups to drill against"; exit 1; }
    drill="homekrafted_restore_drill"
    log "Restoring ${latest} into ${drill}"
    sudo -u postgres dropdb --if-exists "$drill"
    sudo -u postgres createdb "$drill"

    # Piped on stdin rather than passed as a path. `sudo -u postgres` drops
    # to a user that cannot read this directory — it is 700 and root-owned,
    # deliberately, because these dumps contain every customer's address and
    # order history. Redirecting means root opens the file and postgres just
    # reads the descriptor. The first run of this drill failed exactly here
    # ("could not open input file: Permission denied"), which is the whole
    # argument for having a drill rather than trusting the dump.
    if ! sudo -u postgres pg_restore -d "$drill" < "$latest"; then
      log "FAILED: ${latest} did not restore cleanly"
      sudo -u postgres dropdb --if-exists "$drill"
      exit 1
    fi

    log "Row counts in the restored copy:"
    sudo -u postgres psql -d "$drill" -c \
      'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Order") AS orders, (SELECT count(*) FROM "Product") AS products;'
    sudo -u postgres dropdb "$drill"
    log "Drill complete — the dump restores, and the throwaway copy is gone."
    ;;
  "") run_backup ;;
  *) echo "usage: $0 [--install|--restore-drill]" >&2; exit 2 ;;
esac
