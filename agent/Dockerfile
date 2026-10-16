# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: static Go binary (stdlib-only agent, no CGO required).
# ---------------------------------------------------------------------------
FROM golang:1.23-alpine AS builder

WORKDIR /src

# Copy the module file first so the dependency layer is cached independently
# of source changes (this is a no-op for the stdlib-only agent today, but
# keeps the build correct if a go.sum appears later).
COPY go.mod ./
COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/clouddeck-agent ./cmd/clouddeck-agent

# ---------------------------------------------------------------------------
# Runtime stage: Ubuntu so the agent can manage a real nginx/certbot stack.
# ---------------------------------------------------------------------------
FROM ubuntu:24.04

# nginx serves the managed sites; curl powers the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /www/wwwroot

COPY --from=builder /out/clouddeck-agent /usr/local/bin/clouddeck-agent

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 9090 80

# Dev-friendly defaults. Production must keep AGENT_LISTEN on 127.0.0.1
# (the v0.1 agent API is unauthenticated) — see docs/deployment.md.
ENV AGENT_LISTEN=0.0.0.0:9090 \
    AGENT_STATE_DIR=/data \
    AGENT_NGINX_SITES_DIR=/etc/nginx/conf.d \
    AGENT_WEBROOT=/www/wwwroot

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=12 \
  CMD curl -fsS http://127.0.0.1:9090/v1/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
