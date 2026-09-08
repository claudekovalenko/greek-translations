import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMorphGNT, toCompact, fromCompact, groupVerses, selectVerses, verseText } from '../js/morphgnt.js';
import { SAMPLE_TEXT } from '../js/sample.js';

test('parses MorphGNT lines', () => {
  const words = parseMorphGNT(SAMPLE_TEXT);
  assert.equal(words.length, 46);
  const w = words[2];
  assert.equal(w.b, 4); assert.equal(w.c, 3); assert.equal(w.v, 16);
  assert.equal(w.pos, 'V-'); assert.equal(w.code, '3AAI-S--');
  assert.equal(w.word, 'ἠγάπησεν'); assert.equal(w.lemma, 'ἀγαπάω');
  assert.equal(words[9].text, 'υἱὸν', 'sigla are stripped from display text');
  assert.equal(words[12].text, 'ἔδωκεν,'); assert.equal(words[12].word, 'ἔδωκεν');
});

test('compact round trip preserves the fields the app uses', () => {
  const words = parseMorphGNT(SAMPLE_TEXT);
  const back = fromCompact(4, toCompact(words));
  assert.deepEqual(back, words);
});

test('groupVerses and selectVerses', () => {
  const verses = groupVerses(parseMorphGNT(SAMPLE_TEXT));
  assert.equal(verses.length, 2);
  assert.equal(verses[0].words.length, 25);
  assert.equal(selectVerses(verses, { chapter: 3, verse: 17, endVerse: 17 }).length, 1);
  assert.equal(selectVerses(verses, { chapter: 3, verse: null, endVerse: null }).length, 2);
  assert.equal(selectVerses(verses, { chapter: 3, verse: 1, endChapter: 3, endVerse: 16 }).length, 1);
  assert.match(verseText(verses[1]), /^οὐ γὰρ ἀπέστειλεν/);
});
