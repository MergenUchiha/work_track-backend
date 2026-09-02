# =============================================================
# WorkTrack Backend — Dockerfile (multi-stage production build)
# =============================================================

# ──────────────────────────────────────────────────────────────
# Stage 1: deps
# Installs every dependency, dev ones included — the build needs them
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Toolchain for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first so the install layer stays cached
COPY package*.json ./

RUN npm ci

# ──────────────────────────────────────────────────────────────
# Stage 2: builder
# Generates the Prisma client and compiles TypeScript
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Reuse the installed dependencies
COPY --from=deps /app/node_modules ./node_modules

COPY . .

# The Prisma client must exist before tsc runs
RUN npx prisma generate --schema prisma/schemas

# Compile TypeScript into dist/
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 3: production
# Minimal image: build artefacts and runtime dependencies only
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Runtime libraries for the native modules
RUN apk add --no-cache \
    libstdc++ \
    # postgresql-client provides pg_isready, used by the entrypoint
    postgresql-client \
    # dumb-init as PID 1, so signals are handled correctly
    dumb-init

WORKDIR /app

# Run as an unprivileged user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nestjs -G nodejs

# package.json is needed for metadata and npm ci below
COPY --from=builder /app/package*.json ./

# Production dependencies only. The Prisma CLI lives in devDependencies,
# so it is copied straight from the builder stage below.
RUN npm ci --omit=dev --ignore-scripts

# Prisma client, generated in the builder stage
COPY --from=builder /app/node_modules/.prisma         ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client  ./node_modules/@prisma/client

# Prisma CLI, required by `migrate deploy` in the entrypoint
COPY --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma          ./node_modules/prisma

# Compiled application
COPY --from=builder /app/dist ./dist

# Schemas and migrations, required by `migrate deploy`
COPY --from=builder /app/prisma ./prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Writable log directory
RUN mkdir -p logs && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

# ──────────────────────────────────────────────────────────────
# Healthcheck
# Probes the liveness endpoint: it does not touch the database and answers fast.
# Three consecutive failures mark the container unhealthy.
# ──────────────────────────────────────────────────────────────
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --retries=3 \
    --start-period=15s \
    CMD wget -qO- http://localhost:3000/health/live || exit 1

# dumb-init as PID 1 for correct signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]