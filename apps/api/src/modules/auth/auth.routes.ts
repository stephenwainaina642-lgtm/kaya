import { Router } from 'express';
import { login, refresh, logout, me, updateProfile, changePassword, register, requestPasswordReset, resetPassword } from './auth.service';
import { authenticate, ctx } from '../../middleware/auth';
import { createLoginLimiter } from '../../middleware/rateLimit';

const loginLimiter = createLoginLimiter();
// Tighter than login: a leaked/scraped signup endpoint creating whole new
// organizations is a more expensive abuse case than a login guess.
const signupLimiter = createLoginLimiter({
  limit: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many signup attempts. Try again later.' } },
});

// Each forgot request sends an email, so cap them per IP.
const resetLimiter = createLoginLimiter({
  limit: 10,
  skip: () => process.env.NODE_ENV === 'test', // the suite makes many calls from one IP
  message: { error: { code: 'RATE_LIMITED', message: 'Too many reset attempts. Try again later.' } },
});

export const authRouter = Router();

const COOKIE_NAME = 'kaya_refresh';
const COOKIE_PATH = '/api/auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  });
}

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const result = await login(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/register', signupLimiter, async (req, res, next) => {
  try {
    const result = await register(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const result = await refresh(req.cookies?.[COOKIE_NAME]);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await logout(req.auth?.organizationId, req.cookies?.[COOKIE_NAME]);
    res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await me(a.organizationId, a.userId));
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await updateProfile(a.organizationId, a.userId, req.body));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const a = ctx(req);
    await changePassword(a.organizationId, a.userId, req.body);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    await requestPasswordReset(req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    await resetPassword(req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
