import { defineConfig } from 'vitest/config';

// Relative base so the build works on GitHub Pages under /<repo>/ and on any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
