import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/
  base: './',
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
