# Threat Model

## Project Overview

This repository is a pnpm TypeScript monorepo with three notable artifacts: a production Express API under `artifacts/api-server`, a production Expo-based mobile/web app under `artifacts/drag-tree`, and a Vite mockup sandbox under `artifacts/mockup-sandbox`. The current production API surface is minimal (`GET /api/healthz` only), while the Drag Tree app is primarily a local reaction-timer experience served by a small Node static server.

For this scan, treat `artifacts/mockup-sandbox` as dev-only and out of scope for production findings. Assume `NODE_ENV=production` in deployed services and platform-managed TLS at the edge.

## Assets

- **Service availability** — the API health endpoint and the Drag Tree static/manifest server must remain reachable. The application currently has little sensitive business logic, so availability is one of the main production concerns.
- **Deployment secrets and infrastructure configuration** — `DATABASE_URL`, future API tokens, and deployment environment variables would be high-impact if exposed. The codebase already includes production database wiring in `lib/db` even though it is not yet exercised by routes.
- **Integrity of distributed mobile/web content** — the Expo landing page, manifests, and static bundle determine what clients load. If an attacker can alter generated links, manifests, or headers, users may be redirected to attacker-controlled content or broken client flows.
- **Future auth tokens and API request metadata** — `lib/api-client-react` already supports bearer-token attachment. If the shared client is later wired into production features, token handling and request scoping become sensitive assets.
- **Local gameplay telemetry** — the Drag Tree app tracks accelerometer-derived reaction data and run history in memory. This is low sensitivity but still crosses an untrusted device-input boundary.

## Trust Boundaries

- **Public internet to Express API** — all requests to `artifacts/api-server/src/app.ts` are untrusted. Any future expansion beyond `/api/healthz` must enforce validation, auth, and authorization server-side.
- **Public internet to Expo static server** — `artifacts/drag-tree/server/serve.js` builds responses from request URLs and selected headers, so header and path handling are the main current runtime boundary.
- **Client code to shared fetch layer** — `lib/api-client-react/src/custom-fetch.ts` can attach bearer tokens and rewrite relative URLs with a configured base URL. Misuse here could expose tokens or send requests to unintended origins.
- **Application to PostgreSQL** — `lib/db/src/index.ts` creates a privileged database connection from `DATABASE_URL`. Any future route that reaches this boundary must use typed/parameterized Drizzle operations and least-privilege data access.
- **Device sensors to app logic** — the Drag Tree app trusts accelerometer input from the device. This boundary matters for integrity of gameplay results, though not currently for sensitive account or payment flows.
- **Development/internal to production** — `artifacts/mockup-sandbox` and build-time scripts are not production surfaces unless separately proven reachable. Future scans should continue to deprioritize them.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/drag-tree/server/serve.js`, `artifacts/drag-tree/app/(tabs)/index.tsx`
- **Highest-risk current code areas**: `artifacts/drag-tree/server/serve.js` (header/path handling), `lib/api-client-react/src/custom-fetch.ts` (token and origin handling), `lib/db/src/index.ts` (future database boundary)
- **Public vs authenticated vs admin surfaces**: current production surfaces are public only; there are no implemented authenticated or admin routes yet
- **Dev-only areas usually ignored**: `artifacts/mockup-sandbox/**`, `artifacts/drag-tree/scripts/build.js`, codegen assets in `lib/api-spec/**`

## Threat Categories

### Spoofing

The current codebase has no active server-side authentication, but the shared client already supports bearer tokens via `setAuthTokenGetter`. As production features are added, all protected endpoints must validate tokens server-side; client-side token attachment alone is not a security control. Any service that derives absolute URLs or trust decisions from request headers must treat those headers as untrusted unless they are known to be normalized by the deployment proxy.

### Tampering

The main current tampering risk is in the Expo static server, where request paths and selected headers influence the response body and deep links served to clients. The static server must continue to prevent path traversal and must not allow attacker-supplied headers to alter generated links or HTML/JavaScript in ways that change client behavior. In the mobile app, accelerometer input and manual taps are inherently untrusted and must not be treated as authoritative for anything security-sensitive.

### Information Disclosure

The API logger in `artifacts/api-server/src/lib/logger.ts` already redacts authorization and cookie headers; that guarantee should be preserved as routes expand. Production responses must not expose secrets, stack traces, database connection details, or future tokens. Shared fetch and server utilities must avoid reflecting sensitive request metadata into error responses or logs.

### Denial of Service

Both production services are currently public and unauthenticated. Any future expensive API routes, file handling, or manifest generation must remain bounded. The current static server uses synchronous filesystem access and should stay limited to serving small local assets only; if it grows, rate limiting, caching, and non-blocking I/O may become important availability controls.

### Elevation of Privilege

There is no implemented privilege model yet, but the future database and token scaffolding create a clear risk area. All future database access must use safe Drizzle query construction rather than raw SQL; all future authenticated features must enforce authorization on the server, not in the Expo app or shared client. Header-derived URL generation in public responses should also be treated as a privilege boundary because it can let external input influence what clients load or open.
