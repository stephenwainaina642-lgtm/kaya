-- Row-level security: every tenant-scoped table is restricted to rows whose
-- organization_id matches the current transaction's app.org_id session var,
-- set per-request by withTenant() in src/db/client.ts.
--
-- Run as the privileged `kaya` role (which owns these tables). Table owners
-- bypass RLS by default — intentionally NOT using FORCE ROW LEVEL SECURITY,
-- so the admin/system connection (local superuser in dev, or just the plain
-- table-owning role on a managed host like Render, which isn't a real
-- superuser there) can still seed data and run cross-tenant platform-admin
-- queries without needing app.org_id set. The non-superuser, non-owner
-- `kaya_app` role is what the running API actually connects as, and RLS is
-- always enforced for it regardless of FORCE.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'leads', 'clients', 'requirements', 'activities', 'communications',
      'documents', 'follow_ups', 'tasks', 'audit_logs', 'owners', 'properties',
      'client_property_matches', 'client_shortlists', 'deal_stages', 'deals', 'viewings',
      'automation_rules', 'drip_sequences', 'drip_enrollments',
      'viewing_requests', 'document_signatures'
    ])
  LOOP
    -- Guard against a table this script expects but that the schema push
    -- just before it didn't (yet) create — e.g. drizzle-kit push stalled
    -- part-way through on an unrelated interactive confirmation. Previously
    -- this ALTER TABLE threw "relation does not exist" and crashed the
    -- entire deploy (and kept crash-looping on every restart) over ONE
    -- missing table; skip it and keep RLS applied to every table that does
    -- exist, rather than taking the whole service down.
    IF to_regclass(t) IS NULL THEN
      RAISE WARNING 'rls.sql: table % does not exist yet — skipping (likely an incomplete schema push)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Explicitly turn FORCE back off — ENABLE alone does not clear a FORCE
    -- flag a previous run of this script may have already set (this script
    -- used to apply FORCE; a deploy that ran before that was reverted would
    -- otherwise be stuck with it forever).
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = current_setting(''app.org_id'', true)::uuid) WITH CHECK (organization_id = current_setting(''app.org_id'', true)::uuid)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kaya_app', t);
  END LOOP;
END
$$;

-- organizations: every org-scoped row may read its own org row (needed for
-- joins/lookups like timezone/currency); writes go through systemDb only.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  USING (id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.org_id', true)::uuid);
GRANT SELECT ON organizations TO kaya_app;

-- Child tables without their own organization_id column are scoped through
-- their parent's tenant policy (joins to properties/clients/deals/viewings/
-- shortlists all carry RLS automatically), but still need row grants.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'property_images', 'property_features', 'shortlist_items',
      'offers', 'commissions', 'viewing_feedback', 'refresh_tokens', 'drip_sequence_steps'
    ])
  LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE WARNING 'rls.sql: table % does not exist yet — skipping (likely an incomplete schema push)', t;
      CONTINUE;
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kaya_app', t);
  END LOOP;
END
$$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kaya_app;
