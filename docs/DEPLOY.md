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
| nginx | `/etc/nginx/sites-available/homekrafted` — :443 TLS for `homekrafted.in`/`www`, :80 `default_server` redirecting to https; `/api/` and `/health` → :4000, everything else → :3000 |
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
DATABASE_URL="postgresql://homekrafted:<password>@localhost:5432/homekrafted?schema=public"
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
OTP_TEST_PHONES=+919845012345,+919876543210,+919822011223,+919008033445
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

Razorpay, WhatsApp, Twilio and SendGrid keys are still placeholders. The
server degrades gracefully around each (mock Razorpay order ids, logged-only
sends), so the flows stay exercisable without real accounts.

**What that costs, concretely, as of M18.** Order events now fan out to
WhatsApp and email by default for both the buyer and the HomeKrafter
(`defaultChannelsFor`), and password reset emails a link. All of it is
wired and tested; none of it leaves the box until `WHATSAPP_*` and
`SENDGRID_API_KEY` are real. Until then the messages land in
`pm2 logs homekrafted-api` as `[WHATSAPP STUB]` / `[EMAIL STUB]` lines —
which is also where to look to confirm the fan-out is firing.

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

> **This writes to local disk.** It protects against a bad migration, a
> dropped table and a bad deploy — not against losing the box. Copying
> the dumps off-box (S3, Backblaze, even another VPS via `rsync`) is the
> remaining half, and is still owed.

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
| Blank sections, "Missing bearer token", random empty dashboards | Rate limiting. See below. |

## Rate limits

`server/.env` controls two throttles, both keyed on **client IP** — so
everyone behind one office NAT shares a single budget:

```
THROTTLE_LIMIT=120          # all routes, per THROTTLE_TTL_SECONDS
THROTTLE_AUTH_LIMIT=20      # /auth/* only, per THROTTLE_AUTH_TTL_SECONDS
```

When exceeded the API returns `429 RATE_LIMITED`. The frontend doesn't
special-case that, so it surfaces as blank modules or a "Missing bearer
token" error — it looks like a broken page, not a rate limit. If testers
report that, check `pm2 logs homekrafted-api` for 429s before chasing a UI
bug.

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
