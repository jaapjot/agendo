# syntax=docker/dockerfile:1
# Multi-stage build: compile everything in a "build" image, then copy only what is needed
# to run into a small final image (no TypeScript sources, no dev dependencies).

FROM node:22-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
# Optional: public repository URL shown in the footer (read by Vite at build time).
ARG VITE_REPO_URL=
ENV VITE_REPO_URL=$VITE_REPO_URL
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
# Production dependencies only, plus the Prisma CLI needed to run migrations on start.
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false \
  && npm install --no-save --workspace=apps/api prisma@6.19.3 \
  && npx --workspace=apps/api prisma generate \
  && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

USER node
EXPOSE 4000
WORKDIR /app/apps/api
# Apply pending migrations, then start. Safe to run on every deploy (already-applied ones are skipped).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
