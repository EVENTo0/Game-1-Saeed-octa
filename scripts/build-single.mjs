/**
 * Inline the single-mode Vite build into one self-contained HTML file
 * (dist-single/saeed-royale.html) for hosts that take a single page, such as a
 * private test link. The regular `npm run build` output is unaffected.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
let html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = readdirSync(join(dir, 'assets'));

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/g, (_, f) =>
  `<style>${readFileSync(join(dir, 'assets', f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/g, (_, f) => {
  const js = readFileSync(join(dir, 'assets', f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
// The script must run after the DOM it queries, so move it to the end of the body.
const scripts = [];
html = html.replace(/<script type="module">[\s\S]*?<\/script>/g, (m) => { scripts.push(m); return ''; });
html = html.replace('</body>', () => `${scripts.join('\n')}\n</body>`);  // function form: the bundle contains $& patterns

if (/\.\/assets\//.test(html)) throw new Error(`unresolved asset reference; assets: ${assets.join(', ')}`);
writeFileSync(join(dir, 'saeed-royale.html'), html);
console.log(`dist-single/saeed-royale.html ${(html.length / 1024).toFixed(0)} KB`);
