import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wordClass, classLabel, walkFields, renderingHints, newSession, wordStage, progress,
  nextPosition, prevPosition, translationText, translationMarkdown, fileSlug,
} from '../js/walk-core.js';

const verb = { b: 4, c: 3, v: 16, pos: 'V-', code: '3AAI-S--', text: 'ἠγάπησεν', word: 'ἠγάπησεν', lemma: 'ἀγαπάω' };
const ptc = { b: 4, c: 3, v: 16, pos: 'V-', code: '-PAPNSM-', text: 'πιστεύων', word: 'πιστεύων', lemma: 'πιστεύω' };
const noun = { b: 4, c: 3, v: 16, pos: 'N-', code: '----ASM-', text: 'κόσμον,', word: 'κόσμον', lemma: 'κόσμος' };
const art = { b: 4, c: 3, v: 16, pos: 'RA', code: '----ASM-', text: 'τὸν', word: 'τὸν', lemma: 'ὁ' };
const conj = { b: 4, c: 3, v: 16, pos: 'C-', code: '--------', text: 'γὰρ', word: 'γὰρ', lemma: 'γάρ' };
const rel = { b: 4, c: 3, v: 16, pos: 'RR', code: '----NSM-', text: 'ὃς', word: 'ὃς', lemma: 'ὅς' };
const impv = { b: 4, c: 3, v: 17, pos: 'V-', code: '2AAD-P--', text: 'λύσατε', word: 'λύσατε', lemma: 'λύω' };
const indecl = { b: 4, c: 3, v: 17, pos: 'N-', code: '--------', text: 'Ἀβραάμ', word: 'Ἀβραάμ', lemma: 'Ἀβραάμ' };

function session() {
  return newSession({
    label: 'Jn 3:16-17',
    now: Date.UTC(2026, 10, 11),
    id: 't1',
    verses: [
      { b: 4, c: 3, v: 16, words: [conj, verb, art, noun] },
      { b: 4, c: 3, v: 17, words: [impv] },
    ],
  });
}

test('word classes follow the part of speech', () => {
  assert.equal(wordClass(verb), 'verb');
  assert.equal(wordClass(ptc), 'verb');
  assert.equal(wordClass(art), 'article');
  assert.equal(wordClass(rel), 'pronoun');
  assert.equal(classLabel(ptc), 'verb (participle)');
  assert.equal(classLabel(rel), 'pronoun (relative)');
  assert.equal(classLabel(conj), 'conjunction');
});

test('walkFields skips articles unless asked, and empty fields', () => {
  assert.deepEqual(walkFields(verb), ['person', 'tense', 'voice', 'mood', 'number']);
  assert.deepEqual(walkFields(art), []);
  assert.deepEqual(walkFields(art, { parseArticles: true }), ['case', 'number', 'gender']);
  assert.deepEqual(walkFields(conj), []);
  assert.deepEqual(walkFields(indecl), []);
});

test('rendering hints explain the form', () => {
  const v = renderingHints(verb).join(' ');
  assert.match(v, /he \/ she \/ it/);
  assert.match(v, /simple past/);
  assert.match(v, /Active/);
  assert.match(renderingHints(noun).join(' '), /direct object/);
  assert.match(renderingHints(impv).join(' '), /command to several people/);
  assert.match(renderingHints(impv).join(' '), /not about past time/);
  assert.match(renderingHints(ptc).join(' '), /nominative/);
  assert.match(renderingHints(rel).join(' '), /who, which, that/);
  assert.ok(renderingHints(conj).length > 0);
  const en = { pos: 'V-', code: '3IAI-S--', word: 'ἦν', lemma: 'εἰμί' };
  assert.match(renderingHints(en).join(' '), /predicate/);
  assert.doesNotMatch(renderingHints(en).join(' '), /subject does the action/);
});

test('word stages: class, then parse, then summary', () => {
  const s = session();
  assert.equal(wordStage(s, 0, 1), 'class');
  s.answers['0.1'] = { cls: 'verb', clsOk: true };
  assert.equal(wordStage(s, 0, 1), 'parse');
  s.answers['0.1'].solved = true;
  assert.equal(wordStage(s, 0, 1), 'summary');
  s.opts.askClass = false;
  assert.equal(wordStage(s, 0, 0), 'summary'); // conjunction: nothing to parse
  assert.equal(wordStage(s, 0, 3), 'parse');
  s.answers['0.3'] = { revealed: true };
  assert.equal(wordStage(s, 0, 3), 'summary');
});

test('positions include a translate step at the end of each verse', () => {
  const s = session();
  assert.deepEqual(nextPosition(s, { v: 0, w: 3 }), { v: 0, w: 4 });
  assert.deepEqual(nextPosition(s, { v: 0, w: 4 }), { v: 1, w: 0 });
  assert.equal(nextPosition(s, { v: 1, w: 1 }), null);
  assert.deepEqual(prevPosition(s, { v: 1, w: 0 }), { v: 0, w: 4 });
  assert.equal(prevPosition(s, { v: 0, w: 0 }), null);
});

test('progress counts first-try results', () => {
  const s = session();
  s.answers['0.1'] = { cls: 'verb', clsOk: true, firstTry: true, done: true };
  s.answers['0.3'] = { cls: 'verb', clsOk: false, firstTry: false, done: true };
  s.translations[0] = 'For God so loved the world';
  const p = progress(s);
  assert.equal(p.words, 5);
  assert.equal(p.done, 2);
  assert.equal(p.classRight, 1);
  assert.equal(p.parsedRight, 1);
  assert.equal(p.parsed, 2);
  assert.equal(p.translated, 1);
});

test('translation text puts the verses together', () => {
  const s = session();
  s.translations = ['For God so loved the world', ''];
  const t = translationText(s, { date: new Date(Date.UTC(2026, 10, 11)) });
  assert.match(t, /^Jn 3:16-17\n\n16 For God so loved the world 17 \[not translated\]/);
  assert.match(t, /11 November 2026/);
});

test('markdown can include the Greek and the notes', () => {
  const s = session();
  s.translations = ['For God so loved the world', 'Set free!'];
  s.answers['0.1'] = { firstTry: true };
  const md = translationMarkdown(s, { greek: true, notes: true, gloss: (l) => (l === 'ἀγαπάω' ? 'I love' : null) });
  assert.match(md, /^# Jn 3:16-17/);
  assert.match(md, /<sup>16<\/sup> For God so loved the world <sup>17<\/sup> Set free!/);
  assert.match(md, /> γὰρ ἠγάπησεν τὸν κόσμον,/);
  assert.match(md, /\| ἠγάπησεν \| ἀγαπάω \| verb \| aor act ind 3 sg \| I love \| ✓ \|/);
  assert.equal(translationMarkdown(s).includes('##'), false);
});

test('chapter numbers appear where a passage crosses chapters', () => {
  const s = newSession({ label: 'Rom 7:25-8:1', id: 't2', verses: [
    { b: 6, c: 7, v: 25, words: [conj] },
    { b: 6, c: 8, v: 1, words: [conj] },
  ] });
  s.translations = ['Thanks be to God.', 'So now there is no condemnation.'];
  assert.match(translationText(s), /7:25 Thanks be to God\. 8:1 So now/);
});

test('file names', () => {
  assert.equal(fileSlug('1 Cor 13:4-7'), '1-cor-13-4-7');
});
