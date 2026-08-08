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
