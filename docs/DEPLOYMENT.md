# Deployment

Agendo ships as **one Docker image**: the Express API serves the built React app, and pending database migrations run automatically on every start. Any platform that runs a container and offers PostgreSQL works.

> Free tiers change often. Check each provider's current limits before relying on them.

## Option 1 — Render (blueprint, ~10 minutes)

The repository includes [`render.yaml`](../render.yaml), which creates a PostgreSQL database and a web service.

1. Push the repository to GitHub.
2. In [Render](https://render.com): **New + → Blueprint** and select the repository.
3. Render reads `render.yaml`, creates `agendo-db` and the `agendo` service, and generates `JWT_ACCESS_SECRET` for you.
4. Wait for the first deploy. The health check is `/api/health`.
5. _(Optional)_ load demo accounts from your machine using the database's **External Database URL** from the Render dashboard:

   ```bash
   DATABASE_URL="<external database url>" npx tsx apps/api/prisma/seed.ts
   ```

Notes:

- Render's free web services sleep when idle; the first request after a while is slow.
- Render's free PostgreSQL databases expire after a limited period. For a longer-lived free database, create one on [Neon](https://neon.tech) and set its connection string as `DATABASE_URL` instead of the `fromDatabase` reference.

## Option 2 — Any container host (Railway, Fly.io, a VPS…)

Build and run the image with two required variables:

```bash
docker build -t agendo .
docker run -p 4000:4000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/agendo" \
  -e JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  agendo
```

The container listens on `PORT` (default `4000`), runs `prisma migrate deploy`, then starts the server.

## Production checklist

- [ ] `JWT_ACCESS_SECRET` is random and at least 32 characters (never reuse the example value).
- [ ] The site is served over **HTTPS**: in production the refresh cookie is marked `Secure`, so login only persists over HTTPS.
- [ ] `DATABASE_URL` uses SSL if your provider requires it (append `?sslmode=require`).
- [ ] Optionally set `VITE_REPO_URL` as a **build argument** if you want the footer link (it is read at build time).
- [ ] Running more than one instance? Move rate limiting to a shared store (see "Future improvements" in the README).
