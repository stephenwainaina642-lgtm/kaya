#!/usr/bin/env node
// Runs automatically as the first step of the production start command
// (see render.yaml). Idempotent and safe to run on every boot — does
// nothing destructive once the database is already set up.
//
// What it does, using only `pg` (no psql/shell required, so it works on
// any host with Node — no shell access needed):
//   1. Creates/updates the `kaya_app` role Kaya's API connects as (RLS
//      only applies to non-superuser roles, so this must be separate from
//      the database owner).
//   2. Pushes the Drizzle schema (via `drizzle-kit push`, spawned as a
//      child process — it's a devDependency, present because the Render
//      build installs with --include=dev).
//   3. Applies row-level-security policies (apps/api/src/db/rls.sql).
//   4. Seeds demo data — ONLY if the `organizations` table is empty, so
//      it never wipes real data on a later restart.
//
// Required env vars: DATABASE_ADMIN_URL, APP_DB_PASSWORD.

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.APP_DB_PASSWORD;

if (!adminUrl || !appPassword) {
  console.log('[deploy-setup] DATABASE_ADMIN_URL / APP_DB_PASSWORD not set — skipping (assuming local dev).');
  process.exit(0);
}

function run(cmd, args, opts = {}) {
  console.log(`[deploy-setup] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

async function main() {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  console.log('[deploy-setup] Ensuring kaya_app role exists');
  const { rows } = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'kaya_app'`);
  const escapedPassword = appPassword.replace(/'/g, "''");
  if (rows.length === 0) {
    await client.query(`CREATE ROLE kaya_app WITH LOGIN PASSWORD '${escapedPassword}'`);
  } else {
    await client.query(`ALTER ROLE kaya_app WITH PASSWORD '${escapedPassword}'`);
  }

  const { rows: dbRows } = await client.query('SELECT current_database() AS db');
  const dbName = dbRows[0].db;
  await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO kaya_app`);
  await client.query('GRANT ALL ON SCHEMA public TO kaya_app');

  await client.end();

  console.log('[deploy-setup] Pushing schema');
  run('npx', ['drizzle-kit', 'push'], {
    cwd: path.join(ROOT, 'apps/api'),
    env: { ...process.env, DATABASE_ADMIN_URL: adminUrl },
  });

  // Reconnect — drizzle-kit push can take a while and our earlier client
  // may be stale by now.
  const client2 = new Client({ connectionString: adminUrl });
  await client2.connect();

  console.log('[deploy-setup] Granting kaya_app access to tables created by the schema push');
  await client2.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO kaya_app');
  await client2.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO kaya_app');

  console.log('[deploy-setup] Applying row-level-security policies');
  const rlsSql = readFileSync(path.join(ROOT, 'apps/api/src/db/rls.sql'), 'utf8');
  await client2.query(rlsSql);

  console.log('[deploy-setup] Checking whether demo data needs seeding');
  const { rows: orgRows } = await client2.query('SELECT 1 FROM organizations LIMIT 1');
  await client2.end();

  if (orgRows.length === 0) {
    console.log('[deploy-setup] Database is empty — seeding demo data');
    run('npx', ['tsx', 'src/db/seed/index.ts'], {
      cwd: path.join(ROOT, 'apps/api'),
      env: { ...process.env, DATABASE_ADMIN_URL: adminUrl, DATABASE_URL: adminUrl },
    });
  } else {
    console.log('[deploy-setup] Database already has data — skipping seed');
  }

  console.log('[deploy-setup] Done.');
}

main().catch((err) => {
  console.error('[deploy-setup] FAILED', err);
  process.exit(1);
});
