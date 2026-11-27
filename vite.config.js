import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// `vite build --mode single` emits one JS bundle (no chunks) for scripts/build-single.mjs,
// which inlines it into a single self-contained HTML file for hosted test links.
export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './',                 // relative paths so the build works from any folder / itch.io / static host
  server: { host: true, port: 5173 },   // host:true = reachable from a phone on the same Wi-Fi
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: mode === 'single'
        ? { inlineDynamicImports: true }
        : { manualChunks: { three: ['three'] } },   // keeps the game code cache-friendly across updates
    },
    ...(mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 1e9, cssCodeSplit: false } : {}),
  },
}));
