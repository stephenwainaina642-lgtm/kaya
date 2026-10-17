import { sql } from 'drizzle-orm';
import { systemDb } from '../db/system';
import { organizations, users } from '../db/schema';
import { signAccessToken } from '../lib/tokens';
import { hashPassword } from '../lib/password';
import type { Plan, Role } from '@kaya/shared';

const TENANT_TABLES = [
  'commissions', 'offers', 'viewing_feedback', 'viewings', 'deals', 'deal_stages',
  'shortlist_items', 'client_shortlists', 'client_property_matches', 'property_features',
  'property_images', 'properties', 'owners', 'documents', 'communications', 'activities',
  'follow_ups', 'tasks', 'requirements', 'audit_logs', 'refresh_tokens', 'clients', 'leads',
  'users', 'organizations', 'platform_admins',
];

export async function truncateAll(): Promise<void> {
  await systemDb.execute(sql.raw(`TRUNCATE TABLE ${TENANT_TABLES.join(', ')} RESTART IDENTITY CASCADE`));
}

export async function createOrg(name = 'Test Realty', plan: Plan = 'STARTER'): Promise<{ id: string; plan: Plan }> {
  const [org] = await systemDb
    .insert(organizations)
    .values({
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      plan,
    })
    .returning();
  if (!org) throw new Error('failed to create test org');
  return org;
}

export async function createUser(
  organizationId: string,
  opts: { name?: string; email?: string; role?: Role } = {},
): Promise<{ id: string; organizationId: string; role: Role; name: string; token: string }> {
  const email = opts.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.kaya`;
  const role = opts.role ?? 'ORG_ADMIN';
  const name = opts.name ?? 'Test User';
  const passwordHash = await hashPassword('Test!Pass1234');
  const [row] = await systemDb
    .insert(users)
    .values({ organizationId, name, email, passwordHash, role })
    .returning();
  if (!row) throw new Error('failed to create test user');
  const token = signAccessToken({ sub: row.id, organizationId, role, name });
  return { id: row.id, organizationId, role, name, token };
}

export async function setupTenant(role: Role = 'ORG_ADMIN', plan: Plan = 'STARTER') {
  const org = await createOrg('Test Realty', plan);
  const user = await createUser(org.id, { role });
  return { org, user, authHeader: { Authorization: `Bearer ${user.token}` } };
}
