# Excalidraw deployment

The InstaCloud project is `76183748-3114-4bbd-8496-eb2377bf4d2e` (Excalidraw), branch `main`.
Neon PostgreSQL and Upstash Redis stay external. The frontend is deployed separately on Vercel.

## Backend services

| Service | Port | Startup command |
| --- | --- | --- |
| `api` | 5000 | `node apps/http-server/dist/index.js` |
| `websocket` | 8080 | `node apps/ws-server/dist/index.js` |
| `flush-worker` | 0, no public listener | `node apps/flush-worker/dist/index.js` |

The root Dockerfile excludes `apps/web` and frontend-only packages. It builds only backend workspaces and their dependencies. The DB package emits JavaScript for the production Node runtime. The worker stays always on; routed services can sleep when idle.

## Vercel configuration

Import the Git repository with framework **Next.js**, root directory **apps/web**, and Node.js **24**. Enable inclusion of source files outside the root directory so workspace packages are available.

- Install command: `cd ../.. && pnpm install --frozen-lockfile`
- Build command: `cd ../.. && pnpm exec turbo run build --filter=web...`

This builds the frontend and shared package dependencies needed by its imports, without building the backend apps. The API and worker are not Vercel functions.

Set these public environment variables before the frontend build:

```dotenv
NEXT_PUBLIC_API_URL=https://prod-main-api-89a696-0066d0yx3h0.compute.instacloud-edge.com
NEXT_PUBLIC_WS_URL=wss://prod-main-websocket-057aa5-00nah48w4j3.compute.instacloud-edge.com
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false
```

These values contain no credentials. Do not add DATABASE_URL, REDIS_URL, or auth signing secrets to frontend public variables.

## Add the frontend URL after deploying Vercel

The temporary `WEB_ORIGIN` is `http://localhost:3000`. Once Vercel gives you the production URL, replace it with the exact origin, without a trailing slash or path:

```powershell
insta --agent secrets set WEB_ORIGIN https://your-app.vercel.app
```

Run from this linked repository. In the InstaCloud console, open the API and WebSocket services' **Variables** tabs and set **WEB_ORIGIN** on both, or edit the shared value they inherit. Apply/deploy the variable changes. The CLI command above sets the shared value and automatically redeploys affected services.

This single value controls API CORS, Better Auth trusted origins, invite URLs, and allowed WebSocket origins. Keep `BETTER_AUTH_URL` pointing at the API URL above. Never use a wildcard frontend origin.

## Runtime credentials and authentication

Existing Neon/Upstash credentials and auth signing secrets are configured in InstaCloud, not included in the image. Redis uses TLS with its hostname for SNI. Production auth cookies use Secure and SameSite=None for the separate frontend/API origins.

Existing account-verification email settings are configured. Room invitations are in-app; the room invite endpoint does not send email. Google OAuth is disabled until its credentials and callback configuration are supplied.

## Redeployment

```powershell
insta --agent deploy . --branch main --group api --port 5000
insta --agent deploy . --branch main --group websocket --port 8080 --websocket
insta --agent deploy . --branch main --group flush-worker --port 0
```

Each service's startup override persists. The same built backend image can also be reused with `deploy --image <digest>` for the other services to avoid repeating the build.

Verify API `/health`, WebSocket `/health` and upgrade responses, and worker status/logs plus queue processing after deployment. Do not run database migrations in container startup. Neon already contains the application database; inspect migration state before future schema changes.

## Verification of this deployment

- API `/health`: HTTP 200 with `status: ok`.
- Auth session endpoint: HTTP 200 for an unauthenticated session lookup.
- WebSocket `/health`: HTTP 200; unauthenticated upgrades correctly return HTTP 401.
- WebSocket tests: all 24 passed.
- Worker: running, connected to the database and Redis, emitting Redis memory metrics.
- The extra remote queue smoke commands timed out. Their diagnostic processes were cleared by restarting the worker. Queue processing and durable room saves still need an end-to-end check after the frontend is deployed; startup status alone does not prove a flush completed.

The services were deployed directly from local source/images. They are not connected to GitHub for automatic redeployment. Commit and push the local deployment fixes and any existing unpushed commits before importing the latest frontend code into Vercel.
