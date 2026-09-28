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
        ch03: resolve(import.meta.dirname, 'chapters/03-bowl.html'),
        ch04: resolve(import.meta.dirname, 'chapters/04-normal-equations.html'),
        ch05: resolve(import.meta.dirname, 'chapters/05-geometry.html'),
        ch06: resolve(import.meta.dirname, 'chapters/06-programming.html'),
        ch07: resolve(import.meta.dirname, 'chapters/07-beyond-lines.html'),
      },
    },
  },
});
