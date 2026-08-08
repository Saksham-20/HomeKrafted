# Load tests

`k6`, a single static binary — no dependency added to `client/` or
`server/`, and nothing to `npm ci` on the deploy box.

```bash
brew install k6
k6 run load/browse.js                       # read path
k6 run -e BASE_URL=... load/mixed.js        # the realistic blend
```

Every script reads `BASE_URL` (default `http://localhost:4100/api/v1`), so
the same files run against local, a staging box, or production.

## Read this before pointing it at production

`homekrafted.in` is **one 1 vCPU / 4 GB VPS running the Next server, the
API and Postgres together**, with pm2 `max_memory_restart` at 600M/800M
(`docs/DEPLOY.md`). 500–1000 concurrent users against that will not
"stress" it — it will take the site down, and pm2 will restart-loop under
memory pressure, which means it can stay down after the run ends rather
than recovering when the load stops.

A local run finds **application and query** bottlenecks, which is most of
what these are for. It cannot tell you that box's real ceiling: a laptop
has more cores, faster disk, and no nginx or TLS in the path. Treat local
numbers as an upper bound on the code, not a prediction of the server.

## The thresholds, and why those numbers

`p95 < 2s` and `error rate < 1%`, aborting the run when either breaks.
Both are deliberately generous — they exist to catch a *cliff*, not to
certify a latency budget nobody has agreed. A run that trips them has
found something; a run that passes them has only shown there is no cliff
below that load.

## Measuring the production box's ceiling — the throwaway twin

Decided 2026-08-08: **a temporary same-spec VPS**, not production and not
local-only. Local runs find application and query bottlenecks and have
already earned their keep; they cannot tell you what one shared core does
when Next, the API and Postgres are all on it. Production can tell you
that exactly once, and then it is down.

The twin has to match production or the number is fiction:

| Must match | Production today |
|---|---|
| Provider + region | the same one, so disk and network are comparable |
| Size | 1 vCPU, ~4 GB |
| Swap | 2 GB swapfile (`next build` needs it) |
| OS | Ubuntu 24.04 |
| Topology | nginx + TLS in front, Next + API + Postgres on the same box |
| pm2 limits | `max_memory_restart` 600M/800M, from `ecosystem.config.cjs` |

**Run it from a machine that is not the box.** k6 competing with the app
for the one core measures the load generator.

```bash
# On the twin, once it exists — same steps as docs/DEPLOY.md's first-time
# setup, then the branch under test rather than main.
git clone <repo> /var/www/homekrafted/HomeKrafted
cd /var/www/homekrafted/HomeKrafted && git checkout audit/production-hardening
# ... nginx, certbot, postgres, env files: docs/DEPLOY.md
npx prisma migrate deploy && npx ts-node prisma/seed.ts
psql "$DATABASE_URL" -f load/volume.sql        # <- do not skip, see below
pm2 start ecosystem.config.cjs

# From your own machine
k6 run -e BASE_URL=https://<twin>/api/v1 load/browse.js
k6 run -e BASE_URL=https://<twin>/api/v1 load/mixed.js
```

`load/volume.sql` is not optional. The first ramp of this suite passed at
**p95 4.55 ms** against the 16 products `prisma/seed.ts` creates, and gave
**p95 2.06 s** against realistic volume — the catalogue read was scanning
every row. A load test against seed data is a false pass that looks like
an excellent result.

Watch on the box while it runs, because the report will not show you any
of this:

```bash
pm2 monit                                   # RSS against max_memory_restart
pm2 logs --lines 0                          # restarts, which read as errors
psql -c "SELECT count(*) FROM pg_stat_activity"   # pool saturation
psql -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10"
```

Destroy the twin afterwards. It has a copy of the seed data and a real
TLS certificate, and neither should outlive the run.

**Still blocked on one thing:** creating the box needs a hosting-provider
credential nobody has handed over. The steps above are the whole job once
it exists.
