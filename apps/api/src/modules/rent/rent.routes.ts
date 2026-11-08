import { applyMpesa, matchMpesa } from './mpesa-match.service';
import { getStatementSchedule, setStatementSchedule, emailAllStatements, emailOwnerStatement, getPortalLink, createPortalLink, revokePortalLink } from './portal.service';
import { importLeases } from './import.service';
import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { toCsv } from '../../lib/csv';
import {
  listLeases, createLease, endLease, renewLease, generateCharges, listCharges, recordPayment, emailReceipt, listPayments,
  getOverview, getArrears, getVacancies, getSummary, tenantStatement, addChargeExtra, removeChargeExtra, settleDeposit, ownerStatement,
} from './rent.service';

export const rentRouter = Router();
rentRouter.use(authenticate, requirePlanModule('rentManagement'));

const wrap = (fn: (req: any, res: any) => Promise<void>) => (req: any, res: any, next: any) => fn(req, res).catch(next);

rentRouter.get('/overview', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getOverview(ctx(req), req.query)); }));
rentRouter.get('/leases', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listLeases(ctx(req), req.query.status as string | undefined)); }));
rentRouter.post('/leases', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await createLease(ctx(req), req.body)); }));
rentRouter.get('/leases/:id/statement', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await tenantStatement(ctx(req), req.params.id)); }));
rentRouter.post('/leases/:id/end', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await endLease(ctx(req), req.params.id, req.body?.endDate)); }));
rentRouter.post('/leases/import', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await importLeases(ctx(req), req.body)); }));
rentRouter.post('/leases/:id/settle-deposit', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await settleDeposit(ctx(req), req.params.id, req.body)); }));
rentRouter.post('/leases/:id/renew', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await renewLease(ctx(req), req.params.id, req.body)); }));
rentRouter.post('/charges/generate', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await generateCharges(ctx(req), req.body)); }));
rentRouter.get('/charges', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listCharges(ctx(req), req.query)); }));
rentRouter.get('/charges/:id/payments', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await listPayments(ctx(req), req.params.id)); }));
rentRouter.post('/payments/:id/email-receipt', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await emailReceipt(ctx(req), req.params.id)); }));
rentRouter.post('/charges/:id/extras', requirePermission('rent:edit'), wrap(async (req, res) => { res.status(201).json(await addChargeExtra(ctx(req), req.params.id, req.body)); }));
rentRouter.delete('/charges/:id/extras/:extraId', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await removeChargeExtra(ctx(req), req.params.id, req.params.extraId)); }));
rentRouter.post('/charges/:id/payments', requirePermission('rent:create'), wrap(async (req, res) => { res.status(201).json(await recordPayment(ctx(req), req.params.id, req.body)); }));
rentRouter.get('/owners/:id/portal-link', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getPortalLink(ctx(req), req.params.id)); }));
rentRouter.post('/owners/:id/portal-link', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await createPortalLink(ctx(req), req.params.id)); }));
rentRouter.delete('/owners/:id/portal-link', requirePermission('rent:edit'), wrap(async (req, res) => { await revokePortalLink(ctx(req), req.params.id); res.status(204).end(); }));
rentRouter.get('/statement-schedule', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getStatementSchedule(ctx(req))); }));
rentRouter.put('/statement-schedule', requirePermission('rent:edit'), wrap(async (req, res) => { res.json(await setStatementSchedule(ctx(req), req.body)); }));
rentRouter.post('/mpesa/match', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await matchMpesa(ctx(req), req.body)); }));
rentRouter.post('/mpesa/apply', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await applyMpesa(ctx(req), req.body)); }));
rentRouter.get('/summary', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getSummary(ctx(req))); }));
rentRouter.get('/vacancies', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getVacancies(ctx(req))); }));
rentRouter.get('/arrears', requirePermission('rent:view'), wrap(async (req, res) => { res.json(await getArrears(ctx(req))); }));

rentRouter.post('/statements/email-all', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await emailAllStatements(ctx(req), req.body?.period)); }));
rentRouter.post('/statements/:ownerId/email', requirePermission('rent:create'), wrap(async (req, res) => { res.json(await emailOwnerStatement(ctx(req), req.params.ownerId, req.body?.period, req.body?.includeLink !== false)); }));
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
