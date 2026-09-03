#!/bin/sh
# Downloads the three brand families (loaded by next/font/google in the app,
# so nothing is on disk) into .design-sync/fonts/ + writes fonts.css.
# Families: Fraunces 400-700 + italic, IBM Plex Sans 400/500/600,
# IBM Plex Mono 400/500 - matching app/layout.tsx. Latin + latin-ext only.
# Re-run only to change the families; the output is committed.
set -e
cd "$(dirname "$0")"
mkdir -p fonts
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
URL="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
curl -sS -A "$UA" "$URL" -o fonts/.raw.css
node ./rewrite-fonts.mjs
rm -f fonts/.raw.css
