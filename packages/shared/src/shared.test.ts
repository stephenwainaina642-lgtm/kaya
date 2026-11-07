import { describe, it, expect } from 'vitest';
import { formatKes, formatMoney } from './money';
import { whatsappLink, buildWhatsAppMessage } from './whatsapp';
import { periodLabel, rentReminderMessage } from './rent';

describe('formatKes', () => {
  it('formats a plain amount', () => {
    expect(formatKes(1500)).toBe('KES 1,500');
  });

  it('compacts large amounts', () => {
    expect(formatKes(2_500_000, { compact: true })).toBe('KES 2.5M');
    expect(formatKes(45_000, { compact: true })).toBe('KES 45K');
  });
});

describe('formatMoney', () => {
  it('defaults to KES', () => {
    expect(formatMoney(1500)).toBe('KES 1,500');
  });

  it('formats in another currency', () => {
    expect(formatMoney(1500, 'USD')).toBe('USD 1,500');
  });

  it('compacts large amounts in another currency', () => {
    expect(formatMoney(2_500_000, 'EUR', { compact: true })).toBe('EUR 2.5M');
  });
});

describe('whatsappLink', () => {
  it('normalizes a 07xx number to 254', () => {
    expect(whatsappLink('0712345678')).toBe('https://wa.me/254712345678');
  });

  it('keeps a +254 number', () => {
    expect(whatsappLink('+254712345678')).toBe('https://wa.me/254712345678');
  });

  it('appends an encoded message', () => {
    const link = whatsappLink('0712345678', 'Hello there');
    expect(link).toBe('https://wa.me/254712345678?text=Hello%20there');
  });
});

describe('buildWhatsAppMessage', () => {
  it('builds a property suggestion message', () => {
    const msg = buildWhatsAppMessage({
      kind: 'PROPERTY_SUGGESTION',
      contactName: 'Amina',
      propertyTitle: '3BR Apartment, Kilimani',
      propertyPrice: 'KES 15M',
      propertyLocation: 'Kilimani',
      agentName: 'Brian',
    });
    expect(msg).toContain('Amina');
    expect(msg).toContain('3BR Apartment, Kilimani');
    expect(msg).toContain('Brian');
  });

  it('builds a shortlist link message', () => {
    const msg = buildWhatsAppMessage({
      kind: 'SHORTLIST_LINK',
      contactName: 'Dennis',
      shortlistUrl: 'https://kaya.app/s/abc123',
      agentName: 'Faith',
    });
    expect(msg).toContain('Dennis');
    expect(msg).toContain('https://kaya.app/s/abc123');
  });
});

describe('rent reminders', () => {
  const base = { tenantName: 'Tenant Tom Mwangi', propertyTitle: 'Kilimani 2BR', period: '2026-03', dueDate: '2026-03-05', balance: 50000, daysOverdue: 10, agencyName: 'Savanna Ridge Realty' };
  it('formats the month and greets by first name', () => {
    expect(periodLabel('2026-03')).toBe('March 2026');
    const m = rentReminderMessage(base);
    expect(m).toContain('Hello Tenant,');
    expect(m).toContain('KES 50,000');
    expect(m).toContain('March 2026 rent, due 2026-03-05');
    expect(m).toContain('friendly reminder');
    expect(m.endsWith('Savanna Ridge Realty')).toBe(true);
  });
  it('is firmer past 30 days but makes no threats', () => {
    const m = rentReminderMessage({ ...base, daysOverdue: 45 });
    expect(m).toContain('45 days overdue');
    expect(m).not.toMatch(/evict|legal|court|police/i);
  });
  it('survives a blank name', () => {
    expect(rentReminderMessage({ ...base, tenantName: '  ' })).toContain('Hello there,');
  });
});
