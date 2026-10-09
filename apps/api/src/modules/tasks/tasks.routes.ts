import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { listTasks, createTask, updateTask, setTaskStatus, deleteTask } from './tasks.service';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

tasksRouter.get('/', requirePermission('tasks:view'), async (req, res, next) => {
  try { res.json(await listTasks(ctx(req), req.query)); } catch (err) { next(err); }
});

tasksRouter.post('/', requirePermission('tasks:create'), async (req, res, next) => {
  try { res.status(201).json(await createTask(ctx(req), req.body)); } catch (err) { next(err); }
});

tasksRouter.patch('/:id', requirePermission('tasks:edit'), async (req, res, next) => {
  try { res.json(await updateTask(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

tasksRouter.post('/:id/status', requirePermission('tasks:edit'), async (req, res, next) => {
  try { res.json(await setTaskStatus(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

tasksRouter.delete('/:id', requirePermission('tasks:delete'), async (req, res, next) => {
  try { await deleteTask(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});
