# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependency stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------------------
# Build stage (Next.js `output: "standalone"` — panel/next.config.ts)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Standalone builds expect a public/ directory; create it if the repo has none.
RUN mkdir -p public \
    && npm run build

# ---------------------------------------------------------------------------
# Runtime stage: only the standalone server + static assets.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=2083 \
    HOSTNAME=0.0.0.0

# Runtime state (users.json, sessions) — mount a volume here.
RUN mkdir -p /data

# Standalone server, static chunks and public assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

CMD ["node", "server.js"]
