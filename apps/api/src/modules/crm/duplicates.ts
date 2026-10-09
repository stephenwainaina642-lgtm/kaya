import { eq, and, ne } from 'drizzle-orm';
import type { DuplicateContact } from '@kaya/shared';
import type { Tx } from '../../db/client';
import { leads, clients } from '../../db/schema';
import { conflict } from '../../lib/errors';

export async function findDuplicate(
  tx: Tx,
  organizationId: string,
  phone: string,
  excludeId?: string,
): Promise<DuplicateContact | null> {
  const leadWhere = excludeId
    ? and(eq(leads.organizationId, organizationId), eq(leads.phone, phone), ne(leads.id, excludeId))
    : and(eq(leads.organizationId, organizationId), eq(leads.phone, phone));
  const [leadMatch] = await tx.select({ id: leads.id, fullName: leads.fullName, phone: leads.phone }).from(leads).where(leadWhere).limit(1);
  if (leadMatch) return { kind: 'lead', ...leadMatch };

  const clientWhere = excludeId
    ? and(eq(clients.organizationId, organizationId), eq(clients.phone, phone), ne(clients.id, excludeId))
    : and(eq(clients.organizationId, organizationId), eq(clients.phone, phone));
  const [clientMatch] = await tx.select({ id: clients.id, fullName: clients.fullName, phone: clients.phone }).from(clients).where(clientWhere).limit(1);
  if (clientMatch) return { kind: 'client', ...clientMatch };

  return null;
}

export function duplicateError(dup: DuplicateContact) {
  return conflict(`A ${dup.kind} with this phone number already exists: ${dup.fullName}`, 'DUPLICATE_CONTACT');
}
