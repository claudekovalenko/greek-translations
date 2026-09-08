// Parsing of MorphGNT data lines and the compact format used for caching
// and for the embedded single-file build.
//
// MorphGNT line:  "040316 V- 3AAI-S-- ἠγάπησεν ἠγάπησεν ἠγάπησε(ν) ἀγαπάω"
//   columns: bcv, part of speech, parsing code, text, word, normalized, lemma
// Compact line:   "0316\tV-\t3AAI-S--\tἠγάπησεν\tἠγάπησε(ν)\tἀγαπάω"
//   (book number is implicit; word is derived from text)

import { stripPunctuation, stripSigla } from './greek.js';

/**
 * Parse a MorphGNT file into an array of word objects.
 * @returns {{ b:number, c:number, v:number, pos:string, code:string, text:string, word:string, norm:string, lemma:string }[]}
 */
export function parseMorphGNT(text) {
  const words = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(' ');
    if (f.length < 7) continue;
    const [bcv, pos, code, wordText, , norm, lemma] = f;
    words.push({
      b: Number(bcv.slice(0, 2)),
      c: Number(bcv.slice(2, 4)),
      v: Number(bcv.slice(4, 6)),
      pos,
      code,
      text: stripSigla(wordText),
      word: stripPunctuation(wordText),
      norm,
      lemma,
    });
  }
  return words;
}

/** Serialize words of one book to the compact format. */
export function toCompact(words) {
  return words
    .map((w) => `${pad2(w.c)}${pad2(w.v)}\t${w.pos}\t${w.code}\t${w.text}\t${w.norm}\t${w.lemma}`)
    .join('\n');
}

/** Parse the compact format for a book with number `b`. */
export function fromCompact(b, text) {
  const words = [];
  for (const raw of text.split('\n')) {
    if (!raw) continue;
    const f = raw.split('\t');
    if (f.length < 6) continue;
    const [cv, pos, code, wordText, norm, lemma] = f;
    words.push({
      b,
      c: Number(cv.slice(0, 2)),
      v: Number(cv.slice(2, 4)),
      pos,
      code,
      text: wordText,
      word: stripPunctuation(wordText),
      norm,
      lemma,
    });
  }
  return words;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Group a book's words into verses, in order.
 * @returns {{ b:number, c:number, v:number, words: object[] }[]}
 */
export function groupVerses(words) {
  const verses = [];
  let current = null;
  for (const w of words) {
    if (!current || current.c !== w.c || current.v !== w.v) {
      current = { b: w.b, c: w.c, v: w.v, words: [] };
      verses.push(current);
    }
    current.words.push(w);
  }
  return verses;
}

/** Select verses of a book matching a reference range. */
export function selectVerses(verses, range) {
  const { chapter, verse, endChapter = chapter, endVerse } = range;
  return verses.filter((vs) => {
    if (vs.c < chapter || vs.c > endChapter) return false;
    if (vs.c === chapter && verse != null && vs.v < verse) return false;
    if (vs.c === endChapter && endVerse != null && vs.v > endVerse) return false;
    return true;
  });
}

/** Plain-text rendering of a verse: words joined by spaces. */
export function verseText(verse) {
  return verse.words.map((w) => w.text).join(' ');
}
