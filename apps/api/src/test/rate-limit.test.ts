import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLoginLimiter } from '../middleware/rateLimit';

describe('login rate limiting', () => {
  it('returns 429 once a single IP exceeds the configured attempt limit', async () => {
    // A throwaway instance with its own low limit — isolated from the real
    // login routers' limiters (and their counters, shared across whatever
    // other tests exercise /api/auth/login and /api/platform/auth/login),
    // so this only tests the mechanism itself.
    const app = express();
    app.post('/login', createLoginLimiter({ limit: 3 }), (_req, res) => res.status(401).json({ ok: false }));

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/login');
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});
