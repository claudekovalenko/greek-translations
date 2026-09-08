#!/usr/bin/env node
// Downloads the MorphGNT SBLGNT files into data/morphgnt/ for offline use
// and for the embedded single-file build.
//
// Text: SBLGNT (SBL Greek New Testament), used under the SBLGNT EULA.
// Morphology: MorphGNT (J. K. Tauber, ed.), CC BY-SA 3.0.
// https://github.com/morphgnt/sblgnt
import { mkdir, writeFile } from 'node:fs/promises';
import { BOOKS, REMOTE_BASE } from '../js/books.js';

const outDir = new URL('../data/morphgnt/', import.meta.url);
await mkdir(outDir, { recursive: true });

for (const book of BOOKS) {
  const url = `${REMOTE_BASE}/${book.file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  await writeFile(new URL(book.file, outDir), text);
  console.log(`${book.name.padEnd(16)} ${String(text.length).padStart(8)} chars`);
}
