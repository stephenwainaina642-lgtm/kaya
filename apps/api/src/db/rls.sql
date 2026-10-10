-- Row-level security: every tenant-scoped table is restricted to rows whose
-- organization_id matches the current transaction's app.org_id session var,
-- set per-request by withTenant() in src/db/client.ts.
--
-- Run as the privileged `kaya` role (which owns these tables and bypasses
-- RLS itself). The non-superuser `kaya_app` role (NOBYPASSRLS) is what the
-- running API connects as, so RLS is actually enforced for it.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'leads', 'clients', 'requirements', 'activities', 'communications',
      'documents', 'follow_ups', 'tasks', 'audit_logs', 'owners', 'properties',
      'client_property_matches', 'client_shortlists', 'deal_stages', 'deals', 'viewings'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
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
      'offers', 'commissions', 'viewing_feedback', 'refresh_tokens'
    ])
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kaya_app', t);
  END LOOP;
END
$$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kaya_app;
