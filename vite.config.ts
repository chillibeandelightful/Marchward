import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works under the GitHub Pages project subpath.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
