# Image produksi frontend Dentify: build Vite → disajikan nginx (non-root).
# Build (dari root repo):  docker build --platform linux/amd64 -t dentify-frontend:<TAG> app/frontend
#
# VITE_API_BASE_URL dikosongkan (.env.production) → request API relatif /api/v1/...,
# diteruskan oleh nginx HOST ke backend. Container ini hanya menyajikan file statis.

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && ! grep -rqE "127\.0\.0\.1:8000|localhost:8000" dist/assets   # gagal bila URL backend lokal ikut ter-bundle

# ── Stage 2: serve ──────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Alamat listen diatur lewat env (template diproses entrypoint nginx saat start):
#   server (network_mode: host) → FRONTEND_LISTEN=127.0.0.1:8081
#   uji di laptop               → default 8080 + `-p 8081:8080`
ENV FRONTEND_LISTEN=8080

COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 8080

# ${FRONTEND_LISTEN##*:} = port saja ("127.0.0.1:8081" -> "8081", "8080" -> "8080")
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${FRONTEND_LISTEN##*:}/healthz" || exit 1
