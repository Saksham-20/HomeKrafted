# Deploying Homekrafted

Staging runs on a single VPS, serving the web app and the API behind one
nginx on port 80.

- **Site:** http://187.127.171.48 (HTTP only — it's a bare IP, so no cert)
- **Box:** `ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48` (Ubuntu 24.04)
- **App root:** `/var/www/homekrafted/HomeKrafted` — a git clone tracking `main`

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
| nginx | `/etc/nginx/sites-available/homekrafted`, `default_server` on :80 — `/api/` and `/health` → :4000, everything else → :3000 |
| Database | local Postgres 16, db and role both `homekrafted` |
| Boot | `pm2 startup systemd` + `pm2 save`, so both apps come back after a reboot |

The box has a 2 GB swapfile. It has 1 vCPU and ~4 GB RAM, and `next build`
needs the headroom.

## Env files — the one thing not in git

`.gitignore` excludes `.env*`, so these two live only on the box and survive
every deploy. **If you rebuild the box, recreate them before deploying** —
`scripts/deploy.sh` refuses to run without them.

`server/.env` — see `server/.env.example` for the full list. The values that
matter in production:

```
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=http://187.127.171.48
DATABASE_URL="postgresql://homekrafted:<password>@localhost:5432/homekrafted?schema=public"
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<a different openssl rand -base64 48>
```

The API validates its own env at boot and refuses to start on a missing or
placeholder secret, so a bad `.env` shows up as a pm2 restart loop — check
`pm2 logs homekrafted-api`.

`client/.env.production`:

```
NEXT_PUBLIC_API_URL=http://187.127.171.48/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder
NEXT_PUBLIC_USE_MOCK=false
```

`NEXT_PUBLIC_*` values are inlined **at build time**, so changing one means a
rebuild, not just a restart.

Razorpay, WhatsApp, Twilio and SendGrid keys are still placeholders. The
server degrades gracefully around each (mock Razorpay order ids, logged-only
sends), so the flows stay exercisable without real accounts.

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
ufw allow 80/tcp
```

`npx prisma db seed` is first-time only — it creates the demo accounts in
`docs/TESTING.md`. Re-running it on a live database will duplicate records.
`scripts/deploy.sh` deliberately runs `migrate deploy` and never seeds.

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

## Going to a real domain

When a domain points at the box: add it to `server_name` in the nginx
config, run `certbot --nginx`, then update `CLIENT_ORIGIN` in `server/.env`
and `NEXT_PUBLIC_API_URL` in `client/.env.production` to the `https://` host
and redeploy. Both need to change together — the API's CORS check and the
browser's request origin have to agree.
