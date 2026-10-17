# AWS EC2 deployment: Sydney, one backend host

This deploys the API, WebSocket server, flush worker, local Redis, and Caddy on
one Ubuntu EC2 instance in `ap-southeast-2`. PostgreSQL stays on your existing
Neon database; the Next.js frontend stays on Vercel. No RDS, ElastiCache, load
balancer, NAT Gateway, ECS, or Kubernetes is required.

Files supplied: the existing root `Dockerfile` builds all three backends;
`compose.ec2.yaml` runs them; `deploy/ec2/Caddyfile` terminates HTTPS and proxies
WebSockets; `.env.ec2.example` lists the host configuration. The existing
`compose.yaml` is for local development, not this deployment.

## 1. Choose names and resources

### Alternative: deploy without buying a domain

You can use free `sslip.io` hostnames derived from your Elastic IP. For example,
IP `13.236.175.199` resolves through `api.13-236-175-199.sslip.io` and
`ws.13-236-175-199.sslip.io`. Set those as `API_DOMAIN` and `WS_DOMAIN`; Caddy
obtains public certificates for them. This depends on a third-party DNS service;
you can move to your own domain later without moving the backend.

For this arrangement, use the optional same-origin API proxy in `next.config.ts`
so authentication cookies stay on the frontend hostname. On EC2 set
`WEB_ORIGIN` **and** `BETTER_AUTH_URL` to the frontend's production HTTPS origin.
On Vercel set these **Production** variables, substituting your frontend URL:

```dotenv
NEXT_PUBLIC_API_URL=https://your-app.vercel.app
NEXT_PUBLIC_API_PROXY_PREFIX=/backend
API_PROXY_TARGET=https://api.13-236-175-199.sslip.io
NEXT_PUBLIC_WS_URL=wss://ws.13-236-175-199.sslip.io
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false
```

`API_PROXY_TARGET` is a server/build setting. The browser sends data requests to
`/backend/...` and authentication to `/api/auth/...` on Vercel; rewrites forward
both to EC2 over HTTPS. WebSockets connect directly using short-lived tickets.
`turbo.json` passes and hashes these build settings, and `.vercelignore` excludes
host secrets from CLI uploads. Redeploy after any URL change. With Google OAuth,
the callback URI belongs to the frontend host in this proxy arrangement:
`https://your-app.vercel.app/api/auth/callback/google`.

The custom-domain instructions below use direct API access instead. Do not mix
the two configurations: for direct API access, leave `API_PROXY_TARGET` and
`NEXT_PUBLIC_API_PROXY_PREFIX` unset and set `BETTER_AUTH_URL` to the API origin.

### Custom domain configuration

Replace these example names everywhere below:

| Name              | Destination             |
| ----------------- | ----------------------- |
| `app.example.com` | Your Vercel project     |
| `api.example.com` | EC2 Elastic IP          |
| `ws.example.com`  | The same EC2 Elastic IP |

Using HTTPS subdomains of the same domain avoids depending on third-party
cookies for sign-in. The API already sets secure production cookies and allows
the exact `WEB_ORIGIN`. An unrelated `something.vercel.app` frontend and EC2
domain can encounter browser third-party-cookie restrictions even with CORS
configured. Use the custom Vercel domain as your primary app URL.

Launch from **EC2 → Instances → Launch instance**:

- Region: **Asia Pacific (Sydney), ap-southeast-2**.
- AMI: **Ubuntu Server 24.04 LTS, 64-bit x86**.
- Type: `t3.micro` for an initial low-traffic trial; `t3.small` gives more headroom.
- Storage: **20 GB gp3**. Keep the root disk encrypted.
- Create/download a key pair. Protect the private key.
- Default VPC/public subnet, with an Internet Gateway route and public addressing.
- Security group inbound: TCP **22 from your public IP/32**, TCP **80 and 443
  from 0.0.0.0/0**. Add IPv6 rules only if you configure IPv6 DNS/networking.
- Keep outbound access for Neon, email, image downloads, and HTTPS certificates.
- Do **not** open 5000, 8080, 6379, or 5432.

Allocate an **Elastic IP** and associate it with the instance. Create DNS **A**
records `api` and `ws` pointing to that IP. Initially use DNS-only records if
your DNS provider offers proxying. Remove stale AAAA records. In Vercel, add
`app.example.com` in **Settings → Domains** and create the DNS record Vercel
requests. These are three distinct DNS records.

Allow DNS to resolve before starting Caddy; ports 80/443 must reach this host
for automatic certificates. The domain needs to be one you control.

## 2. Connect and install Docker

From your computer (PowerShell or a shell with OpenSSH), replacing the key path
and address:

```sh
ssh -i /path/to/ec2-key.pem ubuntu@YOUR_ELASTIC_IP
```

The remaining commands in this section run in the EC2 Ubuntu shell:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
```

On a new micro with no swap, add a 2 GB swap file to reduce abrupt OOM failures:

```sh
swapon --show
# Only run the following if /swapfile does not already exist:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Swap is a fallback, not additional fast RAM. Sustained swap usage means upgrade.
The Node heap setting is per process and excludes native memory; it does not
guarantee that three Node processes and Redis fit every workload on a micro.

## 3. Put this source and the backend image on EC2

Commit/push these deployment files and the Redis usage fixes first. On EC2:

```sh
git clone YOUR_REPOSITORY_CLONE_URL ~/excalidraw
cd ~/excalidraw
```

Use your normal SSH/deploy-key authentication for a private repository. Do not
embed access tokens in the clone URL.

Build on your development computer or CI, not the micro. The Dockerfile builds
only backend workspaces and excludes real `.env` files. In a local terminal at
the repository root, with Docker Desktop's Linux engine running:

```sh
docker buildx build --platform linux/amd64 --load -t excalidraw-backend:ec2 .
docker save -o excalidraw-backend.tar excalidraw-backend:ec2
scp -i /path/to/ec2-key.pem excalidraw-backend.tar ubuntu@YOUR_ELASTIC_IP:~/
```

In PowerShell, use your Windows key path, e.g. `C:\Users\you\.ssh\ec2-key.pem`.
Do not put secrets in Docker build arguments. The image archive can be large;
ensure the local machine and EC2 disk have room. For regular releases, a private
container registry with versioned tags/digests is more convenient than SCP.

Back on EC2:

```sh
cd ~/excalidraw
sudo docker load -i ~/excalidraw-backend.tar
# Remove only this transferred archive after docker load succeeds:
rm ~/excalidraw-backend.tar
```

## 4. Configure backend environment variables

On EC2, inside `~/excalidraw`:

```sh
umask 077
cp .env.ec2.example .env.ec2
chmod 600 .env.ec2
nano .env.ec2
```

Set every placeholder. Do not paste secrets into chat, Git, Dockerfiles, or
Vercel public variables. `.env.ec2` is Git-ignored and Docker-build-ignored.
Compose injects it at container startup; it is not mounted or baked into the
image. Host administrators and Docker administrators can still access it.

| Variable                  | What to enter                                                                |
| ------------------------- | ---------------------------------------------------------------------------- |
| `BACKEND_IMAGE`           | `excalidraw-backend:ec2`, matching the image you loaded                      |
| `API_DOMAIN`              | `api.example.com`, without protocol/path                                     |
| `WS_DOMAIN`               | `ws.example.com`, without protocol/path; different from API domain           |
| `ACME_EMAIL`              | Your real email for certificate registration                                 |
| `WEB_ORIGIN`              | `https://app.example.com`, exact frontend origin, no trailing slash          |
| `BETTER_AUTH_URL`         | `https://api.example.com`, no `/api/auth` suffix                             |
| `DATABASE_URL`            | Existing Neon connection string with its TLS/query parameters                |
| `BETTER_AUTH_SECRET`      | Copy the existing production value to preserve sessions                      |
| `PRESENCE_TICKET_SECRET`  | Copy the existing value; must match on API and WS                            |
| `ROOM_INVITE_SECRET`      | Copy if previously configured; otherwise leave commented                     |
| `RESEND_API_KEY`          | Existing production Resend key                                               |
| `EMAIL_FROM`              | Sender on a verified Resend domain, e.g. `Excalidraw <accounts@example.com>` |
| `GOOGLE_CLIENT_ID/SECRET` | Both empty if disabled, otherwise copy your credentials                      |
| `PORT`, `WS_PORT`         | Keep `5000` and `8080`; proxy/health checks use these                        |
| `APP_NODE_OPTIONS`        | Start with `--max-old-space-size=128`; adjust after measuring                |

For a fresh installation only, run `openssl rand -hex 32` separately for each
signing secret and paste the different results into the file. Do not regenerate
existing production secrets just because you are moving hosts. Keep URI values
and secrets single-quoted in the file to protect `$` characters. Do not `source`
this file: Compose reads it directly.

When the API hostname changes, users may need to sign in again because browser
cookies belong to the old hostname, even when the signing secret is preserved.

Compose forces `NODE_ENV=production`, `REDIS_URL=redis://redis:6379`, and
`REDIS_METRICS_ENABLED=false` for all three backends. No Upstash URL is needed
on EC2. Caddy receives only its domain/email settings. Redis receives no backend
secrets and has no published port. Its AOF lives in the `excalidraw_redis-data`
Docker volume on EBS. `noeviction` prevents silently deleting unflushed state;
at its 128 MB data limit writes can fail, so monitor and increase memory when
needed. AOF `everysec` can lose roughly the latest second on an abrupt failure;
disk persistence is not a substitute for backups.

Production sign-up requires email verification in this app. Without a working
Resend sender, sign-up/reset emails will fail even if health checks pass.

## 5. Prepare the database and safely cut over existing rooms

Keep the existing Neon database and take a backup/restore point before migration.
Moving compute does not require moving or recreating tables. Do not run database
migrations automatically on container startup. If deploying code that needs a
new schema, use the repository's documented migration checks and apply the
reviewed migrations separately before enabling traffic. For a brand-new database,
follow the root README's database setup first; an empty database is not ready.

**Existing Upstash room state must be drained before switching Redis.** Stop new
edits on the old API/WS deployment, leave its flush worker running, and verify in
the Upstash console that `ZCARD collab:dirty-rooms` is zero and recent room saves
are durable in Postgres. If the quota prevents flushing, recover/export that
pending state before proceeding. Starting an empty local Redis cannot recover
unsaved data from the old Upstash instance.

Expect a maintenance window for this single-host cutover. Do not leave old and
new backends accepting room edits against different Redis instances: their
live state/pub-sub channels would diverge.

## 6. Start and verify the backend

On EC2:

```sh
cd ~/excalidraw
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml config --quiet
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml up -d --wait --wait-timeout 180
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml ps
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml logs --tail=80 api websocket flush-worker caddy
curl -f https://api.example.com/health
curl -f https://ws.example.com/health
```

Avoid sharing full `docker compose config`/`docker inspect` output: it can contain
secrets. Use `config --quiet`. Health checks verify HTTP liveness; they do not
prove Redis-to-Postgres persistence. The worker has no HTTP health endpoint;
confirm its startup and successful flush logs, including an actual room edit.

## 7. Change Vercel

In the existing project, **Settings → Domains**: ensure `app.example.com` is
verified and use it as the canonical production domain.

In **Settings → Environment Variables**, set these for **Production**:

```dotenv
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://ws.example.com
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false
```

Replace old InstaCloud endpoint values. No trailing slash, `/api`, or `/api/auth`
suffix. The WS value uses `wss://`. If Google login is configured on the backend,
set the Google flag to `true` and update Google's authorized redirect URI to
`https://api.example.com/api/auth/callback/google` (and authorized JavaScript
origin to `https://app.example.com`).

**Redeploy Vercel after changing these values**: `NEXT_PUBLIC_*` values are
embedded at build time. Use the existing project settings, or for a fresh import:

- Framework: Next.js; root directory `apps/web`; Node.js **24**.
- Enable source files outside the root directory for workspace imports.
- Install: `cd ../.. && pnpm install --frozen-lockfile`
- Build: `cd ../.. && pnpm exec turbo run build --filter=web...`

Only the three public variables above belong in the frontend for this setup.
Keep `DATABASE_URL`, Redis URLs, signing secrets, Resend keys, and Google client
secret on EC2. `WEB_ORIGIN` and `BETTER_AUTH_URL` are backend configuration.
Preview deployments have different origins: do not point arbitrary preview
URLs at this production backend or replace the allowed origin with `*`. Use a
separate preview backend/configuration if previews need authenticated API access.

## 8. End-to-end acceptance and old-service shutdown

1. Open `https://app.example.com`; verify network requests use the new API host.
2. Sign in, and test a new account verification email and password-reset email.
3. Open a room in two browser sessions. Verify a `101` WebSocket upgrade and
   synchronized edits/presence.
4. Make an edit; find a successful `room_snapshot_flush` log. Wait for persistence,
   close/reopen the room, and confirm the edit remains.
5. Check errors and resource usage with the commands below. Perform a controlled
   host reboot during the maintenance window and verify services restart.
6. After the new deployment is working and old dirty rooms are drained, stop the
   old API, WebSocket, and worker services. Keep the old Redis until recovery is
   no longer needed; then remove it separately. Updating Vercel alone does not
   stop those processes or their Redis command consumption.

## 9. Operations, updates, and resizing

```sh
sudo docker stats --no-stream
free -h
df -h
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml logs --tail=100 flush-worker
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml exec redis redis-cli INFO memory
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml exec redis redis-cli ZCARD collab:dirty-rooms
```

Log rotation is configured. Docker restarts exited containers and starts them
after a host reboot; an unhealthy-but-running process is not automatically
restarted just because its health status is unhealthy. Diagnose/restart it if
needed. Enable monitoring for memory, disk, repeated restarts, Redis write errors,
and a dirty-room backlog that does not drain. Keep EBS/Neon backups outside this
host; an EC2/root-volume loss otherwise loses the local Redis copy too.

For an update, record the old image ID/tag, build a new image from the new commit
on your computer/CI, transfer/load it as above, and pull matching deployment
files with `git pull --ff-only`. Prefer a versioned image tag, updating
`BACKEND_IMAGE` accordingly. Then:

```sh
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml up -d --wait --wait-timeout 180
```

Compose recreates containers whose image/configuration changed and preserves
the named volumes. Re-run acceptance checks; backend updates disconnect active
WebSockets. For environment-only changes, edit `.env.ec2` and run the same
`up -d` command; a plain `restart` does not load new environment values. Caddy
domain/email changes can require `up -d --force-recreate caddy`. Do not use
`docker compose down -v`: `-v` deletes persistent Redis/certificate volumes.

To upgrade micro → small: stop new edits, let the dirty-room count reach zero,
gracefully stop the stack using `docker compose ... stop`, stop the EC2 instance
in AWS (do not terminate), change its type to `t3.small`, then start the instance.
Because a manual Compose stop suppresses automatic container restart, explicitly
run `docker compose --env-file .env.ec2 -f compose.ec2.yaml up -d --wait` after SSH
reconnects. EBS volumes and the associated Elastic IP remain. Recheck the app.

## Official references

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Compose environment interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy reverse proxy and WebSockets](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [EC2 instance resizing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/change-instance-type-of-ebs-backed-instance.html)
