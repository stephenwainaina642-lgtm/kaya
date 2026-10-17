import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { uuidField } from '../crm/common';
import { matchPropertiesForContact, matchPeopleForProperty, dismissMatch, undismissMatch } from './matching.service';

export const matchingRouter = Router();
matchingRouter.use(authenticate);
// Property matching engine is a Growth-and-up feature (see pricing table).
matchingRouter.use(requirePlanModule('matching'));

matchingRouter.get('/leads/:id/properties', async (req, res) => {
  const a = ctx(req);
  const id = uuidField.parse(req.params.id);
  res.json(await matchPropertiesForContact(a, { leadId: id }, req.query));
});

matchingRouter.get('/clients/:id/properties', async (req, res) => {
  const a = ctx(req);
  const id = uuidField.parse(req.params.id);
  res.json(await matchPropertiesForContact(a, { clientId: id }, req.query));
});

matchingRouter.get('/properties/:id/contacts', async (req, res) => {
  const a = ctx(req);
  const id = uuidField.parse(req.params.id);
  res.json(await matchPeopleForProperty(a, id, req.query));
});

matchingRouter.post('/clients/:clientId/properties/:propertyId/dismiss', async (req, res) => {
  const a = ctx(req);
  const clientId = uuidField.parse(req.params.clientId);
  const propertyId = uuidField.parse(req.params.propertyId);
  await dismissMatch(a, clientId, propertyId);
  res.status(204).end();
});

matchingRouter.post('/clients/:clientId/properties/:propertyId/undismiss', async (req, res) => {
  const a = ctx(req);
  const clientId = uuidField.parse(req.params.clientId);
  const propertyId = uuidField.parse(req.params.propertyId);
  await undismissMatch(a, clientId, propertyId);
  res.status(204).end();
});
