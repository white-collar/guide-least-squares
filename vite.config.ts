import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Багатосторінковий статичний сайт: кожен розділ — окрема HTML-сторінка.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        ch01: resolve(import.meta.dirname, 'chapters/01-overdetermined.html'),
        ch02: resolve(import.meta.dirname, 'chapters/02-best-solution.html'),
      },
    },
  },
});
