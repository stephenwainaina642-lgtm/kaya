import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { toCsv } from '../../lib/csv';
import {
  listLeases, createLease, endLease, renewLease, generateCharges, listCharges, recordPayment, emailReceipt, listPayments,
  getOverview, getArrears, ownerStatement,
} from './rent.service';

export const rentRouter = Router();
rentRouter.use(authenticate, requirePlanModule('rentManagement'));

const wrap = (fn: (req: any, res: any) => Promise<void>) => (req: any, res: any, next: any) => fn(req, res).catch(next);

rentRouter.get('/overview', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getOverview(ctx(req), req.query)); }));
rentRouter.get('/leases', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listLeases(ctx(req), req.query.status as string | undefined)); }));
rentRouter.post('/leases', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await createLease(ctx(req), req.body)); }));
rentRouter.post('/leases/:id/end', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await endLease(ctx(req), req.params.id, req.body?.endDate)); }));
rentRouter.post('/leases/:id/renew', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await renewLease(ctx(req), req.params.id, req.body)); }));
rentRouter.post('/charges/generate', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await generateCharges(ctx(req), req.body)); }));
rentRouter.get('/charges', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listCharges(ctx(req), req.query)); }));
rentRouter.get('/charges/:id/payments', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listPayments(ctx(req), req.params.id)); }));
rentRouter.post('/payments/:id/email-receipt', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await emailReceipt(ctx(req), req.params.id)); }));
rentRouter.post('/charges/:id/payments', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await recordPayment(ctx(req), req.params.id, req.body)); }));
rentRouter.get('/arrears', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getArrears(ctx(req))); }));

rentRouter.get('/statements/:ownerId', requirePermission('rent:view'), wrap(async (req, res) => {
  const st = await ownerStatement(ctx(req), req.params.ownerId, req.query.period as string | undefined);
  if (req.query.format !== 'csv') { res.json(st); return; }
  const rows = [
    ...st.lines.map((l) => ({ property: l.propertyTitle, tenant: l.tenantName, rent_due: l.rentDue, collected: l.collected, management_fee: l.managementFee, withholding: l.withholding, net_to_landlord: l.netToLandlord })),
    ...st.deductions.map((d) => ({ property: d.propertyTitle, tenant: `Repair: ${d.title}`, rent_due: 0, collected: 0, management_fee: 0, withholding: 0, net_to_landlord: -d.amount })),
    { property: 'TOTAL', tenant: '', rent_due: st.totals.rentDue, collected: st.totals.collected, management_fee: st.totals.managementFee, withholding: st.totals.withholding, net_to_landlord: st.totals.netToLandlord },
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="statement-${st.ownerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${st.period}.csv"`);
  res.send(toCsv(['property', 'tenant', 'rent_due', 'collected', 'management_fee', 'withholding', 'net_to_landlord'], rows));
}));
