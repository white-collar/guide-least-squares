import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Багатосторінковий статичний сайт: кожен розділ — окрема HTML-сторінка.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
});
