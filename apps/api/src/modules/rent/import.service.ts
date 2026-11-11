import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import type { LeaseImportResult } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { clients, leases, properties } from '../../db/schema';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth } from '../crm/common';
import { normalizePhone } from '../leads/import.service';

export const LEASE_IMPORT_MAX_ROWS = 200;

const rawRow = z.object({
  property: z.string().optional(),
  tenantName: z.string().optional(),
  tenantPhone: z.string().optional(),
  tenantEmail: z.string().optional(),
  rent: z.string().optional(),
  deposit: z.string().optional(),
  dueDay: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  feePercent: z.string().optional(),
});
const importInput = z.object({ rows: z.array(rawRow).min(1).max(LEASE_IMPORT_MAX_ROWS) });

/** "KES 85,000" -> 85000. Returns null for anything that is not a whole, non-negative amount. */
export function parseMoney(raw: string | undefined): number | null {
  const cleaned = (raw ?? '').replace(/kes|ksh|\/=|[,\s]/gi, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned));
}

/** Accepts 2026-03-01, 01/03/2026 and 1-3-2026 (day first, as written in Kenya). */
export function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Brings existing tenancies into Kaya from a spreadsheet. Properties are
 * matched by title and must already exist (they carry the landlord), tenants
 * by phone number and are added as clients when new. A property that already
 * has an active lease is left alone, so running the same file twice is safe.
 */
export async function importLeases(a: Auth, body: unknown): Promise<LeaseImportResult> {
  const { rows } = parse(importInput, body);
  const result: LeaseImportResult = { created: 0, tenantsCreated: 0, skipped: 0, invalid: [] };

  return withTenant(a.organizationId, async (tx) => {
    const props = await tx.select({ id: properties.id, title: properties.title }).from(properties);
    const byTitle = new Map<string, string[]>();
    for (const p of props) {
      const k = p.title.trim().toLowerCase();
      byTitle.set(k, [...(byTitle.get(k) ?? []), p.id]);
    }
    const activeRows = await tx.select({ propertyId: leases.propertyId }).from(leases).where(eq(leases.status, 'ACTIVE'));
    const leased = new Set(activeRows.map((l) => l.propertyId));

    const phones = rows.map((r) => normalizePhone(r.tenantPhone ?? '')).filter((p) => /^\+?\d{7,}$/.test(p));
    const known = phones.length ? await tx.select({ id: clients.id, phone: clients.phone }).from(clients).where(inArray(clients.phone, phones)) : [];
    const clientByPhone = new Map(known.map((c) => [c.phone, c.id]));

    const toInsert: (typeof leases.$inferInsert)[] = [];
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      const bad = (reason: string) => void result.invalid.push({ row: line, reason });

      const ids = byTitle.get((r.property ?? '').trim().toLowerCase());
      if (!r.property?.trim()) { bad('Missing property'); continue; }
      if (!ids) { bad(`No property called "${r.property.trim()}". Add the property first (it holds the landlord).`); continue; }
      if (ids.length > 1) { bad(`More than one property is called "${r.property.trim()}"`); continue; }
      const propertyId = ids[0]!;

      const name = (r.tenantName ?? '').trim();
      const phone = normalizePhone(r.tenantPhone ?? '');
      if (!name) { bad('Missing tenant name'); continue; }
      if (!/^\+?\d{7,20}$/.test(phone)) { bad('Missing or invalid tenant phone'); continue; }
      const email = (r.tenantEmail ?? '').trim();
      if (email && !z.string().email().safeParse(email).success) { bad('Invalid tenant email'); continue; }

      const rent = parseMoney(r.rent);
      if (!rent || rent < 1) { bad('Missing or invalid rent'); continue; }
      const deposit = r.deposit?.trim() ? parseMoney(r.deposit) : 0;
      if (deposit === null) { bad('Invalid deposit'); continue; }
      const dueDay = r.dueDay?.trim() ? Number(r.dueDay.trim()) : 1;
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) { bad('Rent due day must be 1 to 28'); continue; }
      const startDate = parseDate(r.startDate);
      if (!startDate) { bad('Missing or invalid start date (use DD/MM/YYYY or YYYY-MM-DD)'); continue; }
      const endDate = r.endDate?.trim() ? parseDate(r.endDate) : null;
      if (r.endDate?.trim() && !endDate) { bad('Invalid end date'); continue; }
      if (endDate && endDate <= startDate) { bad('End date must be after the start date'); continue; }
      const fee = r.feePercent?.trim() ? Number(r.feePercent.replace('%', '').trim()) : 0;
      if (!Number.isFinite(fee) || fee < 0 || fee > 50) { bad('Management fee must be between 0 and 50 percent'); continue; }

      if (leased.has(propertyId)) { result.skipped++; continue; }
      leased.add(propertyId);

      let tenantId = clientByPhone.get(phone);
      if (!tenantId) {
        const [c] = await tx.insert(clients).values({
          organizationId: a.organizationId, fullName: name, phone, email: email || null, leadType: 'TENANT',
          assignedAgentId: a.userId, createdById: a.userId, updatedById: a.userId,
        }).returning({ id: clients.id });
        tenantId = c!.id;
        clientByPhone.set(phone, tenantId);
        result.tenantsCreated++;
      }
      toInsert.push({
        organizationId: a.organizationId, propertyId, tenantId, rentAmount: rent, depositAmount: deposit, dueDay,
        startDate, endDate, feeBps: Math.round(fee * 100),
      });
    }

    if (toInsert.length) {
      await tx.insert(leases).values(toInsert);
      await tx.update(properties).set({ status: 'LET' })
        .where(and(inArray(properties.id, toInsert.map((l) => l.propertyId)), inArray(properties.status, ['AVAILABLE', 'UNDER_OFFER'])));
    }
    result.created = toInsert.length;
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'lease', entityId: a.organizationId,
      summary: `Imported ${toInsert.length} leases from CSV (${result.skipped} skipped, ${result.invalid.length} invalid)`,
    });
    return result;
  });
}
