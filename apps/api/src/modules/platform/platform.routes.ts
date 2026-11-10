import { Router } from 'express';
import { getPublicShortlist } from '../shortlists/shortlists.service';
import { createPublicViewingRequest, getPortalDocumentFile, signPortalDocument } from '../portal/portal.service';
import { getPortal, getTenantPortal } from '../rent/portal.service';
import { portalLimiter, repairReportLimiter } from '../../middleware/rateLimit';
import { submitRepairReport } from '../maintenance/public-report.service';
import { submitClaim } from '../rent/claims.service';
import { startTenantPayment, getTenantPaymentStatus, handleRentCallback } from '../rent/mpesa-pay.service';
import { servePhoto } from '../properties/photos.service';
import { getPublicListings, getPublicListing } from '../properties/listings.service';
import { getPublicOrgInfo, submitPublicInquiry } from '../leads/public-inquiry.service';
import { getLogoStorageKeyBySlug } from '../org-settings/org-settings.service';
import { sendFile } from '../../lib/storage';
import { notFound } from '../../lib/errors';

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
    await sendFile(doc.storageKey, res);
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

platformRouter.get('/photos/:id', async (req, res, next) => {
  try { await servePhoto(req.params.id!, res); } catch (err) { next(err); }
});

platformRouter.get('/listings/:slug', async (req, res, next) => {
  try { res.json(await getPublicListings(req.params.slug!)); } catch (err) { next(err); }
});

platformRouter.get('/listings/:slug/:id', async (req, res, next) => {
  try { res.json(await getPublicListing(req.params.slug!, req.params.id!)); } catch (err) { next(err); }
});

// An agency's own public "contact us" page — see modules/leads/public-inquiry.service.ts.
platformRouter.get('/organizations/:slug', async (req, res, next) => {
  try {
    res.json(await getPublicOrgInfo(req.params.slug!));
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/organizations/:slug/logo', async (req, res, next) => {
  try {
    const storageKey = await getLogoStorageKeyBySlug(req.params.slug!);
    if (!storageKey) throw notFound('Logo');
    // No stored mime type for logos (unlike documents) — fine here since
    // the browser sniffs image content-type reliably, and upload already
    // restricted this file to a handful of known image types.
    await sendFile(storageKey, res);
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/tenant-portal/:token', portalLimiter, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantPortal(req.params.token!));
  } catch (err) {
    next(err);
  }
});

platformRouter.post('/tenant-portal/:token/pay', portalLimiter, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(await startTenantPayment(req.params.token!, req.body));
  } catch (err) { next(err); }
});

platformRouter.get('/tenant-portal/:token/pay/:id', portalLimiter, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantPaymentStatus(req.params.token!, req.params.id!));
  } catch (err) { next(err); }
});

// Safaricom's result for a rent prompt. Always acknowledged so they don't retry; problems are logged, not leaked.
platformRouter.post('/mpesa/rent/:secret', async (req, res) => {
  try { await handleRentCallback(req.params.secret ?? '', req.body); } catch (err) { console.error('[rent-mpesa] callback failed', err); }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

platformRouter.post('/tenant-portal/:token/claims', portalLimiter, async (req, res, next) => {
  try {
    await submitClaim(req.params.token!, req.body);
    res.status(201).end();
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/portal/:token', portalLimiter, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getPortal(req.params.token!, req.query.period as string | undefined));
  } catch (err) {
    next(err);
  }
});

platformRouter.post('/organizations/:slug/repair-reports', repairReportLimiter, async (req, res, next) => {
  try {
    await submitRepairReport(req.params.slug!, req.body, req.ip ?? null);
    res.status(201).end();
  } catch (err) {
    next(err);
  }
});

platformRouter.post('/organizations/:slug/inquiries', async (req, res, next) => {
  try {
    const ip = req.ip ?? null;
    await submitPublicInquiry(req.params.slug!, req.body, ip);
    res.status(201).end();
  } catch (err) {
    next(err);
  }
});
