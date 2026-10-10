import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { corsOrigins } from './config/env';
import { notFoundHandler, errorHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { followUpsRouter } from './modules/followups/followups.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { teamRouter } from './modules/team/team.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { ownersRouter } from './modules/owners/owners.routes';
import { propertiesRouter } from './modules/properties/properties.routes';
import { matchingRouter } from './modules/matching/matching.routes';
import { shortlistsRouter } from './modules/shortlists/shortlists.routes';
import { platformRouter } from './modules/platform/platform.routes';

export function createApp(): Express {
  const app = express();

  app.use(
    pinoHttp({
      level: process.env.LOG_LEVEL ?? 'info',
      autoLogging: process.env.NODE_ENV !== 'test',
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/follow-ups', followUpsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/owners', ownersRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/shortlists', shortlistsRouter);
  app.use('/api/public', platformRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
