import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    maxWorkers: 1,
  },
});
