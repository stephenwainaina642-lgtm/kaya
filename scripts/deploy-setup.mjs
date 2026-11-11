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
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

/**
 * A hash of everything that decides what the database should look like: the
 * schema files, the RLS policies, and this script. When it matches what the
 * last successful setup stored, the (slow) schema push is skipped entirely.
 * On a free Render instance every wake-up from sleep re-runs this script, and
 * the push alone costs 60-120s, which made sign-in time out.
 */
function setupFingerprint() {
  const h = createHash('sha256');
  const dir = path.join(ROOT, 'apps/api/src/db/schema');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(path.join(dir, f)));
  for (const f of ['apps/api/src/db/rls.sql', 'scripts/deploy-setup.mjs']) h.update(readFileSync(path.join(ROOT, f)));
  return h.digest('hex');
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
  const MISSING_SQL = `
    SELECT 'users.failed_login_attempts' AS item WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    )
    UNION ALL
    SELECT 'platform_admins.failed_login_attempts' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_admins' AND column_name = 'failed_login_attempts'
    )
    UNION ALL
    SELECT 'organizations.onboarding_dismissed_at' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'onboarding_dismissed_at'
    )
    UNION ALL
    SELECT 'organizations.plan_expires_at' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'plan_expires_at'
    )
    UNION ALL
    SELECT 'billing_payments' WHERE to_regclass('billing_payments') IS NULL
    UNION ALL
    SELECT 'leases' WHERE to_regclass('leases') IS NULL
    UNION ALL
    SELECT 'leases.expiry_alert_sent_at' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'expiry_alert_sent_at'
    )
    UNION ALL
    SELECT 'leases.deposit_settled_at' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'deposit_settled_at'
    )
    UNION ALL
    SELECT 'leases.deposit_deduction' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'deposit_deduction'
    )
    UNION ALL
    SELECT 'leases.deposit_notes' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'deposit_notes'
    )
    UNION ALL
    SELECT 'rent_charges.extras' WHERE to_regclass('rent_charges') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'rent_charges' AND column_name = 'extras'
    )
    UNION ALL
    SELECT 'leases.reminder_sent_at' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'reminder_sent_at'
    )
    UNION ALL
    SELECT 'leases.portal_token' WHERE to_regclass('leases') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'leases' AND column_name = 'portal_token'
    )
    UNION ALL
    SELECT 'leases_portal_token_idx' WHERE to_regclass('leases') IS NOT NULL AND to_regclass('leases_portal_token_idx') IS NULL
    UNION ALL
    SELECT 'owners.portal_token' WHERE to_regclass('owners') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'owners' AND column_name = 'portal_token'
    )
    UNION ALL
    SELECT 'owners_portal_token_idx' WHERE to_regclass('owners') IS NOT NULL AND to_regclass('owners_portal_token_idx') IS NULL
    UNION ALL
    SELECT 'org_mpesa' WHERE to_regclass('org_mpesa') IS NULL AND to_regclass('organizations') IS NOT NULL
    UNION ALL
    SELECT 'rent_stk_requests' WHERE to_regclass('rent_stk_requests') IS NULL AND to_regclass('leases') IS NOT NULL
    UNION ALL
    SELECT 'role.CARETAKER' WHERE EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') AND NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'role' AND e.enumlabel = 'CARETAKER'
    )
    UNION ALL
    SELECT 'property_images.storage_key' WHERE to_regclass('property_images') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'property_images' AND column_name = 'storage_key'
    )
    UNION ALL
    SELECT 'property_images.mime' WHERE to_regclass('property_images') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'property_images' AND column_name = 'mime'
    )
    UNION ALL
    SELECT 'properties.building' WHERE to_regclass('properties') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'building'
    )
    UNION ALL
    SELECT 'properties.unit_number' WHERE to_regclass('properties') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'unit_number'
    )
    UNION ALL
    SELECT 'properties.advertised' WHERE to_regclass('properties') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'advertised'
    )
    UNION ALL
    SELECT 'organizations.auto_reminders' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'auto_reminders'
    )
    UNION ALL
    SELECT 'organizations.reminder_last_run_on' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'reminder_last_run_on'
    )
    UNION ALL
    SELECT 'organizations.statement_email_day' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'statement_email_day'
    )
    UNION ALL
    SELECT 'organizations.statement_email_last_period' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'statement_email_last_period'
    )
    UNION ALL
    SELECT 'maintenance_requests' WHERE to_regclass('maintenance_requests') IS NULL
    UNION ALL
    SELECT 'rent_charges' WHERE to_regclass('rent_charges') IS NULL
    UNION ALL
    SELECT 'rent_payments' WHERE to_regclass('rent_payments') IS NULL
    UNION ALL
    SELECT 'payment_claims' WHERE to_regclass('leases') IS NOT NULL AND to_regclass('payment_claims') IS NULL
    UNION ALL
    SELECT 'organizations.rent_payment_info' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'rent_payment_info'
    )
    UNION ALL
    SELECT 'password_reset_tokens' WHERE to_regclass('password_reset_tokens') IS NULL
    UNION ALL
    SELECT 'shortlist_items_pair_unique' WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'shortlist_items_pair_unique'
    )
    UNION ALL
    SELECT 'deals_org_number_unique' WHERE to_regclass('deals') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'deals_org_number_unique'
    ) AND NOT EXISTS (
      SELECT 1 FROM deals GROUP BY organization_id, deal_number HAVING count(*) > 1
    )
  `;

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
    // Same prompt, same fix: without this, every boot stopped at "truncate the
    // deals table?". Only added when no organisation has two deals with the
    // same number, so it can never fail on existing data.
    await c.query(`
      DO $$
      BEGIN
        IF to_regclass('deals') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_org_number_unique')
           AND NOT EXISTS (SELECT 1 FROM deals GROUP BY organization_id, deal_number HAVING count(*) > 1)
        THEN
          ALTER TABLE deals ADD CONSTRAINT deals_org_number_unique UNIQUE (organization_id, deal_number);
        END IF;
      END $$;
    `);
    // Added later than the lockout columns; same silent-drop risk, same fix.
    await c.query(`
      DO $$
      BEGIN
        IF to_regclass('organizations') IS NOT NULL THEN
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS statement_email_day integer;
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_reminders boolean NOT NULL DEFAULT false;
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reminder_last_run_on text;
          ALTER TABLE organizations ADD COLUMN IF NOT EXISTS statement_email_last_period text;
          CREATE TABLE IF NOT EXISTS billing_payments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            plan plan NOT NULL,
            months integer NOT NULL,
            seats integer NOT NULL,
            amount integer NOT NULL,
            phone text NOT NULL,
            status text NOT NULL DEFAULT 'PENDING',
            merchant_request_id text,
            checkout_request_id text UNIQUE,
            mpesa_receipt text,
            failure_reason text,
            created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            paid_at timestamptz
          );
        END IF;
        IF to_regclass('properties') IS NOT NULL AND to_regclass('clients') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS leases (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
            tenant_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
            rent_amount integer NOT NULL,
            deposit_amount integer NOT NULL DEFAULT 0,
            due_day integer NOT NULL DEFAULT 1,
            start_date date NOT NULL,
            end_date date,
            fee_bps integer NOT NULL DEFAULT 0,
            withholding_bps integer NOT NULL DEFAULT 0,
            status text NOT NULL DEFAULT 'ACTIVE',
            created_at timestamptz NOT NULL DEFAULT now()
          );
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS expiry_alert_sent_at timestamptz;
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS portal_token text;
          CREATE UNIQUE INDEX IF NOT EXISTS leases_portal_token_idx ON leases (portal_token);
          ALTER TABLE owners ADD COLUMN IF NOT EXISTS portal_token text;
          CREATE UNIQUE INDEX IF NOT EXISTS owners_portal_token_idx ON owners (portal_token);
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_deduction integer NOT NULL DEFAULT 0;
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_settled_at timestamptz;
          ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_notes text;
          CREATE TABLE IF NOT EXISTS maintenance_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
            tenant_id uuid REFERENCES clients(id) ON DELETE SET NULL,
            title text NOT NULL,
            description text,
            category text NOT NULL DEFAULT 'OTHER',
            priority text NOT NULL DEFAULT 'MEDIUM',
            status text NOT NULL DEFAULT 'OPEN',
            assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
            vendor_name text,
            vendor_phone text,
            estimated_cost integer,
            actual_cost integer,
            charge_to_landlord boolean NOT NULL DEFAULT false,
            resolved_at timestamptz,
            created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE IF NOT EXISTS rent_charges (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
            period text NOT NULL,
            due_date date NOT NULL,
            amount integer NOT NULL,
            paid_amount integer NOT NULL DEFAULT 0,
            status text NOT NULL DEFAULT 'UNPAID',
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT rent_charges_lease_period_key UNIQUE (lease_id, period)
          );
          ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb;
          CREATE TABLE IF NOT EXISTS rent_payments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            charge_id uuid NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
            amount integer NOT NULL,
            method text NOT NULL,
            reference text,
            paid_at timestamptz NOT NULL DEFAULT now(),
            recorded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        END IF;
        ALTER TABLE organizations ADD COLUMN IF NOT EXISTS rent_payment_info text;
        IF to_regclass('leases') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS payment_claims (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
            amount integer NOT NULL,
            mpesa_code text NOT NULL,
            status text NOT NULL DEFAULT 'PENDING',
            resolved_at timestamptz,
            resolved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        END IF;
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
          ALTER TYPE role ADD VALUE IF NOT EXISTS 'CARETAKER';
        END IF;
        IF to_regclass('property_images') IS NOT NULL THEN
          ALTER TABLE property_images ADD COLUMN IF NOT EXISTS storage_key text;
          ALTER TABLE property_images ADD COLUMN IF NOT EXISTS mime text;
        END IF;
        IF to_regclass('properties') IS NOT NULL THEN
          ALTER TABLE properties ADD COLUMN IF NOT EXISTS building text;
          ALTER TABLE properties ADD COLUMN IF NOT EXISTS unit_number text;
          ALTER TABLE properties ADD COLUMN IF NOT EXISTS advertised boolean NOT NULL DEFAULT false;
        END IF;
        IF to_regclass('organizations') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS org_mpesa (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            mode text NOT NULL DEFAULT 'sandbox',
            account_type text NOT NULL DEFAULT 'PAYBILL',
            shortcode text NOT NULL,
            consumer_key text NOT NULL,
            consumer_secret_enc text NOT NULL,
            passkey_enc text NOT NULL,
            callback_secret text NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS org_mpesa_org_idx ON org_mpesa (organization_id);
          CREATE UNIQUE INDEX IF NOT EXISTS org_mpesa_callback_idx ON org_mpesa (callback_secret);
        END IF;
        IF to_regclass('leases') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS rent_stk_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
            amount integer NOT NULL,
            phone text NOT NULL,
            checkout_request_id text NOT NULL,
            status text NOT NULL DEFAULT 'PENDING',
            result_desc text,
            receipt text,
            created_at timestamptz NOT NULL DEFAULT now(),
            settled_at timestamptz
          );
          CREATE UNIQUE INDEX IF NOT EXISTS rent_stk_checkout_idx ON rent_stk_requests (checkout_request_id);
        END IF;
        IF to_regclass('users') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash text NOT NULL,
            expires_at timestamptz NOT NULL,
            used_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        END IF;
      END $$;
    `);
    // Data fix, safe to repeat: a property with an active lease is let, not available. Older leases
    // were created before the app kept the two in step. Sold and withdrawn properties are left alone.
    await c.query(`
      DO $$
      BEGIN
        IF to_regclass('leases') IS NOT NULL AND to_regclass('properties') IS NOT NULL THEN
          UPDATE properties SET status = 'LET'
          WHERE status IN ('AVAILABLE', 'UNDER_OFFER')
            AND id IN (SELECT property_id FROM leases WHERE status = 'ACTIVE');
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

  const fingerprint = setupFingerprint();
  const { rows: stateTable } = await client.query(`SELECT to_regclass('kaya_deploy_state') AS t`);
  if (stateTable[0].t) {
    const { rows: saved } = await client.query(`SELECT value FROM kaya_deploy_state WHERE key = 'setup_fingerprint'`);
    if (saved[0]?.value === fingerprint) {
      const { rows: gaps } = await client.query(MISSING_SQL);
      if (gaps.length === 0) {
        console.log('[deploy-setup] Schema unchanged since the last successful setup; skipping the schema push. Verified: all known fixups are in place.');
        await client.end();
        return;
      }
    }
  }

  console.log('[deploy-setup] Pre-applying known schema fixups (avoids push confirmation prompts)');
  await applyKnownFixups(client);
  await client.query('DROP TABLE IF EXISTS kaya_deploy_state');

  await client.end();

  // drizzle-kit push treats any table it doesn't know (our own kaya_deploy_state) as a possible rename source and
  // stops to ask "created or renamed?" whenever the schema gains a table, which hangs or skips the push on a
  // deploy. Remove it now; it is recreated, with the new fingerprint, once setup succeeds.
  console.log('[deploy-setup] Pushing schema');
  // Run up to 3 times — see the long comment above for why one run can
  // leave things incomplete even with --force.
  // Normally one push is enough, and each one costs 20-60s of cold-start
  // time on a free instance. Only repeat when verification shows something
  // the push silently dropped.
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[deploy-setup] drizzle-kit push attempt ${attempt}/3`);
    run('npx', ['drizzle-kit', 'push', '--force'], {
      cwd: path.join(ROOT, 'apps/api'),
      env: { ...process.env, DATABASE_ADMIN_URL: adminUrl },
    });
    const probe = new Client({ connectionString: adminUrl });
    await probe.connect();
    await applyKnownFixups(probe);
    const { rows: gaps } = await probe.query(MISSING_SQL);
    await probe.end();
    if (gaps.length === 0) {
      console.log('[deploy-setup] Schema verified after push; no further attempts needed');
      break;
    }
    console.warn(`[deploy-setup] Still missing after attempt ${attempt}: ${gaps.map((g) => g.item).join(', ')}`);
  }

  // Reconnect — drizzle-kit push can take a while and our earlier client
  // may be stale by now.
  const client2 = new Client({ connectionString: adminUrl });
  await client2.connect();

  console.log('[deploy-setup] Re-applying known schema fixups (safety net in case push dropped them again)');
  await applyKnownFixups(client2);

  // Supabase publishes everything in the public schema through its own REST
  // API to the built-in `anon` and `authenticated` roles, and anyone holding
  // the project's public anon key can use it. Kaya never uses that API, and
  // several of our tables (users, refresh tokens, platform admins...) carry
  // no row-level security, so close it off. A no-op on plain Postgres, where
  // those roles don't exist.
  console.log('[deploy-setup] Closing off any Supabase public-API roles');
  await client2.query(`
    DO $$
    DECLARE r text;
    BEGIN
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
          EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
          EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
        END IF;
      END LOOP;
    END $$;
  `);

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
  const { rows: missing } = await client2.query(MISSING_SQL);
  if (missing.length > 0) {
    console.error(`[deploy-setup] *** STILL MISSING after push + fixups: ${missing.map((r) => r.item).join(', ')} ***`);
  } else {
    console.log('[deploy-setup] Verified: all known fixups are in place.');
    // Remember this state so the next wake-up can skip the push. Created here,
    // after the push, because drizzle-kit drops tables it does not know about.
    await client2.query(`CREATE TABLE IF NOT EXISTS kaya_deploy_state (key text PRIMARY KEY, value text NOT NULL)`);
    await client2.query(
      `INSERT INTO kaya_deploy_state (key, value) VALUES ('setup_fingerprint', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [fingerprint],
    );
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
