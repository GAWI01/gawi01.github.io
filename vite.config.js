import { defineConfig } from 'vite';

export default defineConfig({
  // BASE_PATH lets a preview build live under a subpath, e.g. BASE_PATH=/arcade-test/.
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
