import { describe, expect, it } from 'vitest';
import { formatKes } from './money';
import { whatsappLink, buildWhatsAppMessage } from './whatsapp';

describe('formatKes', () => {
  it('formats whole numbers with thousands separators', () => {
    expect(formatKes(1234567)).toBe('KES 1,234,567');
  });

  it('compacts large numbers', () => {
    expect(formatKes(2500000, { compact: true })).toBe('KES 2.5M');
    expect(formatKes(15000, { compact: true })).toBe('KES 15K');
  });

  it('shows decimals when requested', () => {
    expect(formatKes(100.5, { decimals: true })).toBe('KES 100.50');
  });
});

describe('whatsappLink', () => {
  it('normalizes a 07... number to 254 format', () => {
    expect(whatsappLink('0712345678')).toBe('https://wa.me/254712345678');
  });

  it('normalizes a +254... number', () => {
    expect(whatsappLink('+254712345678')).toBe('https://wa.me/254712345678');
  });

  it('includes an encoded message when given', () => {
    const link = whatsappLink('0712345678', 'Hello there');
    expect(link).toContain('text=Hello%20there');
  });
});

describe('buildWhatsAppMessage', () => {
  it('builds a property suggestion message', () => {
    const msg = buildWhatsAppMessage({
      kind: 'PROPERTY_SUGGESTION',
      contactName: 'Jane',
      propertyTitle: '3BR Apartment',
      location: 'Kilimani',
      price: 'KES 15,000,000',
      agentName: 'Amina',
    });
    expect(msg).toContain('Jane');
    expect(msg).toContain('3BR Apartment');
    expect(msg).toContain('Amina');
  });

  it('builds a shortlist link message', () => {
    const msg = buildWhatsAppMessage({
      kind: 'SHORTLIST_LINK',
      contactName: 'John',
      url: 'https://kaya.app/s/abc123',
      agentName: 'Brian',
    });
    expect(msg).toContain('https://kaya.app/s/abc123');
  });
});
