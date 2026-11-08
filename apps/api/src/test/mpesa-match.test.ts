import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll, createUser } from './helpers';
import { parseMpesa, matchTransactions, phonesAgree } from '../modules/rent/mpesa-match.service';

const app = createApp();

const SMS = `QJK1ABC2XY Confirmed. Ksh85,000.00 received from AMINA YUSUF 0722 000 000 on 5/3/26 at 10:15 AM. New Account balance is Ksh90,000.00.
QJK1ABC3ZZ Confirmed. Ksh2,000.00 sent to JOHN SHOP 0700111222 on 5/3/26 at 11:00 AM.
QJK1ABC4AA Confirmed. You have received Ksh 40,000.00 from BRIAN OTIENO 254733***111 on 6/3/26 at 2:30 PM Account Number FLAT2 New Utility balance is Ksh1,000.00`;

describe('M-Pesa parsing', () => {
  it('reads received payments from SMS text and ignores money sent out', () => {
    const tx = parseMpesa(SMS);
    expect(tx.map((t) => t.code)).toEqual(['QJK1ABC2XY', 'QJK1ABC4AA']);
    expect(tx[0]).toMatchObject({ amount: 85_000, name: 'AMINA YUSUF', phone: '0722000000', paidAt: '2026-03-05T07:15:00.000Z' });
    expect(tx[1]).toMatchObject({ amount: 40_000, name: 'BRIAN OTIENO', phone: '254733***111', paidAt: '2026-03-06T11:30:00.000Z' });
  });

  it('reads an M-Pesa statement CSV and repeated codes only once', () => {
    const csv = 'Receipt No.,Completion Time,Details,Paid In,Withdrawn,Balance\r\nQAB1CDE2FG,2026-03-05 10:15:00,Funds received from - 254722000000 AMINA YUSUF,"85,000.00",,90000\r\nQAB1CDE2FG,2026-03-05 10:15:00,Funds received from - 254722000000 AMINA YUSUF,"85,000.00",,90000\r\nQAB1CDE3HI,2026-03-05 11:00:00,Pay Bill to 123,,2000,88000\r\n';
    const tx = parseMpesa(csv);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ code: 'QAB1CDE2FG', amount: 85_000, phone: '254722000000' });
  });

  it('compares phone numbers across formats and masks', () => {
    expect(phonesAgree('0722000000', '+254722000000')).toBe(true);
    expect(phonesAgree('254733***111', '0733222112')).toBe(false);
    expect(phonesAgree('254733***111', '0733222111')).toBe(true);
    expect(phonesAgree('0722000000', '0722000001')).toBe(false);
  });
});

describe('matching', () => {
  const charges = [
    { chargeId: 'c1', leaseId: 'l1', period: '2026-02', balance: 20_000, tenantName: 'Amina Yusuf', tenantPhone: '+254722000000', propertyTitle: 'A' },
    { chargeId: 'c2', leaseId: 'l1', period: '2026-03', balance: 85_000, tenantName: 'Amina Yusuf', tenantPhone: '+254722000000', propertyTitle: 'A' },
    { chargeId: 'c3', leaseId: 'l2', period: '2026-03', balance: 40_000, tenantName: 'Brian Otieno', tenantPhone: '+254733000111', propertyTitle: 'B' },
  ];

  it('puts a payment on the oldest open month, caps it, and rolls on to the next month', () => {
    const r = matchTransactions(parseMpesa(SMS), charges, new Set());
    expect(r.matches[0]).toMatchObject({ chargeId: 'c1', applyAmount: 20_000, leftover: 65_000, confidence: 'HIGH' });
    expect(r.matches[1]).toMatchObject({ chargeId: 'c3', applyAmount: 40_000, leftover: 0, confidence: 'HIGH' });
  });

  it('flags known codes, unknown payers and ambiguous names', () => {
    const tx = [
      { code: 'QDUP000001', amount: 1000, name: 'X', phone: '', paidAt: null },
      { code: 'QNEW000002', amount: 1000, name: 'Nobody Here', phone: '0799999999', paidAt: null },
      { code: 'QNAM000003', amount: 5000, name: 'Brian Otieno', phone: '', paidAt: null },
    ];
    const r = matchTransactions(tx, charges, new Set(['QDUP000001']));
    expect(r.duplicates).toHaveLength(1);
    expect(r.unmatched[0]!.reason).toContain('No tenant');
    expect(r.matches[0]).toMatchObject({ chargeId: 'c3', confidence: 'MEDIUM' });
  });
});

describe('M-Pesa matching API', () => {
  beforeEach(truncateAll);

  it('matches pasted messages to rent charges and records only what is confirmed, once', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace', phone: '+254711000001' })).body;
    const prop = (await request(app).post('/api/properties').set(h).send({
      reference: 'PRP-1', title: 'Kilimani 2BR', listingType: 'RENT', propertyType: 'APARTMENT', price: 85_000, location: 'Kilimani', bedrooms: 2, bathrooms: 2, ownerId: owner.id,
    })).body;
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Amina Yusuf', phone: '+254722000000' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: prop.id, tenantId: tenant.id, rentAmount: 85_000, dueDay: 5, startDate: '2026-01-01' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });

    const text = 'QJK1ABC2XY Confirmed. Ksh85,000.00 received from AMINA YUSUF 0722 000 000 on 5/3/26 at 10:15 AM.';
    const m = await request(app).post('/api/rent/mpesa/match').set(h).send({ text });
    expect(m.status).toBe(200);
    expect(m.body.matches).toHaveLength(1);
    expect(m.body.matches[0]).toMatchObject({ code: 'QJK1ABC2XY', tenantName: 'Amina Yusuf', period: '2026-03', applyAmount: 85_000, confidence: 'HIGH' });

    const item = m.body.matches[0];
    const apply = await request(app).post('/api/rent/mpesa/apply').set(h).send({ items: [{ code: item.code, chargeId: item.chargeId, amount: item.applyAmount, paidAt: item.paidAt }] });
    expect(apply.body).toEqual({ recorded: 1, failed: [] });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    expect(charge).toMatchObject({ paidAmount: 85_000, status: 'PAID' });

    // Same messages again: recognised as already recorded; a stale apply is refused, not double counted.
    const again = await request(app).post('/api/rent/mpesa/match').set(h).send({ text });
    expect(again.body.matches).toHaveLength(0);
    expect(again.body.duplicates).toHaveLength(1);
    const stale = await request(app).post('/api/rent/mpesa/apply').set(h).send({ items: [{ code: item.code, chargeId: item.chargeId, amount: 85_000 }] });
    expect(stale.body.recorded).toBe(0);
    expect(stale.body.failed).toHaveLength(1);

    expect((await request(app).post('/api/rent/mpesa/match').set(h).send({ text: 'hello there' })).status).toBe(422);
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post('/api/rent/mpesa/match').set({ Authorization: `Bearer ${agent.token}` }).send({ text })).status).toBe(403);
  });
});
