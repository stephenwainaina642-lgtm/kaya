import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { LEAD_SOURCES, TEMPERATURES, LEAD_TYPES } from '@kaya/shared';
import type { LeadImportResult } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, clients } from '../../db/schema';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth } from '../crm/common';

export const IMPORT_MAX_ROWS = 500;

const rawRow = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  source: z.string().optional(),
  temperature: z.string().optional(),
  leadType: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});
const importInput = z.object({ rows: z.array(rawRow).min(1).max(IMPORT_MAX_ROWS) });

// Kenyan numbers arrive as 0712 345 678, 712345678, 254712345678 or
// +254 712 345 678. Store one canonical form so duplicate detection works.
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (/^\+/.test(cleaned)) return cleaned;
  if (/^0\d{9}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^254\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^[17]\d{8}$/.test(cleaned)) return `+254${cleaned}`;
  return cleaned;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export async function importLeads(a: Auth, body: unknown): Promise<LeadImportResult> {
  const { rows } = parse(importInput, body);
  const result: LeadImportResult = { created: 0, duplicates: 0, invalid: [] };

  const candidates: { line: number; values: typeof leads.$inferInsert }[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 1;
    const fullName = (r.fullName ?? '').trim();
    const phone = normalizePhone(r.phone ?? '');
    if (!fullName) return void result.invalid.push({ row: line, reason: 'Missing name' });
    if (fullName.length > 120) return void result.invalid.push({ row: line, reason: 'Name too long' });
    if (phone.length < 5 || phone.length > 30 || !/^\+?\d+$/.test(phone)) {
      return void result.invalid.push({ row: line, reason: 'Missing or invalid phone number' });
    }
    const email = (r.email ?? '').trim();
    if (email && !z.string().email().safeParse(email).success) {
      return void result.invalid.push({ row: line, reason: 'Invalid email address' });
    }
    if (seen.has(phone)) { result.duplicates++; return; }
    seen.add(phone);
    candidates.push({
      line,
      values: {
        organizationId: a.organizationId,
        fullName,
        phone,
        whatsapp: r.whatsapp?.trim() ? normalizePhone(r.whatsapp) : null,
        email: email || null,
        source: pick(r.source, LEAD_SOURCES, 'OTHER'),
        temperature: pick(r.temperature, TEMPERATURES, 'WARM'),
        leadType: pick(r.leadType, LEAD_TYPES, 'BUYER'),
        tags: (r.tags ?? '').split(/[;,|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
        notes: r.notes?.trim().slice(0, 2000) || null,
        assignedAgentId: a.userId,
        createdById: a.userId,
        updatedById: a.userId,
      },
    });
  });

  await withTenant(a.organizationId, async (tx) => {
    let fresh = candidates;
    if (candidates.length) {
      const phones = candidates.map((c) => c.values.phone);
      const [l, c] = await Promise.all([
        tx.select({ phone: leads.phone }).from(leads).where(and(eq(leads.organizationId, a.organizationId), inArray(leads.phone, phones))),
        tx.select({ phone: clients.phone }).from(clients).where(and(eq(clients.organizationId, a.organizationId), inArray(clients.phone, phones))),
      ]);
      const existing = new Set([...l, ...c].map((x) => x.phone));
      fresh = candidates.filter((x) => !existing.has(x.values.phone));
      result.duplicates += candidates.length - fresh.length;
    }
    if (fresh.length) await tx.insert(leads).values(fresh.map((x) => x.values));
    result.created = fresh.length;
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'lead', entityId: a.organizationId,
      summary: `Imported ${fresh.length} leads from CSV (${result.duplicates} duplicates, ${result.invalid.length} invalid)`,
    });
  });
  return result;
}
