import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';

const app = createApp();

describe('workspace branding', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('starts with no logo and no brand color', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN');
    const res = await request(app).get('/api/org/branding').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toBeNull();
    expect(res.body.brandColor).toBeNull();
  });

  it('blocks a plain agent from even viewing branding settings (manager+ only)', async () => {
    const { org } = await setupTenant('ORG_ADMIN');
    const { createUser } = await import('./helpers');
    const agent = await createUser(org.id, { role: 'AGENT' });
    const res = await request(app).get('/api/org/branding').set({ Authorization: `Bearer ${agent.token}` });
    expect(res.status).toBe(403);
  });

  it('lets a manager view branding, but only an org admin can change it', async () => {
    const { org } = await setupTenant('ORG_ADMIN');
    const { createUser } = await import('./helpers');
    const manager = await createUser(org.id, { role: 'MANAGER' });
    const managerHeader = { Authorization: `Bearer ${manager.token}` };

    const view = await request(app).get('/api/org/branding').set(managerHeader);
    expect(view.status).toBe(200);

    const edit = await request(app).patch('/api/org/branding').set(managerHeader).send({ brandColor: '#2F5D4E' });
    expect(edit.status).toBe(403);
  });

  it('sets and clears a brand color', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN');

    const set = await request(app).patch('/api/org/branding').set(authHeader).send({ brandColor: '#2F5D4E' });
    expect(set.status).toBe(200);
    expect(set.body.brandColor).toBe('#2F5D4E');

    const clear = await request(app).patch('/api/org/branding').set(authHeader).send({ brandColor: null });
    expect(clear.status).toBe(200);
    expect(clear.body.brandColor).toBeNull();
  });

  it('rejects a brand color that is not a valid hex color', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN');
    const res = await request(app).patch('/api/org/branding').set(authHeader).send({ brandColor: 'not-a-color' });
    expect(res.status).toBe(422);
  });

  it('uploads a logo, serves it publicly by slug, then removes it', async () => {
    const { authHeader, org } = await setupTenant('ORG_ADMIN');

    const upload = await request(app)
      .post('/api/org/logo')
      .set(authHeader)
      .attach('file', Buffer.from('fake png bytes'), { filename: 'logo.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect(upload.body.logoUrl).toBe(`/api/public/organizations/${org.slug}/logo`);

    const served = await request(app).get(upload.body.logoUrl);
    expect(served.status).toBe(200);
    expect(served.text).toBe('fake png bytes');

    const remove = await request(app).delete('/api/org/logo').set(authHeader);
    expect(remove.status).toBe(200);
    expect(remove.body.logoUrl).toBeNull();

    const servedAfterRemoval = await request(app).get(upload.body.logoUrl);
    expect(servedAfterRemoval.status).toBe(404);
  });

  it('rejects a file type that is not an allowed image format', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN');
    const res = await request(app)
      .post('/api/org/logo')
      .set(authHeader)
      .attach('file', Buffer.from('not an image'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(422);
  });

  it('a second logo upload replaces the first, not both existing', async () => {
    const { authHeader, org } = await setupTenant('ORG_ADMIN');

    const first = await request(app)
      .post('/api/org/logo')
      .set(authHeader)
      .attach('file', Buffer.from('logo one'), { filename: 'logo1.png', contentType: 'image/png' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/org/logo')
      .set(authHeader)
      .attach('file', Buffer.from('logo two'), { filename: 'logo2.png', contentType: 'image/png' });
    expect(second.status).toBe(201);

    const served = await request(app).get(`/api/public/organizations/${org.slug}/logo`);
    expect(served.text).toBe('logo two');
  });

  it("does not leak a suspended agency's logo on the public route", async () => {
    const { authHeader, org } = await setupTenant('ORG_ADMIN');
    await request(app)
      .post('/api/org/logo')
      .set(authHeader)
      .attach('file', Buffer.from('a logo'), { filename: 'logo.png', contentType: 'image/png' });

    const { systemDb } = await import('../db/system');
    const { organizations } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    await systemDb.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, org.id));

    const served = await request(app).get(`/api/public/organizations/${org.slug}/logo`);
    expect(served.status).toBe(404);
  });
});
