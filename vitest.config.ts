import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    alias: {
      '$lib': '/src/lib',
      '$app': '/src/test/mocks/app'
    }
  }
});
