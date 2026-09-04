# Deploying Homekrafted

Runs on a single VPS, serving the web app and the API behind one nginx.

- **Site:** https://homekrafted.in — `www` and all plain HTTP 301 to it
- **Box:** `ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48` (Ubuntu 24.04)
- **App root:** `/var/www/homekrafted/HomeKrafted` — a git clone tracking `main`

## Domain & TLS

DNS is at Hostinger. `@` and `www` are **A records to `187.127.171.48`**;
everything else on the zone belongs to other systems and must stay put —
the two `MX`, the SPF `TXT`, `_dmarc`, the three `hostingermail-*._domainkey`
DKIM `CNAME`s, `autodiscover` and `autoconfig` are Hostinger email, and
`order`, `ordernew`, `admin` and `kitchen` point at a **different** box
(`62.72.28.224`) running the older ordering system. Changing the apex does
not affect any of them.

### One origin, and only one — `www` must 301 to the apex

**This is a login-breaking configuration, and it was live.** Until
2026-08-11 the TLS vhost answered for `homekrafted.in` *and*
`www.homekrafted.in`, and certbot's port-80 redirect used `$host`, so
`http://www` became `https://www` and stayed there. `www` served the whole
application on a second origin.

It failed in the worst available way — silently, and looking like the
user's fault:

- the browser bundle calls the API at `https://homekrafted.in/api/v1`
  (`NEXT_PUBLIC_API_URL`, baked at build time), and the API's CORS
  allowlist is `CLIENT_ORIGIN`, the apex;
- so a visitor on `www` got every page rendered correctly by SSR, then had
  **every** API call blocked by CORS. `fetch` rejects with a `TypeError`,
  which `client/lib/api/http.ts` maps to *"Can't reach Homekrafted right
  now. Check your connection and try again."*
- the page's own CSP (`default-src 'self'`) would have blocked the same
  call independently;
- nothing was logged anywhere, because the request never reached the
  server. It took a user sending a screenshot to find.

Two guards now exist, and both should stay:

1. A dedicated `www` vhost that does nothing but
   `return 301 https://homekrafted.in$request_uri;`, and the apex vhost no
   longer lists `www` in its `server_name`. **After any `certbot --nginx`
   run, re-check this** — certbot rewrites the file and will happily put
   `www` back on the main vhost.
2. `scripts/healthcheck.sh` asserts `www` 301s to the apex, so a
   regression is reported by the machine rather than by a customer.

If you ever genuinely need a second origin to serve the app, it must be
added to **both** `CLIENT_ORIGIN` (CORS) and the CSP — but prefer not to.

The cert is Let's Encrypt via `certbot --nginx`, covering `homekrafted.in`
and `www.homekrafted.in`, renewed automatically by `certbot.timer`:

```bash
certbot certificates                 # what's installed, and when it expires
systemctl list-timers certbot.timer  # next renewal check
certbot renew --dry-run              # rehearse a renewal
```

If a `--dry-run` reports "Another instance of Certbot is already running",
that is the timer holding the lock, not a failure — re-run it after the
timer's check finishes.

**One gotcha when repointing a name:** deleting a `CNAME` and adding an `A`
leaves a window where the name doesn't resolve, and resolvers cache that
NXDOMAIN for the zone's SOA negative TTL (600s here). The name will look
dead for up to ten minutes after the record is correct. Confirm with
`dig +short @ns1.dns-parking.com <name>` (authoritative, uncached) before
believing anything is actually broken.

## Updating the site

Push to `main`, then on the box:

```bash
ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48
/var/www/homekrafted/HomeKrafted/scripts/deploy.sh
```

Or as a one-liner from your laptop:

```bash
ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48 \
  '/var/www/homekrafted/HomeKrafted/scripts/deploy.sh'
```

That pulls `main`, installs, runs migrations, rebuilds both apps, restarts
pm2 and health-checks the result. It's safe to re-run, and it stops on the
first error rather than half-deploying.

Faster variants when you know what changed:

```bash
scripts/deploy.sh --skip-install   # no dependency changes
scripts/deploy.sh --web-only       # frontend-only change
scripts/deploy.sh --api-only       # backend-only change
```

## How it's wired

| Piece | Where |
|---|---|
| Web (Next.js) | pm2 `homekrafted-web`, `next start` on 127.0.0.1:3000 |
| API (NestJS) | pm2 `homekrafted-api`, `server/dist/main.js` on :4000 |
| Process config | `ecosystem.config.cjs` (in git) |
| nginx | `/etc/nginx/sites-available/homekrafted` — :443 TLS for `homekrafted.in` **only**, a second :443 vhost 301ing `www` to the apex, :80 `default_server` redirecting to https on the apex; `/api/` and `/health` → :4000, everything else → :3000. See "One origin, and only one" below — this was wrong for months |
| API compression | **gzip is applied by the Node process, not nginx** (M48) — `compression({ threshold: 1024 })` in `server/src/main.ts`. nginx gzips the web app but not the proxied API, and `/api/v1/products` was going out at 17 KB uncompressed. If you add `gzip_proxied` to the vhost the two do not fight; nginx passes an already-encoded body through. Check with `curl -sI -H 'Accept-Encoding: gzip' https://homekrafted.in/api/v1/products \| grep -i content-encoding` |
| Uploaded images | `/var/lib/homekrafted/uploads`, served by nginx at `/uploads/` — **outside the git clone on purpose** |
| Database | local Postgres 16, db and role both `homekrafted` |
| Boot | `pm2 startup systemd` + `pm2 save`, so both apps come back after a reboot |

The box has a 2 GB swapfile. It has 1 vCPU and ~4 GB RAM, and `next build`
needs the headroom.

## Uploaded images

**M16:** uploaded photos are served through `next/image` now, so nginx
serving `/uploads/` on the **same origin as the app** is what makes them
optimisable without an `images.remotePatterns` allowlist. If uploads ever
move to a CDN on another host, that config has to be widened
deliberately — see `client/next.config.ts`.

User-uploaded photos (`POST /uploads`, see `docs/API.md`) are written to
`UPLOAD_DIR` and served by nginx straight from disk at `/uploads/` — they
never touch Node on the read path.

**Every upload is re-encoded before it is written (M25).** `sharp` caps
the longest edge at 2000px, converts to WebP, and strips all metadata —
which is a privacy control, not a size optimisation: phone photos carry
EXIF GPS, so unstripped listing images published a home cook's address.
Consequences for this box:

- **`sharp` is a native dependency.** `npm ci` in `server/` fetches a
  prebuilt libvips binary for linux-x64. If a deploy ever fails resolving
  it, that is the cause; there is no pure-JS fallback and the upload
  endpoint will not start without it.
- Encoding runs **inline on the request thread**, ~100ms per image on this
  1 vCPU box. That is why the format is WebP and not AVIF, which would be
  seconds.
- `UPLOAD_MAX_BYTES` is **12MB** (was 5MB). It is an abuse ceiling, not a
  storage budget — what lands on disk is a few hundred KB whatever
  arrives. Raising it does not increase what is stored; it only widens
  what will be decoded, so keep it under the 15MB multipart hard limit.

**On a dev box, set `UPLOAD_DIR` to somewhere you can write**
(2026-09-04). The default is the box path above, which a developer's user
cannot `mkdir`, so every upload failed with `EACCES` — the failure looked
like a broken upload feature rather than a missing env var. `server/.env`
on a laptop wants something like `UPLOAD_DIR=<repo>/server/.uploads`
(gitignored). Reading them back is handled: when `STORAGE_DRIVER=local`
the API serves `UPLOAD_DIR` at `/uploads/`, which is what
`next.config.ts`'s dev rewrite has always assumed. In production nginx
matches `/uploads/` before anything reaches Node, so that route is never
used there.

**`UPLOAD_DIR` must stay outside `/var/www/homekrafted/HomeKrafted`.**
Deploys `git merge --ff-only` in that clone and the clone is disposable;
anything written inside it is one `git clean` away from gone. The default
is `/var/lib/homekrafted/uploads` for exactly that reason.

```bash
du -sh /var/lib/homekrafted/uploads          # how much has accumulated
find /var/lib/homekrafted/uploads -type f | wc -l
```

Nothing reclaims space yet: replacing a listing photo leaves the old file
on disk, because the row only ever held the new URL. That is fine at
current volume and is the first thing to revisit if the disk gets tight —
the endpoint returns a `key` specifically so a caller can delete later.

Storage is behind a driver (`server/src/uploads/storage/`). Moving to S3,
R2 or Cloudinary means implementing `StorageDriver`, registering it in
`UploadsModule` and setting `STORAGE_DRIVER` — existing rows keep working,
because what is persisted is the URL the driver returned, not a
driver-specific key. An unrecognised `STORAGE_DRIVER` fails at boot rather
than silently falling back to local disk.

## Reel footage (M52)

The home page's reels are real clips, committed under
`client/public/videos/reels/` and served by Next from `public/` — same
origin, byte-range requests answered (`206`), and a week of
`Cache-Control` added by `next.config.ts#headers`. The files are **not**
content-hashed, so a re-shot clip keeps its filename and is stale for at
most that week. ~33 MB in the clone for the first four; budget for it in
git, not in nginx.

**Two renditions per clip, plus a still.** `videoSrc` is what the viewer
plays with sound; `previewSrc` is the eight-second silent cut the rail
card plays under the pointer; `posterSrc` under
`client/public/images/reels/` is a frame of the clip itself, and it goes
through `next/image` on the card. The recipe, from the clone root:

```bash
# Full rendition. Re-encode ONLY when the source is not already H.264
# (an iPhone shoots HEVC, which Chrome and Firefox on most desktops
# cannot play). `-map_metadata -1` is the privacy control: a phone clip
# carries the GPS of the kitchen it was shot in, same as the M25 photo
# pipeline one directory over.
ffmpeg -i IN.MP4 -vf "scale=720:-2:flags=lanczos:out_range=tv,format=yuv420p" -r 30 \
  -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 24 -maxrate 2000k -bufsize 4000k \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart -map_metadata -1 -map_chapters -1 \
  client/public/videos/reels/<slug>.mp4

# A source that is already H.264 is REMUXED, never re-encoded: CRF on a
# 0.9 Mbps phone clip inflates it (measured 7.7 MB → 12.9 MB) and loses
# a generation for nothing.
ffmpeg -i IN.mp4 -c copy -movflags +faststart -map_metadata -1 -map_chapters -1 \
  client/public/videos/reels/<slug>.mp4

# Rail preview: first 8 s, 360 px wide, no audio track, ~300 KB.
ffmpeg -t 8 -i IN.mp4 -vf "scale=360:-2:flags=lanczos:out_range=tv,format=yuv420p" -r 30 -an \
  -c:v libx264 -profile:v main -level 3.1 -preset slow -crf 29 \
  -movflags +faststart -map_metadata -1 -map_chapters -1 \
  client/public/videos/reels/<slug>.preview.mp4

# Poster: one real frame, 720 wide.
ffmpeg -ss <seconds> -i IN.mp4 -frames:v 1 -vf "scale=720:-2" -q:v 3 \
  client/public/images/reels/<slug>.jpg
```

Then one entry in `client/lib/data/reels.ts`. Check the result with
`ffprobe -show_entries format_tags <file>` — nothing but the container
brand and the encoder should print.

**Optional, once traffic justifies it:** nginx can serve the clips
straight from disk instead of proxying them through Node, which on the
box's one vCPU is the cheaper read path for a 10 MB file:

```nginx
location /videos/ {
    alias /path/to/clone/client/public/videos/;
    add_header Cache-Control "public, max-age=604800, stale-while-revalidate=86400";
    sendfile on; tcp_nopush on;
}
```

The URL does not change, so nothing in the app notices either way.

## Env files — the one thing not in git

`.gitignore` excludes `.env*`, so these two live only on the box and survive
every deploy. **If you rebuild the box, recreate them before deploying** —
`scripts/deploy.sh` refuses to run without them.

`server/.env` — see `server/.env.example` for the full list. The values that
matter in production:

```
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://homekrafted.in
# `connection_limit` is not optional here (M31): without it Prisma sizes
# the pool as `num_cpus * 2 + 1`, which is **3** on this 1 vCPU box, and
# every screen that fans out wider than that (the seller dashboard runs
# ~10 queries in one Promise.all) silently executes three at a time.
DATABASE_URL="postgresql://homekrafted:<password>@localhost:5432/homekrafted?schema=public&connection_limit=10"
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<a different openssl rand -base64 48>

# M18 — the canonical public origin, used for links the server *sends*
# (the password-reset email, the "confirm and start packing" link a
# HomeKrafter gets). Distinct from CLIENT_ORIGIN, which is a CORS
# allowlist and may hold several entries; a link needs exactly one.
SITE_URL=https://homekrafted.in

# M18 — the fixed OTP code that verifies without an SMS, so the phone
# sign-in flow is testable while TWILIO_* is a placeholder.
#
# READ BEFORE CHANGING. Phone OTP *creates* an account for a number it
# does not recognise, so a fixed code accepted for any number would be a
# complete authentication bypass. It is therefore scoped: only the
# numbers in OTP_TEST_PHONES, never an admin account, and both variables
# must be set or the bypass does not exist at all. These are the seeded
# demo accounts and nothing else. Unset OTP_TEST_CODE the day real SMS
# starts working.
OTP_TEST_CODE=123456
# Empty on production since 2026-09-03: the seeded demo accounts were
# purged, so there is no number left for the fixed code to match. Add
# your own number here only for a deliberate, temporary test.
OTP_TEST_PHONES=
```

The API validates its own env at boot and refuses to start on a missing or
placeholder secret, so a bad `.env` shows up as a pm2 restart loop — check
`pm2 logs homekrafted-api`.

`client/.env.production`:

```
NEXT_PUBLIC_API_URL=https://homekrafted.in/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder
NEXT_PUBLIC_USE_MOCK=false
# M15 — the absolute origin canonicals, Open Graph images, the sitemap
# and every JSON-LD `url` are built from. Must match the real origin: a
# staging box left on the production value advertises production URLs to
# crawlers and social unfurlers. Defaults to https://homekrafted.in.
NEXT_PUBLIC_SITE_URL=https://homekrafted.in
```

`NEXT_PUBLIC_*` values are inlined **at build time**, so changing one means a
rebuild, not just a restart.

WhatsApp and Twilio keys are still placeholders. The server degrades
gracefully around each (logged-only sends), so the flows stay exercisable
without real accounts.

### Email — Resend (2026-09-04)

Email is the channel the whole supply side depends on: an approved
HomeKrafter's set-password invite goes out on it, and with no key that
invite reaches nobody (the standing blocker in `CLAUDE.md`).

Three env vars on the box, in `server/.env`:

```bash
RESEND_API_KEY=re_…                       # from resend.com → API Keys
EMAIL_FROM=Homekrafted <hello@homekrafted.in>
EMAIL_REPLY_TO=                            # optional; empty = replies go to EMAIL_FROM
```

**Resend refuses to send from an unverified domain**, so the DNS step is
not optional and is the thing that will actually bite:

1. Resend dashboard → **Domains** → add `homekrafted.in`.
2. It gives you a DKIM `TXT` (usually `resend._domainkey`) and an SPF
   `TXT`. Publish both at **Hostinger**, where the rest of this domain's
   DNS lives (see the DNS section above — the existing DKIM `CNAME`s and
   `autodiscover`/`autoconfig` records are Hostinger *email* and are
   unrelated; do not remove them).
3. Wait for Resend to show the domain **Verified**.
4. Restart the API (`pm2 restart homekrafted-api`) — the key is read at
   boot.

Then prove it, rather than approving a real kitchen to find out:

```bash
cd /var/www/homekrafted/HomeKrafted/server
node scripts/send-test-email.mjs you@example.com
```

It prints the provider's own answer. The two failures that matter read
completely differently — `403 ... domain is not verified` means step 2 or
3 is incomplete, `401` means the key is wrong or revoked.

`validateEnv` refuses to boot if a real key is set with an empty
`EMAIL_FROM`, or with the placeholder `@homekrafted.example` domain — both
of those otherwise fail silently, days later, as "the invite never
arrived".

`EMAIL_PROVIDER=sendgrid` still selects the old transport; with a
`RESEND_API_KEY` set, Resend is used.

**Razorpay is on real test keys as of 2026-09-01** — the `rzp_test_…` pair in the owner-supplied CSV.
`cardPaymentsEnabled` is therefore `true` and checkout opens a real
Razorpay test-mode widget. Verified end to end: order creation, wallet
top-up capture, checkout capture, per-order de-duplication, webhook replay
idempotency and signature rejection.

### Switching Razorpay to live keys

**It is a server-side env change and nothing else.** Nothing in the tree
branches on `rzp_test_` versus `rzp_live_` — the only key-sensitive gate is
`PaymentsService.isMockMode`, which compares against the literal
`.env.example` placeholders. And the browser takes the key from the API
response (`rzpOrder.keyId || NEXT_PUBLIC_RAZORPAY_KEY_ID`), so the server's
key wins and **no client rebuild is required**. Steps:

1. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `server/.env`.
2. Set `RAZORPAY_WEBHOOK_SECRET` to the secret you enter in the Razorpay
   dashboard's webhook form (Settings → Webhooks). It is chosen by you and
   must match on both sides. **Subscribe to `payment.captured`** — it is
   the only event handled; everything else is acknowledged as a no-op.
   Webhook URL: `https://homekrafted.in/api/v1/payments/razorpay/webhook`.
3. `pm2 restart homekrafted-api`. `GET /api/v1/payments/razorpay/config`
   should report `{"cardPaymentsEnabled":true}`.

Update `NEXT_PUBLIC_RAZORPAY_KEY_ID` too for tidiness, but it is only a
fallback — it is not what is used.

### Shadowfax courier despatch (M57)

**Off by default (`SHADOWFAX_ENABLED=false`).** Booking a real rider costs
real money and every kitchen that hands its own parcels over must keep
working untouched.

| Variable | Notes |
|---|---|
| `SHADOWFAX_ENABLED` | Master switch. `false` = the module is dormant. |
| `SHADOWFAX_API_TOKEN` | Issued per environment. **Staging and production tokens are different** — a staging token on the production host returns a bare 401. |
| `SHADOWFAX_BASE_URL` | Staging `https://dale.staging.shadowfax.in/api`, production `https://dale.shadowfax.in/api`. |
| `SHADOWFAX_CALLBACK_TOKEN` | A secret **you** choose and enter in their client portal. Empty = the callback endpoint refuses everything. |
| `SHADOWFAX_POLL_SECONDS` | `0` = no background poll. `900` is a sensible value. Floored at 60. |

**Two things must be done in Shadowfax's client portal, not here:**

1. **Webhook tab** — set the callback URL to
   `https://homekrafted.in/api/v1/shipping/shadowfax/callback` and the
   `Authorization` header to `Token <SHADOWFAX_CALLBACK_TOKEN>`. Until this
   is done **no push callback arrives at all**, and `SHADOWFAX_POLL_SECONDS`
   is the entire auto-update.
2. **Pincode serviceability** — confirm the launch city is enabled for
   `seller_pickup`. Measured 2026-09-01, staging refuses pickup from
   Chandigarh `160022` ("Invalid Pickup Pincode … is not serviceable") and
   only serves the carrier's documented test pincodes `110009`, `560007`,
   `560077`. **Verify production coverage for the tricity before enabling
   the switch**, or every booking fails into the despatch queue.

Note also that Shadowfax refuses a booking with **HTTP 200** and
`{"message":"Failure","errors":"…"}`. The presence of an AWB is the check,
not `res.ok`; `errors` is surfaced verbatim onto `Consignment.failureReason`
because it is the only sentence saying what to fix.

**What that costs, concretely, as of M18.** Order events now fan out to
WhatsApp and email by default for both the buyer and the HomeKrafter
(`defaultChannelsFor`), and password reset emails a link. All of it is
wired and tested; none of it leaves the box until `WHATSAPP_*` and
`SENDGRID_API_KEY` are real. Until then the messages land in
`pm2 logs homekrafted-api` as `[WHATSAPP STUB]` / `[EMAIL STUB]` lines —
which is also where to look to confirm the fan-out is firing.

## Demo-content seeders — the four that are safe on production

`server/prisma/seed.ts` **clears every table it owns** before re-inserting.
That is right for a dev reset and catastrophic anywhere real. **Never run it
against production.**

These four are different, and are safe to run there:

```
cd server
npx ts-node prisma/seed-meal-plans.ts   # demo meal plans on existing kitchens
npx ts-node prisma/seed-crafts.ts       # 4 craft categories, 2 craft makers, 8 listings
npx ts-node prisma/seed-avatars.ts      # M56: chef characters on the demo storefronts (slug allowlist)
npx ts-node prisma/seed-catalogue.ts    # M56: craft photos + tiles, Sweets & Ladoos, 14 new listings, shipping scopes
```

Order matters only for the M56 pair: run them **after** the client deploy
that ships the images (they point at `/images/...` paths in the build) and
after `seed-crafts.ts` (the craft backfills match on its slugs).
`seed-avatars.ts` updates only rows whose avatar is NULL or the pre-M28
shared stock path; `seed-catalogue.ts` never overwrites an image somebody
set.

All only ever insert or fill blanks, match on slug, and never delete — so a
second run is a no-op and no existing row is touched. `seed-crafts.ts` also recomputes
`Category.productCount` from the rows rather than incrementing it, the same
rule M15 set for ratings.

`seed-crafts.ts` creates two HomeKrafter logins
(`studio@theslowstudio.example`, `hello@maatiandthread.example`) on the
documented demo password — same as the kitchens in `docs/TESTING.md`. If
that is not wanted on a production box, delete those two users after running
it; the vendors and listings survive without them, they just become
unmanageable from the portal.

## Gotcha: the API must be up before the client builds

`client`'s build prerenders pages that call the API — `/` fetches reels,
`/account/wishlist` fetches the wishlist. If the API isn't answering through
nginx, those fetches get an HTML error page instead of JSON and the build
fails with a JSON-parse or 404 error.

`scripts/deploy.sh` handles this: it builds and restarts the API first, waits
for `/health`, and only then builds the web app. If you ever build by hand,
keep that order.

## First-time box setup

Only needed on a fresh machine. Node 20+, nginx, Postgres 16, pm2 and git.

```bash
git clone https://github.com/Saksham-20/HomeKrafted.git /var/www/homekrafted/HomeKrafted
cd /var/www/homekrafted/HomeKrafted

# Upload directory — deliberately outside the clone (see "Uploaded images")
mkdir -p /var/lib/homekrafted/uploads

# Postgres role + database
sudo -u postgres psql -c "CREATE ROLE homekrafted LOGIN PASSWORD '<password>';"
sudo -u postgres psql -c "CREATE DATABASE homekrafted OWNER homekrafted;"

# Create server/.env and client/.env.production (see above), then:
cd server && npm ci && npx prisma migrate deploy && npx prisma db seed && npm run build && cd ..
pm2 start ecosystem.config.cjs --only homekrafted-api
cd client && npm ci && npm run build && cd ..
pm2 start ecosystem.config.cjs --only homekrafted-web
pm2 save && pm2 startup systemd

# nginx: one default_server on :80, /api/ + /health -> :4000, / -> :3000
ln -sf /etc/nginx/sites-available/homekrafted /etc/nginx/sites-enabled/homekrafted
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ufw allow 'Nginx Full'          # 80 + 443

# TLS, once DNS points here (certbot rewrites the nginx file in place)
certbot --nginx -d homekrafted.in -d www.homekrafted.in \
  --agree-tos -m support@homekrafted.in --redirect
```

`npx prisma db seed` is first-time only — it creates the demo accounts in
`docs/TESTING.md`. Re-running it on a live database will duplicate records.
`scripts/deploy.sh` deliberately runs `migrate deploy` and never seeds.

**It now refuses to run with `NODE_ENV=production` unless
`SEED_ADMIN_PASSWORD` is set**, and refuses that too if it is the demo
password. The line above is exactly how `admin@homekrafted.example` came
to exist on production holding a credential that was readable in the
public JS bundle — see `docs/LAUNCH-READINESS.md` §0.1. So:

```bash
SEED_ADMIN_PASSWORD='<a real password>' npx prisma db seed
```

Only the admin account reads it; the demo shopper and HomeKrafter logins
in `docs/TESTING.md` are unchanged, and a development seed (`NODE_ENV`
unset) needs no new variable at all. To fix an **already-seeded** admin,
this is the wrong tool — use `scripts/rotate-admin.sh`.

## Backups, monitoring and log rotation

Three cron-installed pieces. Each is one command, and each replaces
something that was previously absent entirely.

### Database backups (do this first)

```bash
sudo bash /var/www/homekrafted/HomeKrafted/scripts/backup-db.sh --install
```

Nightly `pg_dump -Fc` at 03:15 into `/var/backups/homekrafted`, keeping
the last 14. Every dump is verified with `pg_restore -l` immediately after
writing and deleted if it doesn't read back — a backup nobody has read is
a guess. Logs to `/var/log/homekrafted-backup.log`.

**Prove it restores, then prove it again after any schema change:**

```bash
sudo bash scripts/backup-db.sh --restore-drill
```

That restores the newest dump into a throwaway database, prints row
counts for `User`/`Order`/`Product`, and drops it. The day you find out a
backup doesn't restore should never be the day you need it.

### Getting the copies off the box (M27)

A local backup covers a bad migration, a dropped table and a bad deploy.
It does not cover losing the VPS, and this is a single VPS.

```bash
# In the cron environment (/etc/cron.d/homekrafted-backup) or the shell
# you run the script from:
export BACKUP_REMOTE="gs://homekrafted-backups"   # or an rclone remote
```

Set, each verified dump is pushed there **and the upload archive is
mirrored**. Unset, nothing changes and the log says so once per run.

**The uploads half is the part people skip, and it is the unrecoverable
one.** `pg_dump` captures the *URLs* of every HomeKrafter's photographs
and none of the bytes. Restore the database onto a new box without
`/var/lib/homekrafted/uploads` and you have a catalogue of broken images
that no migration can rebuild — those files exist nowhere else, and the
people who took them are home cooks who photographed a jar of pickle
once.

**Harden the destination**, because a backup the box can delete is not a
backup:

- The service account gets **`roles/storage.objectCreator` only** — create,
  not delete or overwrite. Whoever owns the box then cannot destroy its
  own backups, which is the ransomware shape.
- Turn on **object versioning** and a **retention policy** on the bucket.
- Add a **lifecycle rule** to expire old versions, or it grows forever.
- Keep it a **separate, private bucket** from the public uploads one.

Watch for `OFF-BOX PUSH FAILED` in `/var/log/homekrafted-backup.log`. A
failed push is deliberately non-fatal — it must never discard the local
backup that was just taken and verified — so nothing else will tell you.

### Uptime checks

```bash
sudo bash /var/www/homekrafted/HomeKrafted/scripts/healthcheck.sh --install
```

Every five minutes: `/health`, `/health/db`, the web process, and the
public HTTPS URL. Three consecutive failures restarts the affected pm2
process — one failure is a blip, and restarting on it would turn a hiccup
into an outage and destroy the evidence. A failing `/health/db` is
reported but never triggers a restart: if Postgres is down, bouncing the
API changes nothing. Logs to `/var/log/homekrafted-health.log`.

> **It runs on the box it watches**, so if the box is off, nothing reports
> it. Point an external monitor (UptimeRobot, Better Stack — both free at
> this size) at `https://homekrafted.in/health`. That takes five minutes
> and is the half this cannot do.

### Log rotation

pm2's logs grow without bound and will eventually fill the disk, which
looks exactly like an application failure:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

nginx's own logs are already rotated by Ubuntu's default logrotate config.
The two cron scripts above append to `/var/log/homekrafted-*.log`; add
them to logrotate if they ever get large (they are a few lines a day).

## Troubleshooting

| Symptom | Check |
|---|---|
| Site returns 502 | `pm2 list` — is `homekrafted-web` online? `pm2 logs homekrafted-web` |
| API 502 on `/api/*` | `pm2 logs homekrafted-api`; a boot loop usually means a bad `server/.env` |
| Deploy refuses to start | It'll say why: missing env file, or local changes on the box |
| Client build fails on prerender | The API wasn't up — see the gotcha above |
| Changes not showing | `NEXT_PUBLIC_*` changes need a rebuild, not a restart |
| "Too many requests" banners, or blank sections on an older build | Rate limiting. See below. |

## Rate limits

`server/.env` controls two throttles, both keyed on **client IP** — so
everyone behind one office NAT shares a single budget:

```
THROTTLE_LIMIT=120          # all routes, per THROTTLE_TTL_SECONDS
THROTTLE_AUTH_LIMIT=20      # /auth/* only, per THROTTLE_AUTH_TTL_SECONDS
THROTTLE_REVIEWS_LIMIT=5    # POST /reviews only, per minute (M37)
```

Two more write endpoints carry their own fixed 5/min (`POST
/seller-applications`, `POST /corporate-inquiries`), and the Next app
throttles its own `/client-errors` beacon in-process (10 burst,
10/minute per IP — `client/lib/rate-limit.ts`), so a script cannot write
unbounded volume into the pm2 log.

"Keyed on client IP" only became true in M23. nginx proxies to the API on
localhost, so without `app.set('trust proxy', 1)` — added in
`server/src/main.ts` — Express reported every request as `127.0.0.1` and
the *entire internet* shared one bucket: the first handful of visitors in
a window exhausted it and everybody else got a 429 they had done nothing
to earn, while an attacker's login attempts were indistinguishable from
everyone else's. It is `1` (one hop, the nginx in front of us) rather than
`true`, because `true` trusts the whole `X-Forwarded-For` chain and lets a
caller prepend a forged address to get a fresh bucket at will. **If a CDN
is ever put in front, this becomes 2** — otherwise the CDN's IP becomes
the client for every visitor and the bug returns in a new shape.

When exceeded the API returns `429 RATE_LIMITED`, and the frontend now
names it: `client/lib/api/http.ts` maps a 429 to a wait-and-retry message,
using `Retry-After` when the server sends one. Before that it surfaced as
blank modules or a "Missing bearer token" error, which looked like a
broken page. If a tester still reports empty sections, check
`pm2 logs homekrafted-api` for 429s before chasing a UI bug.

The **API being unreachable** is the neighbouring case and was fixed the
same way. A rejected `fetch` — the API stopped, nginx down, a tester on a
train — carries no status and no error envelope, so it never reached the
429 handling above and arrived on screen as the browser's own words:
"Failed to fetch" in Chrome, "Load failed" in Safari. Nineteen screens
render an error's `message` straight into the region a *refused* save
uses, so it read as the server rejecting what had been typed. `http.ts`
now turns it into an `ApiError` with status `0` and code `NETWORK_ERROR`
carrying "Can't reach Homekrafted right now." Status `0` deliberately is
not a plausible HTTP one, so nothing branching on `status >= 500`
mistakes an unreachable server for a failing one.

Both take effect on `pm2 restart homekrafted-api` — no rebuild needed,
they're read from `process.env` at boot. Don't lower `THROTTLE_AUTH_LIMIT`
to single digits: it's the brute-force guard on login, but set too tight it
also blocks ordinary sign-ins.

## Moving to another domain

Done once already for `homekrafted.in` (see "Domain & TLS" above); the
order matters if it happens again:

1. Point the name's `A` record at the box.
2. Add it to `server_name` in the nginx config and reload.
3. `certbot --nginx -d <name>` — this needs step 1 to have propagated,
   since Let's Encrypt validates over HTTP against the live record.
4. Update `CLIENT_ORIGIN` in `server/.env` **and** `NEXT_PUBLIC_API_URL` in
   `client/.env.production` to the `https://` host, then redeploy.

Steps 3 and 4 have to happen in that order, and 4's two values have to
change together: the API's CORS check and the browser's request origin
have to agree, and `NEXT_PUBLIC_API_URL` is inlined at build time, so a
stale `http://` value there makes every API call mixed content that the
browser blocks outright on an HTTPS page.
