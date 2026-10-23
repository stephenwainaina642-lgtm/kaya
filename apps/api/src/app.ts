import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { corsOrigins, env } from './config/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web's production build, copied alongside the compiled API at deploy
// time (see scripts/deploy-setup.sh / render.yaml) — lets one web service
// serve both the app and its API with no CORS or proxy config needed.
const WEB_DIST = path.resolve(__dirname, '../../web/dist');
import { notFoundHandler, errorHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
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
import { platformAdminRouter } from './modules/platform/platform-admin.routes';
import { viewingsRouter } from './modules/viewings/viewings.routes';
import { dealsRouter } from './modules/deals/deals.routes';
import { calendarRouter } from './modules/calendar/calendar.routes';
import { communicationsRouter } from './modules/communications/communications.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { automationRouter } from './modules/automation/automation.routes';
import { viewingRequestsRouter } from './modules/portal/portal.routes';

export function createApp(): Express {
  const app = express();

  // Render terminates TLS and sits in front of this process, so the real
  // client IP only shows up in X-Forwarded-For — needed for rate limiting
  // (and req.ip generally) to key by the actual caller rather than Render's
  // proxy. express-rate-limit refuses to start if it sees that header with
  // trust proxy unset, as a safety check against IP spoofing.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      level: process.env.LOG_LEVEL ?? 'info',
      autoLogging: process.env.NODE_ENV !== 'test',
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiLimiter);

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
  app.use('/api/platform', platformAdminRouter);
  app.use('/api/viewings', viewingsRouter);
  app.use('/api/deals', dealsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/communications', communicationsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/automation', automationRouter);
  app.use('/api/viewing-requests', viewingRequestsRouter);

  app.use('/api', notFoundHandler);
  app.use('/api', errorHandler);

  if (env.NODE_ENV === 'production') {
    // Serve the built React app and let client-side routing handle any
    // path that isn't an API call or a real static file.
    app.use(express.static(WEB_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  return app;
}
