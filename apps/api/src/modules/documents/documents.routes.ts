import { Router } from 'express';
import multer from 'multer';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { invalid, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { uuidField } from '../crm/common';
import {
  documentUploadMeta,
  documentsQuery,
  listDocuments,
  getDocument,
  uploadDocument,
  deleteDocument,
  readDocumentFile,
} from './documents.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.get('/', requirePermission('documents:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const q = documentsQuery.parse(req.query);
    res.json(await listDocuments(a, q));
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:id', requirePermission('documents:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await getDocument(a, uuidField.parse(req.params.id)));
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:id/download', requirePermission('documents:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const row = await readDocumentFile(a, uuidField.parse(req.params.id));
    const { readFile } = await import('../../lib/storage');
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`);
    readFile(row.storageKey).pipe(res);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/', requirePermission('documents:edit'), upload.single('file'), async (req, res, next) => {
  try {
    const a = ctx(req);
    if (!req.file) throw invalid({ file: 'file is required' });
    const meta = parse(documentUploadMeta, {
      name: req.body.name,
      type: req.body.type,
      clientId: req.body.clientId || null,
      propertyId: req.body.propertyId || null,
      ownerId: req.body.ownerId || null,
      dealId: req.body.dealId || null,
    });
    res.status(201).json(await uploadDocument(a, req.file, meta));
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:id', requirePermission('documents:edit'), async (req, res, next) => {
  try {
    const a = ctx(req);
    await deleteDocument(a, uuidField.parse(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
