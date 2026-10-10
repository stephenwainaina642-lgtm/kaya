import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 20000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
