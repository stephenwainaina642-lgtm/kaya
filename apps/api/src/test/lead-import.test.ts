import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';
import { normalizePhone } from '../modules/leads/import.service';

const app = createApp();

describe('phone normalisation', () => {
  it('canonicalises Kenyan formats', () => {
    expect(normalizePhone('0712 345 678')).toBe('+254712345678');
    expect(normalizePhone('254712345678')).toBe('+254712345678');
    expect(normalizePhone('712345678')).toBe('+254712345678');
    expect(normalizePhone('+254-712-345-678')).toBe('+254712345678');
  });
});

describe('lead import', () => {
  beforeEach(async () => { await truncateAll(); });

  it('imports valid rows, skips duplicates and reports invalid ones', async () => {
    const t = await setupTenant();
    await request(app).post('/api/leads').set(t.authHeader).send({ fullName: 'Existing', phone: '+254711000001' });
    const res = await request(app).post('/api/leads/import').set(t.authHeader).send({
      rows: [
        { fullName: 'Amina Yusuf', phone: '0722 000 002', source: 'whatsapp', temperature: 'hot', tags: 'vip; kilimani' },
        { fullName: 'Same File Dup', phone: '+254722000002' },
        { fullName: 'Already There', phone: '0711000001' },
        { fullName: '', phone: '0733000003' },
        { fullName: 'No Phone', phone: '' },
        { fullName: 'Bad Email', phone: '0744000004', email: 'nope' },
        { fullName: 'Odd Enums', phone: '0755000005', source: 'carrier pigeon', leadType: 'landlord' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.duplicates).toBe(2);
    expect(res.body.invalid.map((i: any) => i.row)).toEqual([4, 5, 6]);

    const list = await request(app).get('/api/leads').set(t.authHeader);
    expect(list.body.total).toBe(3);
    const amina = list.body.items.find((l: any) => l.fullName === 'Amina Yusuf');
    expect(amina).toMatchObject({ phone: '+254722000002', source: 'WHATSAPP', temperature: 'HOT' });
    const odd = list.body.items.find((l: any) => l.fullName === 'Odd Enums');
    expect(odd).toMatchObject({ source: 'OTHER', leadType: 'LANDLORD' });
  });

  it('is tenant-isolated, bounded and permission-checked', async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await request(app).post('/api/leads/import').set(a.authHeader).send({ rows: [{ fullName: 'Shared Number', phone: '0788000008' }] });
    const other = await request(app).post('/api/leads/import').set(b.authHeader).send({ rows: [{ fullName: 'Shared Number', phone: '0788000008' }] });
    expect(other.body.created).toBe(1);
    const tooMany = await request(app).post('/api/leads/import').set(a.authHeader)
      .send({ rows: Array.from({ length: 501 }, (_, i) => ({ fullName: `n${i}`, phone: `07000${String(i).padStart(5, '0')}` })) });
    expect(tooMany.status).toBe(422);
    expect((await request(app).post('/api/leads/import').send({ rows: [] })).status).toBe(401);
  });
});
