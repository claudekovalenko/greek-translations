#!/usr/bin/env node
// Bundles index.html, css/style.css and the ES modules into one standalone
// HTML file at dist/anagnosis.html. With --embed, the compact MorphGNT text of
// every book in data/morphgnt/ is inlined so the file works without network
// access (run `npm run fetch-data` first).
//
// The bundler is deliberately tiny: modules are concatenated in dependency
// order with their import/export statements rewritten, since each module
// exports only top-level declarations.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { BOOKS } from '../js/books.js';
import { parseMorphGNT, toCompact } from '../js/morphgnt.js';

const root = new URL('../', import.meta.url);
const embed = process.argv.includes('--embed');
// --artifact writes a body fragment (no doctype/html/head/body) for hosts that
// wrap the page themselves.
const artifact = process.argv.includes('--artifact');
const read = (p) => readFile(new URL(p, root), 'utf8');

const ORDER = ['books', 'greek', 'morphgnt', 'refs', 'parsing', 'paradigm', 'lexicon', 'review', 'datasource', 'state', 'export', 'sample', 'main'];

function transform(name, src) {
  // Modules are concatenated into one scope, so an aliased import would leave
  // the alias undefined. Fail loudly rather than ship a broken bundle.
  const aliased = src.match(/^import\s*\{[^}]*\bas\b[^}]*\}\s*from\s+'[^']+';/m);
  if (aliased) {
    throw new Error(`${name}.js uses an aliased import, which this bundler cannot rewrite:\n  ${aliased[0]}\nRename the export instead.`);
  }
  // Drop imports (everything shares one scope after concatenation).
  src = src.replace(/^import\s[^;]*?from\s+'[^']+';\s*$/gm, '');
  // export function/const/let/class → plain declarations
  src = src.replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
  // export { a, b }; → nothing
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  return `// ---- ${name}.js\n${src}`;
}

let js = '';
for (const name of ORDER) js += transform(name, await read(`js/${name}.js`)) + '\n';

let html = await read('index.html');
const css = await read('css/style.css');
// Replacer functions: a plain replacement string would treat `$` and `html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, `<style>\n${css}\n</style>`);` as patterns.
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${css}\n</style>`);

let dataScript = '';
// The lexicon is small enough to embed in every single-file build.
try {
  const lexicon = await readFile(new URL('data/lexicon.json', root), 'utf8');
  dataScript += `<script>globalThis.__ANAGNOSIS_LEXICON = ${lexicon.replace(/<\/script/gi, '<\\/script')};</script>\n`;
} catch {
  console.warn('data/lexicon.json is missing: the built file will have no glosses. Run `npm run build-lexicon`.');
}
if (embed) {
  const dir = new URL('data/morphgnt/', root);
  if (!existsSync(dir)) {
    console.error('data/morphgnt/ is missing. Run `npm run fetch-data` first.');
    process.exit(1);
  }
  const files = new Set(await readdir(dir));
  const data = {};
  for (const book of BOOKS) {
    if (!files.has(book.file)) continue;
    const words = parseMorphGNT(await readFile(new URL(book.file, dir), 'utf8'));
    data[book.id] = toCompact(words);
  }
  const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  dataScript += `<script>globalThis.__ANAGNOSIS_DATA = ${json};</script>\n`;
  console.log(`Embedded ${Object.keys(data).length} books (${(json.length / 1e6).toFixed(1)} MB).`);
}

html = html.replace(/<script type="module" src="js\/main.js"><\/script>/, () => `${dataScript}<script type="module">\n${js}\n</script>`);

if (artifact) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}

await mkdir(new URL('dist/', root), { recursive: true });
const out = new URL(artifact ? 'dist/anagnosis-artifact.html' : embed ? 'dist/anagnosis-offline.html' : 'dist/anagnosis.html', root);
await writeFile(out, html);
console.log(`Wrote ${out.pathname} (${(html.length / 1e6).toFixed(2)} MB)`);
