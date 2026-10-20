import { Router } from 'express';
import { getPublicShortlist } from '../shortlists/shortlists.service';
import { createPublicViewingRequest, getPortalDocumentFile, signPortalDocument } from '../portal/portal.service';
import { readFile } from '../../lib/storage';

/**
 * Unauthenticated, public-facing routes — share links clients open without
 * logging in. The shortlist share token doubles as the client's whole
 * self-service portal credential: besides the shortlist itself, it's also
 * what lets them request a viewing and e-sign a document, both below.
 */
export const platformRouter = Router();

platformRouter.get('/shortlists/:token', async (req, res, next) => {
  try {
    res.json(await getPublicShortlist(req.params.token));
  } catch (err) {
    next(err);
  }
});

platformRouter.post('/shortlists/:token/viewing-requests', async (req, res, next) => {
  try {
    await createPublicViewingRequest(req.params.token!, req.body);
    res.status(201).end();
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/shortlists/:token/documents/:documentId/file', async (req, res, next) => {
  try {
    const doc = await getPortalDocumentFile(req.params.token!, req.params.documentId!);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
    readFile(doc.storageKey).pipe(res);
  } catch (err) {
    next(err);
  }
});

platformRouter.post('/shortlists/:token/documents/:documentId/sign', async (req, res, next) => {
  try {
    const ip = req.ip ?? null;
    await signPortalDocument(req.params.token!, req.params.documentId!, req.body, ip);
    res.status(201).end();
  } catch (err) {
    next(err);
  }
});
