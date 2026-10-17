# EC2 deployment record

Deployed and verified on 2026-10-17 using AWS CLI and Vercel CLI.
Production Vercel deployment: `dpl_ArKBrjgjnkNJEvVYp2A227fyLq1S`.
Backend image: `excalidraw-backend:ec2` (manifest
`sha256:30e8fa9887183e076c94cfd7c73caceaa1b7cb64d5943159fa485fcd8925bf3a`).

Verification passed both directly and through the public Vercel origin:
sign-in/secure session cookie, two authenticated WSS clients, committed edit
broadcast, Redis-to-Postgres snapshot flush, and saved-scene reload. Temporary
test identities/scenes were removed; no test emails were sent. The final Redis
dirty-room count was zero.

The previous InstaCloud `api`, `websocket`, and `flush-worker` services are
stopped (desired state stopped, live state suspended). Upstash was checked for
zero dirty rooms before shutdown. The old deployment is retained for rollback,
not deleted. Starting it again would resume its old polling behavior.

## Resources

- Region: `ap-southeast-2` (Sydney).
- Instance: `i-029c8edce937404c7`, name `excalidraw-backend`, type `t3.micro`.
- Elastic IP: `13.236.175.199` (`eipalloc-07e15e1c35d50e619`).
- Disk: encrypted 20 GB gp3; 2 GB swap on the root disk.
- CPU credits: **Standard**, to avoid Unlimited surplus-credit charges. Sustained
  CPU load can be throttled; upgrade if that affects latency.
- Security group: `sg-0ed971a6bf57932e1`; public 80/443, SSH restricted to the
  deployment workstation's public IP. Update that SSH rule when your IP changes.
- SSH key pair: `excalidraw-deploy`, imported from the existing workstation
  `~/.ssh/id_ed25519.pub`. The private key was not uploaded to AWS.

## Routing

- Frontend: `https://excalidraw.lakshyakumar.in`.
- Backend API: `https://api.13-236-175-199.sslip.io`.
- WebSocket: `wss://ws.13-236-175-199.sslip.io`.
- Browser API requests: frontend `/backend/...` → EC2.
- Browser authentication: frontend `/api/auth/...` → EC2.
- Neon remains the authoritative PostgreSQL database.

The free `sslip.io` hostnames resolve from the Elastic IP and use Caddy-managed
public HTTPS certificates. This depends on external DNS; replace with your own
domain later if desired. Keep the Elastic IP associated when resizing EC2.

The frontend custom domain is now canonical. The old
`excalidraw-eight-rust.vercel.app` hostname redirects to
`https://excalidraw.lakshyakumar.in`, preserving paths and query strings.
Sign-in cookies belong to the new hostname; users may need to sign in again.

## Environment

Production Vercel settings:

```dotenv
NEXT_PUBLIC_API_URL=https://excalidraw.lakshyakumar.in
NEXT_PUBLIC_API_PROXY_PREFIX=/backend
API_PROXY_TARGET=https://api.13-236-175-199.sslip.io
NEXT_PUBLIC_WS_URL=wss://ws.13-236-175-199.sslip.io
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false
LEGACY_WEB_HOST=excalidraw-eight-rust.vercel.app
```

EC2 uses `~/excalidraw/.env.ec2`, permissions `600`. A local deployment copy also
exists at the repository root and is ignored by Git, Docker builds, and Vercel
uploads. Never publish this file. Existing backend database/auth/email secrets
were reused; there are no credentials in this record.

`WEB_ORIGIN` and `BETTER_AUTH_URL` both use the frontend HTTPS origin because
authentication is proxied through that hostname. Redis is private to Docker;
all three backend services use `redis://redis:6379` and metrics are disabled.

## Access and operations

From the workstation:

```sh
ssh -i ~/.ssh/id_ed25519 ubuntu@13.236.175.199
```

On EC2:

```sh
cd ~/excalidraw
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml ps
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml logs --tail=100 api websocket flush-worker
sudo docker stats --no-stream
free -m
df -h /
sudo docker compose --env-file .env.ec2 -f compose.ec2.yaml exec redis redis-cli ZCARD collab:dirty-rooms
```

The host contains deployment files and the built image, not a full Git checkout.
For updates, build/tag the backend image locally or in CI, load it on EC2, and
copy updated Compose/Caddy files. Run `up -d --wait` to apply the new image or
environment. Follow [the deployment guide](aws-ec2-deployment.md) for the full
process. Do not run `down -v`; it deletes the Redis and certificate volumes.

The frontend was deployed from local source with Vercel CLI. Commit/push the
local changes before relying on future Git-triggered deployments, otherwise
an older Git version can overwrite these deployment/proxy changes.
