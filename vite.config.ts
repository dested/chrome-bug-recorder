import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Main build: the side panel (React) + the MV3 service worker.
 * The content script is built separately (see vite.content.config.ts) because it
 * must be a self-contained IIFE, not an ES module.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
