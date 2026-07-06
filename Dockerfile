# RaWaLLMConfig — reproducible Electron/Vite build image
# Artefakt: out/main/index.js + out/preload + out/renderer (electron-vite build).
# Smoke ist in den Build gebacken (RUN-Assertion auf das Artefakt) -> gruener
# Build == gruener Smoke. Final-Stage enthaelt nur das Artefakt, kein Build-Tooling.

# Basis-Image gepinnt auf Version + Digest (kein latest / kein bare-major).
ARG NODE_IMAGE=node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e

# ---------------------------------------------------------------------------
# Stage 1: builder — Dependencies + electron-vite build
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# pnpm aktiviert via corepack auf der im Manifest gepinnten Version.
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# Electron-Binary-Download im Build vermeiden: wir bauen nur die JS-Artefakte,
# die Electron-Runtime-Binary wird hier nicht ausgefuehrt.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

# 1) Manifest + Lockfile zuerst fuer einen stabilen Dependency-Cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# 2) Restliche public Quellen.
COPY tsconfig.json electron.vite.config.ts ./
COPY src ./src
COPY shared ./shared

# 3) Build (Typecheck + electron-vite build).
RUN pnpm run typecheck && pnpm run build

# 4) Smoke IN den Build gebacken: erwartetes Artefakt muss entstanden sein.
RUN test -f out/main/index.js \
  && test -f out/preload/index.js \
  && test -d out/renderer \
  && echo "SMOKE OK: out/main/index.js + out/preload/index.js + out/renderer vorhanden"

# ---------------------------------------------------------------------------
# Stage 2: final — schlankes Laufzeit-/Artefakt-Image, KEIN Build-Tooling
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS final
WORKDIR /app

# Nur das fertige Build-Artefakt + das Manifest fuer Nachweis.
COPY --from=builder /app/out ./out
COPY --from=builder /app/package.json ./package.json

# Healthcheck/Smoke fuer das Endbild: Artefakt-Existenz pruefen.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD test -f /app/out/main/index.js || exit 1

# Default: Artefakt-Existenz verifizieren und Manifest-Main ausgeben.
CMD ["node", "-e", "const fs=require('fs');if(!fs.existsSync('/app/out/main/index.js'))process.exit(1);console.log('artifact ok:',require('/app/package.json').main)"]
