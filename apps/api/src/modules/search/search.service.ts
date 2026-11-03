import { z } from 'zod';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { can } from '@kaya/shared';
import type { SearchHit, SearchResults } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, clients, owners, properties } from '../../db/schema';
import { parse } from '../../lib/validate';
import { type Auth, leadScope, clientScope } from '../crm/common';

const PER_GROUP = 5;
const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });

// % and _ are wildcards in ILIKE; a user typing "50%" means the literal text.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// People type 0722 123 456 while the CRM stores +254722123456. When the query
// looks like a phone number, match on the part that is the same in both.
function phoneFragment(q: string): string | null {
  if (!/^[\d\s+\-()]{5,}$/.test(q)) return null;
  const digits = q.replace(/\D/g, '').replace(/^(254|0)/, '');
  return digits.length >= 5 ? digits : null;
}

export async function search(a: Auth, query: unknown): Promise<SearchResults> {
  const { q } = parse(searchQuery, query);
  const like = `%${escapeLike(q)}%`;
  const phone = phoneFragment(q);
  const phoneLike = phone ? `%${escapeLike(phone)}%` : null;

  return withTenant(a.organizationId, async (tx) => {
    const hits: SearchHit[] = [];

    if (can(a.role, 'leads:view')) {
      const conds: (SQL | undefined)[] = [
        eq(leads.organizationId, a.organizationId),
        or(ilike(leads.fullName, like), ilike(leads.email, like), phoneLike ? ilike(leads.phone, phoneLike) : ilike(leads.phone, like)),
      ];
      if (leadScope(a) === 'own') conds.push(eq(leads.assignedAgentId, a.userId));
      const rows = await tx.select().from(leads).where(and(...conds)).orderBy(desc(leads.createdAt)).limit(PER_GROUP);
      hits.push(...rows.map((r) => ({
        type: 'lead' as const, id: r.id, title: r.fullName, subtitle: `${r.phone} · ${r.status.toLowerCase()}`, to: `/leads/${r.id}`,
      })));
    }

    if (can(a.role, 'clients:view')) {
      const conds: (SQL | undefined)[] = [
        eq(clients.organizationId, a.organizationId),
        or(ilike(clients.fullName, like), ilike(clients.email, like), phoneLike ? ilike(clients.phone, phoneLike) : ilike(clients.phone, like)),
      ];
      if (clientScope(a) === 'own') conds.push(eq(clients.assignedAgentId, a.userId));
      const rows = await tx.select().from(clients).where(and(...conds)).orderBy(desc(clients.createdAt)).limit(PER_GROUP);
      hits.push(...rows.map((r) => ({
        type: 'client' as const, id: r.id, title: r.fullName, subtitle: r.phone, to: `/clients/${r.id}`,
      })));
    }

    if (can(a.role, 'properties:view')) {
      const rows = await tx.select().from(properties)
        .where(and(
          eq(properties.organizationId, a.organizationId),
          or(ilike(properties.title, like), ilike(properties.reference, like), ilike(properties.location, like), ilike(properties.neighborhood, like)),
        ))
        .orderBy(desc(properties.createdAt)).limit(PER_GROUP);
      hits.push(...rows.map((r) => ({
        type: 'property' as const, id: r.id, title: r.title, subtitle: `${r.reference} · ${r.location}`, to: `/properties/${r.id}`,
      })));
    }

    if (can(a.role, 'owners:view')) {
      const rows = await tx.select().from(owners)
        .where(and(
          eq(owners.organizationId, a.organizationId),
          or(ilike(owners.fullName, like), ilike(owners.companyName, like), phoneLike ? ilike(owners.phone, phoneLike) : ilike(owners.phone, like)),
        ))
        .orderBy(desc(owners.createdAt)).limit(PER_GROUP);
      hits.push(...rows.map((r) => ({
        type: 'owner' as const, id: r.id, title: r.fullName ?? r.companyName ?? r.phone, subtitle: r.companyName && r.fullName ? r.companyName : r.phone, to: `/owners/${r.id}`,
      })));
    }

    return { query: q, hits };
  });
}
