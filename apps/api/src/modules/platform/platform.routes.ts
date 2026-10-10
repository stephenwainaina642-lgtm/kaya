import { Router } from 'express';
import { getPublicShortlist } from '../shortlists/shortlists.service';

/** Unauthenticated, public-facing routes — share links clients open without logging in. */
export const platformRouter = Router();

platformRouter.get('/shortlists/:token', async (req, res) => {
  const data = await getPublicShortlist(req.params.token);
  res.json(data);
});
