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

  // drizzle-kit push pauses for an interactive y/n confirmation before any
  // statement it considers possibly destructive — e.g. adding a UNIQUE
  // constraint to a table that already has rows, which is exactly what
  // shortlist_items_pair_unique needs here once the table has real data.
  // There's no TTY on Render, so that confirmation can never be answered.
  // Observed behaviour was worse than a clean hang: push silently abandoned
  // the REST of its pending statements too (leaving tables like
  // automation_rules never created, even though creating a new empty table
  // needs no confirmation at all) while still exiting 0 — `--force` does
  // NOT fix this; confirmed by reproducing it locally. The failure only
  // surfaced seconds later as a hard crash in the RLS step below, taking
  // the whole service down and crash-looping on every restart.
  //
  // Fix: apply this one constraint ourselves, directly and idempotently,
  // before push ever runs — so by the time push looks at the schema diff,
  // there's nothing left that needs confirming. Verified safe to add
  // unconditionally: the app's shortlist-item upsert
  // (modules/shortlists/shortlists.service.ts) already does
  // .onConflictDoUpdate on exactly this (shortlist_id, property_id) pair,
  // which only works with this constraint in place, so no duplicate pair
  // can exist through the app — only a table that doesn't have the
  // constraint yet could have one slip in some other way, and it hasn't.
  console.log('[deploy-setup] Pre-applying shortlist_items_pair_unique (avoids a push confirmation prompt)');
  await client.query(`
    DO $$
    BEGIN
      IF to_regclass('shortlist_items') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortlist_items_pair_unique')
      THEN
        ALTER TABLE shortlist_items ADD CONSTRAINT shortlist_items_pair_unique UNIQUE (shortlist_id, property_id);
      END IF;
    END $$;
  `);

  await client.end();

  console.log('[deploy-setup] Pushing schema');
  // --force on top of the above: belt-and-braces for any other
  // confirmation-gated statement we haven't hit yet (e.g. a future column
  // drop). It alone would not have fixed today's failure — see above — but
  // it's still strictly better than leaving a future prompt to stall.
  run('npx', ['drizzle-kit', 'push', '--force'], {
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
  // Check for the actual seeded demo user, not just "any row in
  // organizations" — a crashed seed attempt (e.g. an earlier RLS failure
  // partway through insertion) can leave a stray partial organizations row
  // behind with no matching user, which would otherwise look "seeded" and
  // get wrongly skipped forever. seed/index.ts's resetDb() TRUNCATEs
  // everything first, so it's safe to re-run against partial leftovers.
  const { rows: userRows } = await client2.query(
    `SELECT 1 FROM users WHERE email = 'wanjiru@savannaridge.co.ke' LIMIT 1`,
  );
  await client2.end();

  if (userRows.length === 0) {
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
