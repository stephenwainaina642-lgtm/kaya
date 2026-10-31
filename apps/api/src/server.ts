import { storageBackend } from './lib/storage';
import { createApp } from './app';
import { env } from './config/env';
import { startDripScheduler } from './modules/automation/scheduler';

const app = createApp();

if (env.NODE_ENV === 'production' && storageBackend() === 'local') {
  console.warn('[storage] *** Using local disk in production: uploaded logos and documents will be LOST on every deploy. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2). ***');
}
app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kaya API listening on :${env.PORT}`);
});

startDripScheduler();
