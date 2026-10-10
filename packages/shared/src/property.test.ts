import { describe, expect, it } from 'vitest';
import { effectiveDealValue, calculateCommission } from './property';

describe('effectiveDealValue', () => {
  it('prefers finalPrice over offerPrice and dealValue', () => {
    expect(effectiveDealValue({ finalPrice: 100, offerPrice: 90, dealValue: 80 })).toBe(100);
  });

  it('falls back to offerPrice when finalPrice is absent', () => {
    expect(effectiveDealValue({ finalPrice: null, offerPrice: 90, dealValue: 80 })).toBe(90);
  });

  it('falls back to dealValue when both are absent', () => {
    expect(effectiveDealValue({ finalPrice: null, offerPrice: null, dealValue: 80 })).toBe(80);
  });
});

describe('calculateCommission', () => {
  it('rounds to the nearest cent', () => {
    expect(calculateCommission(10000000, 2.5)).toBe(250000);
    expect(calculateCommission(333333, 8.33)).toBeCloseTo(27766.64, 1);
  });
});
