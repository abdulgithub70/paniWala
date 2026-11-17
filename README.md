# water-backend

Uses the same Supabase project as the rental app, in a separate Postgres schema called `water`.

## One-time database prep
1. Back up the database (Supabase dashboard -> Database -> Backups, or pg_dump).
2. In the Supabase SQL editor run: `CREATE SCHEMA IF NOT EXISTS water;`

## Local setup
1. `npm install`
2. `cp .env.example .env`, fill in the URLs (keep `?schema=water` in BOTH) and JWT secrets
3. Check `.env` once more: both URLs must end with `schema=water`
4. `npm run prisma:migrate -- --name init`
5. `npx prisma migrate dev --create-only --name enable_rls`, paste `prisma/rls.sql` into the new migration.sql, then `npm run prisma:migrate`
6. `npm run start:dev` and open http://localhost:3000/health

## Verify (Supabase SQL editor)
`select table_schema, table_name from information_schema.tables where table_schema in ('public','water') order by 1,2;`
Water tables must appear only under `water`; the rental tables in `public` must be unchanged.

## Render
Use render.yaml. Set DATABASE_URL, DIRECT_URL (both with `schema=water`), JWT_* and CORS_ORIGINS in the dashboard.

## Step 2: auth
- `npm install` (adds firebase-admin), then `npm test` and `npm run start:dev`
- Dev login (no Firebase needed): set `DEV_OTP_ENABLED=true` in `.env`, then POST /auth/dev
- Real OTP: add `FIREBASE_SERVICE_ACCOUNT_BASE64` and use POST /auth/firebase
