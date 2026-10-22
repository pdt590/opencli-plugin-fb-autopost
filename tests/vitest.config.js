import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [{
    name: 'strip-node-shebang-for-tests',
    enforce: 'pre',
    transform(code, id) {
      // Vite can prepend CJS import helpers before a shebang on Windows.
      // Keep executable scripts intact on disk; remove only in test transforms.
      if (id.endsWith('.js') && code.startsWith('#!')) {
        return { code: code.replace(/^#![^\n]*(?:\n|$)/, '\n'), map: null };
      }
    },
  }],
});
