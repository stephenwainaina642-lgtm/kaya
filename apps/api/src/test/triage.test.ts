import { describe, it, expect } from 'vitest';
import { mergeTriage, triageReport } from '../modules/maintenance/triage';

describe('repair triage merge', () => {
  it('falls back to the tenant\'s own choices when the AI is unavailable', async () => {
    expect(await triageReport('water everywhere')).toBeNull(); // no key in tests
    expect(mergeTriage({ category: 'OTHER', urgent: false }, null)).toEqual({ category: 'OTHER', priority: 'MEDIUM', summary: '', aiUsed: false });
    expect(mergeTriage({ category: 'PLUMBING', urgent: true }, null).priority).toBe('URGENT');
  });

  it('fills in a missing category and raises urgency, but never overrides the tenant', () => {
    const r = mergeTriage({ category: 'OTHER', urgent: false }, { category: 'PLUMBING', priority: 'URGENT', summary: 'Burst pipe flooding kitchen' });
    expect(r).toEqual({ category: 'PLUMBING', priority: 'URGENT', summary: 'Burst pipe flooding kitchen', aiUsed: true });
    // Tenant picked a category: kept.
    expect(mergeTriage({ category: 'ELECTRICAL', urgent: false }, { category: 'PLUMBING', priority: 'MEDIUM' }).category).toBe('ELECTRICAL');
    // AI cannot lower an urgent flag.
    expect(mergeTriage({ category: 'OTHER', urgent: true }, { category: 'PAINTING', priority: 'LOW' }).priority).toBe('URGENT');
  });

  it('ignores anything outside the allowed lists and bounds the summary', () => {
    const r = mergeTriage({ category: 'OTHER', urgent: false }, { category: 'DROP TABLE', priority: 'APOCALYPSE', summary: `  ${'x'.repeat(300)}\n\n ` });
    expect(r.category).toBe('OTHER');
    expect(r.priority).toBe('MEDIUM');
    expect(r.summary).toHaveLength(80);
  });
});
