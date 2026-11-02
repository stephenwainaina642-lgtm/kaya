import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { eq } from 'drizzle-orm';
import { truncateAll, setupTenant, createUser } from './helpers';
import { systemDb } from '../db/system';
import { auditLogs } from '../db/schema';
import { toCsv } from '../lib/csv';

const app = createApp();

describe('csv writer', () => {
  it('quotes commas/quotes/newlines and neutralises spreadsheet formulas', () => {
    const out = toCsv(['a', 'b'], [{ a: 'x, "y"', b: '=HYPERLINK("evil")' }, { a: 'line1\nline2', b: ['t1', 't2'] }]);
    expect(out).toContain('"x, ""y"""');
    expect(out).toContain(`'=HYPERLINK`);
    expect(out).toContain('"line1\nline2"');
    expect(out).toContain('t1; t2');
    expect(out.startsWith('﻿')).toBe(true);
  });
});

describe('data export', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('exports only the caller\'s agency, as CSV, and leaves an audit trail', async () => {
    const mine = await setupTenant();
    const other = await setupTenant();
    await request(app).post('/api/leads').set(mine.authHeader).send({ fullName: 'Mine, Lead', phone: '+254700000001', source: 'WEBSITE' });
    await request(app).post('/api/leads').set(other.authHeader).send({ fullName: 'Someone Elses', phone: '+254700000002', source: 'WEBSITE' });

    const res = await request(app).get('/api/export/leads').set(mine.authHeader);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/kaya-leads-\d{4}-\d{2}-\d{2}\.csv/);
    expect(res.text).toContain('"Mine, Lead"');
    expect(res.text).not.toContain('Someone Elses');
    expect(res.text).not.toContain('organizationId');

    const entries = await systemDb.select().from(auditLogs).where(eq(auditLogs.organizationId, mine.org.id));
    const exports = entries.filter((e) => e.action === 'EXPORT');
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ entityType: 'leads', actorId: mine.user.id });
  });

  it('is limited to org admins and known entities', async () => {
    const { org, authHeader } = await setupTenant();
    const manager = await createUser(org.id, { role: 'MANAGER' });
    expect((await request(app).get('/api/export/leads').set({ Authorization: `Bearer ${manager.token}` })).status).toBe(403);
    expect((await request(app).get('/api/export/leads')).status).toBe(401);
    expect((await request(app).get('/api/export/passwords').set(authHeader)).status).toBe(404);
    for (const e of ['clients', 'owners', 'properties']) {
      expect((await request(app).get(`/api/export/${e}`).set(authHeader)).status).toBe(200);
    }
  });
});
