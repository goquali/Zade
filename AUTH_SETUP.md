# Zade family authentication — deployment checklist

This branch adds Neon Auth Google sign-in and a server-side email allowlist.

## Vercel environment variables (Production and Preview)

- `ALLOWED_EMAILS`: comma-separated approved Google emails (server-side only).
- `NEON_AUTH_BASE_URL`: the **Auth URL** from Neon Console → Settings → Better Auth. Do not use the database connection string.
- `NEON_AUTH_COOKIE_SECRET`: a new, cryptographically random 32+ character secret. Keep private; do not commit it. Generate locally with `openssl rand -base64 32`.

The Neon integration may have already provisioned `NEON_AUTH_BASE_URL`; verify before adding a duplicate.

## Neon console

- Google OAuth must be enabled.
- Add `https://zade-zeta.vercel.app` as a trusted domain.
- Prefer disabling email sign-up if Google-only access is desired.
- Neon may still permit public Google account creation. The app must enforce authorization server-side.

## Security

- Keep Vercel Deployment Protection enabled while testing.
- Never expose `DATABASE_URL`, cookie secrets, or other server credentials in browser code.
- `getAuthorizedFamilyUser()` is the required server-side authorization check for **every** future private data read, mutation, API route and server action.
- The UI currently contains only sample data. No real baby data or external integrations are enabled.
- Do not merge until Vercel env vars are configured and both approved accounts plus an unapproved account have been tested.
- The login page is not sufficient protection by itself; future API handlers must check authorization independently.
