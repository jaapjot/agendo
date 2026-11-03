import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser talks to Vite only; Vite forwards /api to Express.
    // Same origin in dev and prod means the auth cookie works identically in both.
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    rollupOptions: {
      output: {
        // Third-party code changes rarely; separate chunks stay cached across deploys.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['@tanstack/react-query', 'react-hook-form', '@hookform/resolvers', 'zod'],
          dates: ['luxon'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
