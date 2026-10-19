import { createApp } from './app';
import { env } from './config/env';
import { startDripScheduler } from './modules/automation/scheduler';

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kaya API listening on :${env.PORT}`);
});

startDripScheduler();
