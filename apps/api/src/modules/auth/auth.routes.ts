import { Router } from 'express';
import { login, refresh, logout, me, updateProfile, changePassword } from './auth.service';
import { authenticate, ctx } from '../../middleware/auth';

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

authRouter.post('/login', async (req, res, next) => {
  try {
    const result = await login(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
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
