import { z } from 'zod';
import { dataScope, type Resource } from '@kaya/shared';
import type { AuthContext } from '../../middleware/auth';
import type { Tx } from '../../db/client';
import { leads, clients, properties } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from '../../lib/errors';

export type Auth = AuthContext;

export const uuidField = z.string().uuid();
export const textField = (max: number) => z.string().trim().min(1).max(max);
export const nameField = textField(200);
export const tagsField = z.array(z.string().trim().min(1).max(40)).max(20).default([]);
export const isoDate = z.string().datetime({ offset: true });

export const pagingQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageWindow(q: { page: number; pageSize: number }) {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}

export function isRealCalendarDate(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function scopeFor(a: Auth, resource: Resource) {
  return dataScope(a.role, resource);
}

export function leadScope(a: Auth) {
  return scopeFor(a, 'leads');
}
export function clientScope(a: Auth) {
  return scopeFor(a, 'clients');
}
export function followUpScope(a: Auth) {
  return scopeFor(a, 'followups');
}
export function taskScope(a: Auth) {
  return scopeFor(a, 'tasks');
}

export async function requireLead(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(leads).where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)));
  if (!row) throw notFound('Lead');
  return row;
}

export async function requireClient(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(clients).where(and(eq(clients.id, id), eq(clients.organizationId, organizationId)));
  if (!row) throw notFound('Client');
  return row;
}

export async function requireProperty(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(properties).where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)));
  if (!row) throw notFound('Property');
  return row;
}

export function agentRef(id: string | null, name: string | null) {
  return id && name ? { id, name } : null;
}

/** Resolves which agent a new record should be assigned to, honoring scope rules. */
export async function resolveAssignee(
  a: Auth,
  requested: string | undefined | null,
  canAssignOthers: boolean,
): Promise<string | null> {
  if (requested && canAssignOthers) return requested;
  if (requested && requested === a.userId) return requested;
  if (!canAssignOthers) return a.userId;
  return requested ?? a.userId;
}

export async function orgTimezone(tx: Tx, organizationId: string): Promise<string> {
  const { organizations } = await import('../../db/schema');
  const [row] = await tx.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return row?.timezone ?? 'Africa/Nairobi';
}
