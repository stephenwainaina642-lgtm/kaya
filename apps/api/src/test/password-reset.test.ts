import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { truncateAll, createOrg, createUser } from './helpers';
import { systemDb } from '../db/system';
import { users, organizations, refreshTokens } from '../db/schema';
import { testOutbox } from '../lib/mailer';

const app = createApp();

function lastToken(): string {
  const mail = testOutbox[testOutbox.length - 1]!;
  return new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
}

describe('password reset', () => {
  beforeEach(async () => {
    await truncateAll();
    testOutbox.length = 0;
  });

  it('emails a reset link, and the new password then works while the old one does not', async () => {
    const org = await createOrg();
    await createUser(org.id, { email: 'agent@test.kaya' });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'Agent@Test.kaya' });
    expect(res.status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]!.to).toBe('agent@test.kaya');

    const reset = await request(app).post('/api/auth/reset-password').send({ token: lastToken(), newPassword: 'Brand!New1234' });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'agent@test.kaya', password: 'Test!Pass1234' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'agent@test.kaya', password: 'Brand!New1234' })).status).toBe(200);
  });

  it('answers identically for an unknown email and sends nothing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.kaya' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(testOutbox).toHaveLength(0);
  });

  it('rejects a reused link, a garbage token, and a weak password', async () => {
    const org = await createOrg();
    await createUser(org.id, { email: 'a@test.kaya' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.kaya' });
    const token = lastToken();
    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'short' })).status).toBe(422);
    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Brand!New1234' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Another!Pass99' })).status).toBe(422);
    expect((await request(app).post('/api/auth/reset-password').send({ token: 'nope', newPassword: 'Another!Pass99' })).status).toBe(422);
  });

  it('invalidates an earlier link when a newer one is requested', async () => {
    const org = await createOrg();
    await createUser(org.id, { email: 'a@test.kaya' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.kaya' });
    const first = lastToken();
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.kaya' });
    expect((await request(app).post('/api/auth/reset-password').send({ token: first, newPassword: 'Brand!New1234' })).status).toBe(422);
    expect((await request(app).post('/api/auth/reset-password').send({ token: lastToken(), newPassword: 'Brand!New1234' })).status).toBe(200);
  });

  it('signs out existing sessions and clears a lockout on success', async () => {
    const org = await createOrg();
    const user = await createUser(org.id, { email: 'a@test.kaya' });
    await request(app).post('/api/auth/login').send({ email: 'a@test.kaya', password: 'Test!Pass1234' });
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: 'a@test.kaya', password: 'wrong' });
    expect((await request(app).post('/api/auth/login').send({ email: 'a@test.kaya', password: 'Test!Pass1234' })).status).toBe(423);

    await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.kaya' });
    await request(app).post('/api/auth/reset-password').send({ token: lastToken(), newPassword: 'Brand!New1234' });
    expect(await systemDb.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id))).toHaveLength(0);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@test.kaya', password: 'Brand!New1234' })).status).toBe(200);
  });

  it('sends no email for a suspended workspace', async () => {
    const org = await createOrg();
    await createUser(org.id, { email: 'a@test.kaya' });
    await systemDb.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, org.id));
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.kaya' });
    expect(testOutbox).toHaveLength(0);
  });
});
