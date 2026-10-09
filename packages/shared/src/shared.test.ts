import { describe, it, expect } from 'vitest';
import { formatKes } from './money';
import { whatsappLink, buildWhatsAppMessage } from './whatsapp';

describe('formatKes', () => {
  it('formats a plain amount', () => {
    expect(formatKes(1500)).toBe('KES 1,500');
  });

  it('compacts large amounts', () => {
    expect(formatKes(2_500_000, { compact: true })).toBe('KES 2.5M');
    expect(formatKes(45_000, { compact: true })).toBe('KES 45K');
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
