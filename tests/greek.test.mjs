import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForCompare, formsMatch, stripPunctuation, syllabify, accentRecessive, expandMovable } from '../js/greek.js';

test('stripPunctuation removes sigla and punctuation', () => {
  assert.equal(stripPunctuation('⸀υἱὸν'), 'υἱὸν');
  assert.equal(stripPunctuation('ἔδωκεν,'), 'ἔδωκεν');
  assert.equal(stripPunctuation('αὐτοῦ.'), 'αὐτοῦ');
  assert.equal(stripPunctuation('ἀλλ’'), 'ἀλλ');
});

test('loose comparison ignores accents, breathings and final sigma', () => {
  assert.equal(normalizeForCompare('Λόγος'), normalizeForCompare('λογοσ'));
  assert.ok(formsMatch('ελυσα', ['ἔλυσα']));
  assert.ok(formsMatch('λυουσιν', ['λύουσι(ν)']));
  assert.ok(formsMatch('λυουσι', ['λύουσι(ν)']));
  assert.ok(!formsMatch('λυω', ['λύεις']));
});

test('strict comparison requires accents but folds grave to acute', () => {
  assert.ok(formsMatch('ἔλυσα', ['ἔλυσα'], { strict: true }));
  assert.ok(!formsMatch('ελυσα', ['ἔλυσα'], { strict: true }));
  assert.ok(formsMatch('θεὸς', ['θεός'], { strict: true }));
});

test('expandMovable produces both variants', () => {
  assert.deepEqual(expandMovable('ἐστί(ν)'), ['ἐστί', 'ἐστίν']);
  assert.deepEqual(expandMovable('λύω'), ['λύω']);
});

test('syllabify counts vowel groups', () => {
  assert.equal(syllabify('λύομεν').length, 3);
  assert.equal(syllabify('πιστεύουσιν').length, 4);
  assert.equal(syllabify('ἄνθρωπος').length, 3);
});

test('recessive accent', () => {
  assert.equal(accentRecessive('λυομεν'), 'λύομεν');
  assert.equal(accentRecessive('λυω'), 'λύω');
  assert.equal(accentRecessive('ἐλυθην'), 'ἐλύθην');
  assert.equal(accentRecessive('λυομεθα'), 'λυόμεθα');
});
