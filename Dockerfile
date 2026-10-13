FROM node:24-bookworm-slim AS build

WORKDIR /workspace
ENV TURBO_TELEMETRY_DISABLED=1

RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=http-server... --filter=ws-server... --filter=flush-worker...

FROM node:24-bookworm-slim AS runtime

WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace /workspace

# InstaCloud services override this per service where needed.
EXPOSE 5000
CMD ["node", "apps/http-server/dist/index.js"]
