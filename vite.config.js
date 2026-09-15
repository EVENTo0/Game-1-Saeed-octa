import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                 // relative paths so the build works from any folder / itch.io / static host
  server: { host: true, port: 5173 },   // host:true = reachable from a phone on the same Wi-Fi
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },   // keeps the game code cache-friendly across updates
      },
    },
  },
});
