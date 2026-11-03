import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one test database, so files run one at a time.
    fileParallelism: false,
    setupFiles: ['./test/setup-env.ts'],
  },
});
