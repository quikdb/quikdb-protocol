# Compute Dashboard (Stripped Public Version)

Next.js 15 frontend for the QuikDB compute platform. This is a stripped version of the production dashboard — no secrets, no internal config, no builder mode.

## What's Included

- **Dashboard** — deployment list with live status indicators, stats overview
- **Deploy Wizard** — 3-step flow: select repo, configure (auto-detected), review and deploy
- **Deployment Detail** — replica status, real-time log streaming via Socket.io, restart/stop controls
- **Log Viewer** — color-coded logs with error classification (USER_ERROR, SYSTEM_TRANSIENT, SYSTEM_FAULT)
- **API Client** — typed API layer for all deployment, git, subscription, env var, and domain operations
- **Hooks** — TanStack Query hooks with smart polling (5s during active deploys, 30s otherwise)
- **Types** — full TypeScript types for deployments, subscriptions, and tier limits

## What's NOT Included

- Builder Mode (AI app generation) — not yet public
- Admin dashboard
- Internal service-to-service endpoints
- Environment variable values
- Auth implementation details

## Production

Live at [compute.quikdb.com](https://compute.quikdb.com)
