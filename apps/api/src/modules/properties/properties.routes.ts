import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import {
  listProperties, getProperty, createProperty, updateProperty, deleteProperty,
  addImage, removeImage, addFeature, removeFeature,
} from './properties.service';

export const propertiesRouter = Router();
propertiesRouter.use(authenticate);

propertiesRouter.get('/', requirePermission('properties:view'), async (req, res, next) => {
  try { res.json(await listProperties(ctx(req), req.query)); } catch (err) { next(err); }
});

propertiesRouter.post('/', requirePermission('properties:create'), async (req, res, next) => {
  try { res.status(201).json(await createProperty(ctx(req), req.body)); } catch (err) { next(err); }
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
