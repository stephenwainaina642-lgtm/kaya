import { describe, it, expect } from 'vitest';
import { effectiveDealValue, calculateCommission } from './property';

describe('effectiveDealValue', () => {
  it('prefers finalPrice, then offerPrice, then dealValue', () => {
    expect(effectiveDealValue({ finalPrice: 100, offerPrice: 90, dealValue: 80 })).toBe(100);
    expect(effectiveDealValue({ finalPrice: null, offerPrice: 90, dealValue: 80 })).toBe(90);
    expect(effectiveDealValue({ finalPrice: null, offerPrice: null, dealValue: 80 })).toBe(80);
  });
});

describe('calculateCommission', () => {
  it('rounds to the nearest cent', () => {
    expect(calculateCommission(1_000_000, 2.5)).toBe(25000);
    expect(calculateCommission(333_333, 8.33)).toBeCloseTo(27766.64, 2);
  });
});
