# Zade Dashboard

Private baby dashboard project for Huckleberry and Nanit insights.

## Status

Huckleberry snapshots are stored in Neon and displayed only to signed-in,
approved family accounts. The dashboard shows the latest saved sleep, nursing,
and growth entries, the last successful sync time, and stale or unavailable
data states. Nanit is not connected.

Refresh reloads the saved snapshot; it does not start a Huckleberry sync.
The feature branch supports push-triggered and manually dispatched syncs.
GitHub's scheduled sync only becomes active after the workflow reaches the
default branch. See `HUCKLEBERRY_SYNC.md` for setup and verification.

## Security

Keep the repository private. Require authentication and protect all deployments before adding real data or credentials.
