import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works under the GitHub Pages project subpath.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    // Some balance tests fight several whole battles; on the slower CI runners they can take
    // longer than the default 5 seconds.
    testTimeout: 30000,
  },
});
