import { importProperties } from './import.service';
import { Router } from 'express';
import multer from 'multer';
import { addPhotos, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD } from './photos.service';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import {
  listProperties, getProperty, createProperty, updateProperty, deleteProperty,
  addImage, removeImage, addFeature, removeFeature,
} from './properties.service';

import { createBulkUnits, listBuildings, getBuilding, getPropertyNetwork, setAdvertised, setBuildingAdvertised } from './estate.service';

export const propertiesRouter = Router();
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD } });
propertiesRouter.use(authenticate);

propertiesRouter.get('/', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await listProperties(ctx(req), req.query)); } catch (err) { next(err); }
});

propertiesRouter.post('/', requirePermission('properties:create'), async (req, res, next) => {
  try { res.status(201).json(await createProperty(ctx(req), req.body)); } catch (err) { next(err); }
});

propertiesRouter.post('/import', requirePermission('properties:create'), async (req, res, next) => {
  try { res.status(201).json(await importProperties(ctx(req), req.body)); } catch (err) { next(err); }
});

propertiesRouter.post('/bulk', requirePermission('properties:create'), async (req, res, next) => {
  try { res.status(201).json(await createBulkUnits(ctx(req), req.body)); } catch (err) { next(err); }
});

propertiesRouter.post('/buildings/:name/photos', requirePermission('properties:edit'), photoUpload.array('files', MAX_PHOTOS_PER_UPLOAD), async (req, res, next) => {
  try {
    const a = ctx(req);
    const building = await getBuilding(a, req.params.name!);
    const only = typeof req.body?.unitIds === 'string' && req.body.unitIds ? new Set(String(req.body.unitIds).split(',')) : null;
    const ids = building.unitList.filter((u) => !only || only.has(u.id)).map((u) => u.id);
    res.json(await addPhotos(a, ids, (req.files as Express.Multer.File[]) ?? []));
  } catch (err) { next(err); }
});

propertiesRouter.post('/:id/photos', requirePermission('properties:edit'), photoUpload.array('files', MAX_PHOTOS_PER_UPLOAD), async (req, res, next) => {
  try {
    const a = ctx(req);
    await addPhotos(a, [req.params.id!], (req.files as Express.Multer.File[]) ?? []);
    res.json(await getProperty(a, req.params.id!));
  } catch (err) { next(err); }
});

propertiesRouter.get('/buildings', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await listBuildings(ctx(req))); } catch (err) { next(err); }
});

propertiesRouter.get('/buildings/:name', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await getBuilding(ctx(req), req.params.name!)); } catch (err) { next(err); }
});

propertiesRouter.post('/buildings/:name/advertise', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await setBuildingAdvertised(ctx(req), req.params.name!, req.body?.advertised !== false)); } catch (err) { next(err); }
});

propertiesRouter.get('/:id/network', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await getPropertyNetwork(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

propertiesRouter.post('/:id/advertise', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await setAdvertised(ctx(req), req.params.id!, req.body?.advertised !== false)); } catch (err) { next(err); }
});

propertiesRouter.get('/:id', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await getProperty(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

propertiesRouter.patch('/:id', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await updateProperty(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

propertiesRouter.delete('/:id', requirePermission('properties:delete'), async (req, res, next) => {
  try { await deleteProperty(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});

propertiesRouter.post('/:id/images', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await addImage(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

propertiesRouter.delete('/:id/images/:imageId', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await removeImage(ctx(req), req.params.id!, req.params.imageId!)); } catch (err) { next(err); }
});

propertiesRouter.post('/:id/features', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await addFeature(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

propertiesRouter.delete('/:id/features/:featureId', requirePermission('properties:edit'), async (req, res, next) => {
  try { res.json(await removeFeature(ctx(req), req.params.id!, req.params.featureId!)); } catch (err) { next(err); }
});
