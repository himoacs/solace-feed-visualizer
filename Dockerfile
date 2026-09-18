# Packages the app itself (web UI + API/SEMP-proxy server) as a single
# image serving everything on one port. Does NOT include the Solace broker -
# that's a separate, external dependency the app connects to over the
# network (see README.md's "Local broker quick-start" for running one).

# ---- build ----
FROM node:20-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10

# Copy only the manifests first so `pnpm install` is cached across builds
# whenever just the source changes, not the dependency graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
RUN npm install -g pnpm@10
ENV NODE_ENV=production

# @feed-viz/shared is a type-only dependency of the server (erased at
# compile time - see packages/server/src/semp.ts's `import type`), so only
# its package.json is needed here to satisfy pnpm's workspace:* linking;
# its source is never actually loaded at runtime.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --prod --frozen-lockfile --filter @feed-viz/server...

COPY --from=builder /app/packages/server/dist ./packages/server/dist
# The server serves this directory as static files (see
# packages/server/src/index.ts) - collapsing the web UI and the API onto
# one origin/port so the web app's relative `/api/...` calls (which rely on
# same-origin, via Vite's dev-only proxy in local dev) keep working in
# production without a separate reverse proxy.
COPY --from=builder /app/packages/web/dist ./packages/server/public

EXPOSE 4001
CMD ["node", "packages/server/dist/index.js"]
