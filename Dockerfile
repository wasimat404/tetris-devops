# syntax=docker/dockerfile:1.7

# ---------- Stage 1: prep ----------
# We don't have a build step yet (vanilla JS, no bundler), but a separate
# stage gives us a clean place to add minification/linting later without
# bloating the runtime image.
FROM alpine:3.20 AS prep
WORKDIR /app
COPY app/ ./
# Sanity check: fail the build early if expected files are missing.
RUN test -f index.html && test -f style.css && test -f tetris.js

# ---------- Stage 2: runtime ----------
# nginx-unprivileged runs as non-root by default and listens on 8080.
# This avoids a whole class of Trivy findings later.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# OCI image metadata (shows up in registries and security scanners).
LABEL org.opencontainers.image.title="tetris-devops" \
      org.opencontainers.image.description="Colorful Tetris served by nginx" \
      org.opencontainers.image.licenses="MIT"

# Custom nginx config: security headers, /health endpoint, asset caching.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy game assets from the prep stage. --chown ensures correct ownership.
COPY --from=prep --chown=nginx:nginx /app /usr/share/nginx/html

# Switch to root to upgrade base packages (CVE patches) and install wget
# for the HEALTHCHECK. Then drop back to the non-root nginx user.
USER root
RUN apk update && apk upgrade --no-cache && apk add --no-cache wget
USER nginx

EXPOSE 8080

# K8s won't use this — it uses its own probes — but it's nice locally:
# `docker ps` will show 'healthy' / 'unhealthy' next to the container.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1
