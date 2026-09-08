// Parsing of scripture references such as "John 3:16-18", "Jn 3.16",
// "1 Cor 13", "Rom 5:1-6:2", "1 Jn 1:1–4" into structured ranges.

import { BOOKS } from './books.js';

const ORDINALS = { i: '1', ii: '2', iii: '3', first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3' };

const ALIAS_INDEX = new Map();
for (const book of BOOKS) for (const a of book.aliases) ALIAS_INDEX.set(a, book);

/** Find a book by a free-form name; returns the book record or null. */
export function findBook(name) {
  let key = name.toLowerCase().replace(/[.\s_-]+/g, '');
  for (const [ord, digit] of Object.entries(ORDINALS)) {
    if (key.startsWith(ord) && /^[a-z]/.test(key.slice(ord.length))) {
      const candidate = digit + key.slice(ord.length);
      if (ALIAS_INDEX.has(candidate)) return ALIAS_INDEX.get(candidate);
    }
  }
  if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key);
  // Prefix match on full names (e.g. "Ephes", "Galat")
  const matches = BOOKS.filter((b) => b.name.toLowerCase().replace(/\s+/g, '').startsWith(key));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Parse a reference string. Returns
 *   { book, chapter, verse|null, endChapter, endVerse|null, label }
 * or throws an Error with a user-facing message.
 */
export function parseReference(input) {
  const s = input.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const m = s.match(/^((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-zA-Z]+\.?)\s*(\d+)?(?:\s*[:.,]\s*(\d+))?(?:\s*-\s*(\d+)(?:\s*[:.]\s*(\d+))?)?$/i);
  if (!m) throw new Error(`Could not read "${input}". Try a form like "John 3:16-18" or "Rom 8".`);
  const [, bookName, ch, vs, endA, endB] = m;
  const book = findBook(bookName);
  if (!book) throw new Error(`Unknown book "${bookName.trim()}".`);
  if (!ch) throw new Error(`Add a chapter, e.g. "${book.abbr} 1".`);
  const chapter = Number(ch);
  if (chapter < 1 || chapter > book.chapters) throw new Error(`${book.name} has ${book.chapters} chapter${book.chapters === 1 ? '' : 's'}.`);
  const verse = vs ? Number(vs) : null;
  let endChapter = chapter;
  let endVerse = verse;
  if (endA != null) {
    if (endB != null) { endChapter = Number(endA); endVerse = Number(endB); }
    else if (verse == null) { endChapter = Number(endA); endVerse = null; }
    else endVerse = Number(endA);
  }
  if (endChapter < chapter || (endChapter === chapter && endVerse != null && verse != null && endVerse < verse)) {
    throw new Error('The end of the range comes before its start.');
  }
  if (endChapter > book.chapters) throw new Error(`${book.name} has ${book.chapters} chapters.`);
  return { book, chapter, verse, endChapter, endVerse, label: formatReference({ book, chapter, verse, endChapter, endVerse }) };
}

export function formatReference({ book, chapter, verse, endChapter = chapter, endVerse = verse }) {
  let s = `${book.abbr} ${chapter}`;
  if (verse != null) s += `:${verse}`;
  if (endChapter !== chapter) s += `-${endChapter}${endVerse != null ? ':' + endVerse : ''}`;
  else if (endVerse != null && endVerse !== verse) s += `-${endVerse}`;
  return s;
}

export function verseLabel(book, c, v) {
  return `${book.abbr} ${c}:${v}`;
}
