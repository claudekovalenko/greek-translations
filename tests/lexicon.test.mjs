import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { frequencyBand, passageVocabulary, entryFor, loadLexicon } from '../js/lexicon.js';
import { parseMorphGNT, groupVerses } from '../js/morphgnt.js';
import { SAMPLE_TEXT } from '../js/sample.js';
import { betaToUnicode } from '../scripts/beta-code.mjs';

// The app fetches the lexicon; in tests we hand it the built file directly.
globalThis.__ANAGNOSIS_LEXICON = JSON.parse(await readFile(new URL('../data/lexicon.json', import.meta.url), 'utf8'));
await loadLexicon();

test('beta code conversion', () => {
  assert.equal(betaToUnicode('lo/gos'), 'λόγος');
  assert.equal(betaToUnicode('e)/rxomai'), 'ἔρχομαι');
  assert.equal(betaToUnicode('do/ca, hs, h('), 'δόξα, ης, ἡ');
  assert.equal(betaToUnicode('*xristo/s'), 'Χριστός');
  assert.equal(betaToUnicode('a)gapa/w'), 'ἀγαπάω');
  assert.equal(betaToUnicode('yuxh/'), 'ψυχή');
});

test('lexicon entries carry gloss, headword and frequency', () => {
  const logos = entryFor('λόγος');
  assert.equal(logos.headword, 'λόγος, ου, ὁ');
  assert.match(logos.gloss, /word/);
  assert.equal(logos.frequency, 330);
  assert.equal(entryFor('θεός').frequency, 1307);
  assert.match(entryFor('ἀγαπάω').gloss, /love/);
  // Lemmas Dodson spells differently still resolve.
  assert.match(entryFor('Μωϋσῆς').gloss, /Moses/);
  assert.match(entryFor('οὕτω(ς)').gloss, /thus|so/);
  assert.equal(entryFor('not-a-lemma'), null);
});

test('frequency bands', () => {
  assert.equal(frequencyBand(1307).key, 'core');
  assert.equal(frequencyBand(330).key, 'common');
  assert.equal(frequencyBand(20).key, 'known');
  assert.equal(frequencyBand(4).key, 'rare');
  assert.equal(frequencyBand(1).label, 'once in the NT');
});

test('passage vocabulary lists distinct lemmas rarest first', () => {
  const passage = { verses: groupVerses(parseMorphGNT(SAMPLE_TEXT)) };
  const vocab = passageVocabulary(passage);
  const lemmas = vocab.map((v) => v.lemma);
  assert.ok(lemmas.includes('μονογενής'));
  assert.ok(lemmas.includes('ὁ'));
  assert.equal(new Set(lemmas).size, lemmas.length, 'each lemma appears once');
  const freqs = vocab.map((v) => v.entry?.frequency ?? 0);
  assert.deepEqual(freqs, [...freqs].sort((a, b) => a - b), 'sorted by NT frequency');
  assert.equal(vocab.find((v) => v.lemma === 'κόσμος').count, 4, 'counts occurrences in the passage');
});
