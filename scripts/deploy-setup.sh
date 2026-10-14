#!/usr/bin/env bash
# One-time setup for a DEPLOYED Postgres instance (Render, Railway, Neon, etc.)
# — no sudo, no local superuser assumptions. Run this once against your
# production database before the app's first real use, and it's safe to
# re-run later (it won't touch existing data beyond granting privileges).
#
# What it does:
#   1. Creates the `kaya_app` role Kaya's API connects as (RLS only applies
#      to non-superuser roles, so this must be separate from the DB owner).
#   2. Pushes the Drizzle schema.
#   3. Applies row-level-security policies.
#   4. Seeds demo data — SKIP this for a real customer-facing deploy by
#      setting SKIP_SEED=1; it truncates and reseeds everything.
#
# Usage:
#   DATABASE_ADMIN_URL="postgres://<owner-user>:<pw>@<host>:5432/<db>?sslmode=require" \
#   APP_DB_PASSWORD="pick-a-strong-password" \
#   bash scripts/deploy-setup.sh
#
# Afterwards, set on your deployed web service:
#   DATABASE_ADMIN_URL = the admin URL above (used for migrations + seeding + the system/cross-tenant queries)
#   DATABASE_URL        = same host/db, but user "kaya_app" and APP_DB_PASSWORD, e.g.
#                          postgres://kaya_app:<APP_DB_PASSWORD>@<host>:5432/<db>?sslmode=require

set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_ADMIN_URL:?Set DATABASE_ADMIN_URL to your Postgres admin/owner connection string}"
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD to a password for the kaya_app role}"

echo "==> Ensuring kaya_app role exists"
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaya_app') THEN
    CREATE ROLE kaya_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';
  ELSE
    ALTER ROLE kaya_app WITH PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO kaya_app', current_database());
END
\$\$;

GRANT ALL ON SCHEMA public TO kaya_app;
SQL

echo "==> Pushing schema"
( cd apps/api && DATABASE_ADMIN_URL="$DATABASE_ADMIN_URL" npx drizzle-kit push )

echo "==> Granting kaya_app access to tables created by the schema push"
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL ON ALL TABLES IN SCHEMA public TO kaya_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO kaya_app;
SQL

echo "==> Applying row-level-security policies"
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f apps/api/src/db/rls.sql

if [ "${SKIP_SEED:-}" != "1" ]; then
  echo "==> Seeding demo data"
  ( cd apps/api && DATABASE_ADMIN_URL="$DATABASE_ADMIN_URL" DATABASE_URL="$DATABASE_ADMIN_URL" npx tsx src/db/seed/index.ts )
else
  echo "==> Skipping seed (SKIP_SEED=1)"
fi

cat <<EOF

==> Done.

Set these on your deployed web service, then redeploy/restart it:
  DATABASE_ADMIN_URL = $DATABASE_ADMIN_URL
  DATABASE_URL        = <same host/db, but user kaya_app and the password you set>
EOF
