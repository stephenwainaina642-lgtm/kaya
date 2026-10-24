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
  // statement it considers possibly destructive — adding a UNIQUE
  // constraint to a table that already has rows (shortlist_items_pair_unique)
  // is one example. There's no TTY on Render, so that confirmation can
  // never be answered. Observed behaviour is worse than a clean hang: push
  // picks its default answer for that ONE statement and then silently
  // abandons every statement still queued after it in that run — including
  // completely unrelated ones (a new table, a plain ADD COLUMN on a
  // different table entirely) — while still exiting 0. `--force` does NOT
  // fix this; confirmed by reproducing it locally both before and after
  // this fix. Two real incidents from this exact failure so far:
  //   1. automation_rules was never created, which then crashed the RLS
  //      step below and crash-looped the whole service.
  //   2. users.failed_login_attempts / users.locked_until (added for the
  //      login-lockout feature) were silently never added, which broke
  //      EVERY login and token refresh with a 500 — even though the
  //      deploy itself reported success.
  // In case (2), the fix below for case (1) was already live, which means
  // push still hit a confirmation prompt it had nothing to do with case 1
  // — there is evidently more than one statement in our history that can
  // trigger this, and probably more in the future.
  //
  // General fix: apply every schema change we know has ever needed
  // confirmation ourselves, directly and idempotently, in applyKnownFixups()
  // below — both BEFORE push (so push has nothing left to ask about) and
  // AGAIN AFTER push (as a safety net: if push still hit some *other*,
  // not-yet-known confirmation and silently dropped these along with
  // everything after it, this repairs it instead of leaving production
  // broken with no visible failure). We also run push itself up to 3 times
  // in a row — since statements before a confirmation point do commit, a
  // second run re-diffs and makes progress on whatever's left, converging
  // as long as there are fewer than 3 distinct confirmation points pending.
  //
  // shortlist_items_pair_unique is verified safe to add unconditionally:
  // the app's shortlist-item upsert (modules/shortlists/shortlists.service.ts)
  // already does .onConflictDoUpdate on exactly this (shortlist_id,
  // property_id) pair, which only works with this constraint in place, so
  // no duplicate pair can exist through the app. The two lockout columns
  // are a plain NOT-NULL-with-default and a plain nullable column — adding
  // either can't lose data.
  async function applyKnownFixups(c) {
    await c.query(`
      DO $$
      BEGIN
        IF to_regclass('shortlist_items') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortlist_items_pair_unique')
        THEN
          ALTER TABLE shortlist_items ADD CONSTRAINT shortlist_items_pair_unique UNIQUE (shortlist_id, property_id);
        END IF;
      END $$;
    `);
    for (const table of ['users', 'platform_admins']) {
      await c.query(`
        DO $$
        BEGIN
          IF to_regclass('${table}') IS NOT NULL THEN
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS locked_until timestamptz;
          END IF;
        END $$;
      `);
    }
  }

  console.log('[deploy-setup] Pre-applying known schema fixups (avoids push confirmation prompts)');
  await applyKnownFixups(client);

  await client.end();

  console.log('[deploy-setup] Pushing schema');
  // Run up to 3 times — see the long comment above for why one run can
  // leave things incomplete even with --force.
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[deploy-setup] drizzle-kit push attempt ${attempt}/3`);
    run('npx', ['drizzle-kit', 'push', '--force'], {
      cwd: path.join(ROOT, 'apps/api'),
      env: { ...process.env, DATABASE_ADMIN_URL: adminUrl },
    });
  }

  // Reconnect — drizzle-kit push can take a while and our earlier client
  // may be stale by now.
  const client2 = new Client({ connectionString: adminUrl });
  await client2.connect();

  console.log('[deploy-setup] Re-applying known schema fixups (safety net in case push dropped them again)');
  await applyKnownFixups(client2);

  console.log('[deploy-setup] Granting kaya_app access to tables created by the schema push');
  await client2.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO kaya_app');
  await client2.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO kaya_app');

  console.log('[deploy-setup] Applying row-level-security policies');
  const rlsSql = readFileSync(path.join(ROOT, 'apps/api/src/db/rls.sql'), 'utf8');
  await client2.query(rlsSql);

  // Final loud check: if any of the columns/constraints we just went to
  // this much trouble to guarantee are STILL missing, don't let the
  // service come up silently broken the way it did today — log it as
  // unmissable so it's the first thing visible in the deploy log, without
  // crash-looping the whole service over it.
  const { rows: missing } = await client2.query(`
    SELECT 'users.failed_login_attempts' AS item WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    )
    UNION ALL
    SELECT 'platform_admins.failed_login_attempts' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_admins' AND column_name = 'failed_login_attempts'
    )
    UNION ALL
    SELECT 'shortlist_items_pair_unique' WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'shortlist_items_pair_unique'
    )
  `);
  if (missing.length > 0) {
    console.error(`[deploy-setup] *** STILL MISSING after push + fixups: ${missing.map((r) => r.item).join(', ')} ***`);
  } else {
    console.log('[deploy-setup] Verified: all known fixups are in place.');
  }

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
