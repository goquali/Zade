# Protected Huckleberry sync

GitHub Actions reads one Huckleberry child and sends a snapshot to the Preview
deployment. It never writes to Huckleberry.

There are two independent machine authentication credentials:

- A fresh GitHub Actions ID token from `core.getIDToken()`, with the default
  GitHub audience, goes in `x-vercel-trusted-oidc-idp-token`. The job needs
  `id-token: write`. Vercel must recognize the connected `goquali/Zade`
  repository as a Trusted Source for the protected Preview. Do not use a stored
  Vercel development token or set the GitHub audience to `vercel`.
- The GitHub `ZADE_SYNC_TOKEN` secret goes in `Authorization: Bearer …`.
  The same 32+ character token must exist on the Vercel `zade` project in Preview,
  including the `feature/neon-family-auth` branch override. Environment updates
  require a new deployment.

Keep Vercel Authentication enabled. Only the exact
`/api/integrations/huckleberry` route is excluded from Neon session middleware;
the route authenticates every GET and POST itself. The dashboard and other
APIs keep their session and family authorization checks.

The workflow sets `ZADE_SYNC_URL` to the protected `feature/neon-family-auth`
branch alias, so new deployments use the fixes and refreshed environment
variables. It no longer uses the old GitHub URL secret, which may refer to an
immutable deployment. For local runs, use an HTTPS origin or full endpoint.
Requests reject redirects to avoid forwarding credentials or
mistaking a sign-in page for a successful sync.

Before reading Huckleberry, the script performs an authenticated GET. Its
success proves that Deployment Protection was passed and that the runner's token
matches the deployed token. It returns no records, token values, or fingerprints
and performs no database query. POST then validates and upserts the snapshot.

Failure diagnostics distinguish an application token 401 using
`x-zade-auth-layer: sync-token`, a redirect from middleware or routing, and a
401/403 before the application from Deployment Protection. No raw response bodies
or redirect targets are logged.

Use Python 3.14: `huckleberry-api==0.4.7` requires it. Direct dependencies are
pinned in `scripts/requirements-huckleberry.txt`. Child UID takes precedence;
otherwise the configured child name matches the canonical `childsName` from
`get_child(cid)`, falling back to the child reference nickname. Empty or ambiguous
profile selection fails closed. Missing sleep/feed documents are valid nulls.

Validation:

```sh
python -m pip install -r scripts/requirements-huckleberry.txt
python -m pip check
python -m unittest discover -s scripts -p 'test_*.py'
node --test scripts/test_huckleberry_endpoint.cjs
npx tsc --noEmit
npm run build
```

The workflow waits up to five minutes for this commit's Vercel status to succeed
before requesting its short-lived OIDC token. Use the branch alias as the sync
URL so that status corresponds to the target. Rerunning an older run uses its
older workflow and script.
GitHub schedules only execute workflows on the default branch; the 15-minute
schedule becomes active after this workflow reaches the default branch.
