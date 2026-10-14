#!/usr/bin/env bash
# Bootstraps a fresh Kaya dev environment after a container reset (or on a
# brand-new machine). Idempotent — safe to re-run.
#
# What it does:
#   1. Starts the local Postgres cluster if it isn't running.
#   2. Creates the kaya / kaya_app roles and the kaya / kaya_test databases
#      if they don't already exist.
#   3. Writes apps/api/.env from .env.example if it's missing.
#   4. Installs npm dependencies (workspace-wide).
#   5. Pushes the Drizzle schema and applies row-level-security policies to
#      both the dev and test databases.
#   6. Seeds the dev database with demo data.
#
# Usage: bash scripts/bootstrap.sh

set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_PW="kaya_admin_pw"
APP_PW="kaya_app_pw"

echo "==> Starting Postgres (if needed)"
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_lsclusters 2>/dev/null | grep -q "online"; then
    sudo pg_ctlcluster 16 main start 2>/dev/null || pg_ctlcluster 16 main start
    sleep 2
  fi
else
  echo "    pg_lsclusters not found — assuming Postgres is managed elsewhere."
fi

psql_as_postgres() {
  sudo -u postgres psql -v ON_ERROR_STOP=0 "$@" 2>&1
}

echo "==> Ensuring roles exist"
psql_as_postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaya') THEN
    CREATE ROLE kaya WITH LOGIN SUPERUSER PASSWORD '${ADMIN_PW}';
  ELSE
    ALTER ROLE kaya WITH PASSWORD '${ADMIN_PW}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaya_app') THEN
    CREATE ROLE kaya_app WITH LOGIN PASSWORD '${APP_PW}';
  ELSE
    ALTER ROLE kaya_app WITH PASSWORD '${APP_PW}';
  END IF;
END
\$\$;
SQL

echo "==> Ensuring databases exist"
for DB in kaya kaya_test; do
  EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'")
  if [ "$EXISTS" != "1" ]; then
    sudo -u postgres psql -c "CREATE DATABASE ${DB} OWNER kaya;"
  fi
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB} TO kaya;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB} TO kaya_app;"
done

echo "==> Writing apps/api/.env (if missing)"
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  echo "    created apps/api/.env from .env.example"
else
  echo "    apps/api/.env already exists, leaving it alone"
fi

echo "==> Installing dependencies"
npm install

echo "==> Pushing schema to the dev database"
npm run db:push -w @kaya/api

echo "==> Pushing schema to the test database"
( cd apps/api && DATABASE_ADMIN_URL="postgres://kaya:${ADMIN_PW}@localhost:5432/kaya_test" npx drizzle-kit push )

echo "==> Applying row-level-security policies"
PGPASSWORD="${ADMIN_PW}" psql -h localhost -U kaya -d kaya -f apps/api/src/db/rls.sql >/dev/null
PGPASSWORD="${ADMIN_PW}" psql -h localhost -U kaya -d kaya_test -f apps/api/src/db/rls.sql >/dev/null

echo "==> Seeding demo data (dev database only)"
npm run db:seed -w @kaya/api

cat <<'EOF'

==> Bootstrap complete.

Start the servers with:
  (cd apps/api && npx tsx src/server.ts) &
  (cd apps/web && npx vite --host 0.0.0.0) &

Demo logins:
  wanjiru@savannaridge.co.ke / Kaya!Demo2026   (Savanna Ridge Realty)
  salim@coastline.example / Kaya!Demo2026      (Coastline Properties)
  ops@kaya.co.ke / Kaya!Demo2026               (platform admin, at /platform/login)
EOF
