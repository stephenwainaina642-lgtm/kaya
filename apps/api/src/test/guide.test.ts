import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, createUser, truncateAll } from './helpers';
import { GUIDE_AREAS, guideAreasFor, keywordGuide } from '@kaya/shared';
import { cleanLinks } from '../modules/guide/guide.service';

const app = createApp();

describe('guide catalogue', () => {
  it('only offers places the person can open', () => {
    const titles = (role: Parameters<typeof guideAreasFor>[0], plan: Parameters<typeof guideAreasFor>[1]) => guideAreasFor(role, plan, null).map((a) => a.title);
    expect(titles('CARETAKER', 'PRO')).toEqual(['Maintenance']);
    expect(titles('AGENT', 'PRO')).not.toContain('Rent'); // rent is manager-only
    expect(titles('MANAGER', 'STARTER')).not.toContain('Deals'); // plan-gated
    expect(titles('MANAGER', 'GROWTH')).toEqual(expect.arrayContaining(['Rent', 'Deals', 'Buildings']));
    expect(new Set(GUIDE_AREAS.map((a) => a.to)).size).toBe(GUIDE_AREAS.length);
  });

  it('every area points at a real page in the app', async () => {
    const { readFileSync } = await import('node:fs');
    const app_ = readFileSync(new URL('../../../web/src/App.tsx', import.meta.url), 'utf8');
    for (const a of GUIDE_AREAS) {
      if (a.to === '/') continue;
      expect(app_, a.to).toContain(`path="${a.to.slice(1)}"`);
    }
  });

  it('keyword guide finds the right area and admits when it does not know', () => {
    const areas = guideAreasFor('ORG_ADMIN', 'PRO', null);
    expect(keywordGuide('how do I advertise a property', areas).links[0]!.to).toBe('/properties');
    expect(keywordGuide('my tenant has not paid rent', areas).links[0]!.to).toBe('/rent');
    expect(keywordGuide('i have a big apartment block with many units', areas).links.map((l) => l.to)).toContain('/buildings');
    const none = keywordGuide('zxqv blorp', areas);
    expect(none.links).toEqual([]);
    expect(none.ai).toBe(false);
  });

  it('drops invented or forbidden paths from model output', () => {
    const allowed = guideAreasFor('AGENT', 'GROWTH', null);
    const links = cleanLinks(['/properties', '/rent', '/made-up', '/properties', '/leads', '/clients', '/tasks'], allowed);
    expect(links.map((l) => l.to)).toEqual(['/properties', '/leads', '/clients']);
    expect(cleanLinks('nope', allowed)).toEqual([]);
  });
});

describe('POST /api/guide/ask', () => {
  beforeEach(truncateAll);

  it('answers without an AI key from the built-in guide, scoped to the user\'s role', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const res = await request(app).post('/api/guide/ask').set(t.authHeader).send({ question: 'How do I collect rent from tenants?' });
    expect(res.status).toBe(200);
    expect(res.body.ai).toBe(false);
    expect(res.body.links[0].to).toBe('/rent');

    const care = await createUser(t.org.id, { role: 'CARETAKER' });
    const c = await request(app).post('/api/guide/ask').set({ Authorization: `Bearer ${care.token}` }).send({ question: 'How do I collect rent from tenants?' });
    expect(c.status).toBe(200);
    expect(c.body.links.map((l: { to: string }) => l.to)).not.toContain('/rent');
  });

  it('needs a login and a real question', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    expect((await request(app).post('/api/guide/ask').send({ question: 'hello there' })).status).toBe(401);
    expect((await request(app).post('/api/guide/ask').set(t.authHeader).send({ question: 'a' })).status).toBe(422);
    expect((await request(app).post('/api/guide/ask').set(t.authHeader).send({ question: 'x'.repeat(400) })).status).toBe(422);
  });
});
