import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReference, findBook } from '../js/refs.js';

test('finds books by many aliases', () => {
  assert.equal(findBook('John').id, 4);
  assert.equal(findBook('Jn').id, 4);
  assert.equal(findBook('1 John').id, 23);
  assert.equal(findBook('I Jn').id, 23);
  assert.equal(findBook('First Corinthians').id, 7);
  assert.equal(findBook('Phil').id, 11);
  assert.equal(findBook('Phlm').id, 18);
  assert.equal(findBook('Rev').id, 27);
  assert.equal(findBook('Ephes').id, 10);
  assert.equal(findBook('Nonesuch'), null);
});

test('parses reference shapes', () => {
  let r = parseReference('John 3:16-18');
  assert.equal(r.book.id, 4); assert.equal(r.chapter, 3); assert.equal(r.verse, 16); assert.equal(r.endVerse, 18);
  assert.equal(r.label, 'John 3:16-18');
  r = parseReference('Rom 8');
  assert.equal(r.verse, null); assert.equal(r.endVerse, null); assert.equal(r.label, 'Rom 8');
  r = parseReference('Mk 1:1-2:5');
  assert.equal(r.endChapter, 2); assert.equal(r.endVerse, 5); assert.equal(r.label, 'Mark 1:1-2:5');
  r = parseReference('1 Cor 13.4–7');
  assert.equal(r.book.id, 7); assert.equal(r.verse, 4); assert.equal(r.endVerse, 7);
  r = parseReference('Jn 1');
  assert.equal(r.chapter, 1);
  r = parseReference('Rom 5-6');
  assert.equal(r.endChapter, 6); assert.equal(r.endVerse, null);
});

test('rejects bad references with helpful messages', () => {
  assert.throws(() => parseReference('John'), /chapter/);
  assert.throws(() => parseReference('John 99'), /21 chapters/);
  assert.throws(() => parseReference('Zork 1:1'), /Unknown book/);
  assert.throws(() => parseReference('John 3:18-16'), /before its start/);
});

test('single-chapter books take a bare verse number', () => {
  assert.equal(parseReference('Jude').label, 'Jude 1');
  let r = parseReference('Jude 3');
  assert.equal(r.chapter, 1); assert.equal(r.verse, 3); assert.equal(r.label, 'Jude 1:3');
  r = parseReference('Jude 3-5');
  assert.equal(r.chapter, 1); assert.equal(r.verse, 3); assert.equal(r.endVerse, 5);
  r = parseReference('Philemon 4');
  assert.equal(r.book.id, 18); assert.equal(r.verse, 4);
  assert.equal(parseReference('2 John 5').label, '2 John 1:5');
  assert.equal(parseReference('Jude 1:3').label, 'Jude 1:3');
  assert.equal(parseReference('Jude 1').label, 'Jude 1');
});
