// Loading of MorphGNT books from, in order: memory, data embedded in the
// page (single-file build), the browser's IndexedDB cache, a local copy in
// data/morphgnt/, and finally the MorphGNT repository on GitHub.

import { BOOK_BY_ID, REMOTE_BASE } from './books.js';
import { parseMorphGNT, toCompact, fromCompact } from './morphgnt.js';

const memory = new Map(); // id → words[] (complete books only)
const extra = [];         // words from partial texts, e.g. the opening sample
const DB_NAME = 'anagnosis';
const STORE = 'books';

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cacheGet(id) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cachePut(id, compact) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(compact, id);
  } catch {
    /* cache is best-effort */
  }
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Books available without any network access (embedded or cached). */
export function embeddedBooks() {
  const data = globalThis.__ANAGNOSIS_DATA;
  return data ? Object.keys(data).map(Number) : [];
}

/**
 * Load one book's words. `onStatus(message)` reports progress.
 * @returns {Promise<{ words: object[], source: string }>}
 */
export async function loadBook(id, { onStatus = () => {} } = {}) {
  const book = BOOK_BY_ID.get(id);
  if (!book) throw new Error(`Unknown book number ${id}`);
  if (memory.has(id)) return { words: memory.get(id), source: 'memory' };

  const embedded = globalThis.__ANAGNOSIS_DATA?.[id];
  if (embedded) {
    const words = fromCompact(id, embedded);
    memory.set(id, words);
    return { words, source: 'embedded' };
  }

  onStatus(`Looking for ${book.name} in the local cache…`);
  const cached = await cacheGet(id);
  if (cached) {
    const words = fromCompact(id, cached);
    memory.set(id, words);
    return { words, source: 'cache' };
  }

  let text = null;
  let source = null;
  if (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
    try {
      onStatus(`Loading ${book.name} from the local data folder…`);
      text = await fetchText(new URL(`data/morphgnt/${book.file}`, document.baseURI).href);
      source = 'local';
    } catch {
      text = null;
    }
  }
  if (!text) {
    onStatus(`Downloading ${book.name} from the MorphGNT repository…`);
    try {
      text = await fetchText(`${REMOTE_BASE}/${book.file}`);
      source = 'remote';
    } catch (err) {
      throw new Error(`Could not download ${book.name}. Check your connection, or paste the Greek text instead. (${err.message})`);
    }
  }
  const words = parseMorphGNT(text);
  if (!words.length) throw new Error(`${book.name} downloaded but could not be read.`);
  memory.set(id, words);
  cachePut(id, toCompact(words));
  return { words, source };
}

/**
 * Add words from a partial text (the opening sample) so their attested forms
 * are available to the drills. They are deliberately kept out of the book
 * cache: a few verses must never stand in for the whole book.
 */
export function registerPartial(words) {
  extra.push(...words);
}

/** Every word the app currently holds, from whole books and partial texts. */
export function loadedWords() {
  const out = [];
  for (const words of memory.values()) out.push(...words);
  out.push(...extra);
  return out;
}

export function loadedBookIds() {
  return [...memory.keys()];
}
