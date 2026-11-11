import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clues, pattern, helpHtml, patternHtml, chartHtml } from '../js/walk-help.js';

const aorist = { pos: 'V-', code: '3AAI-S--', word: 'ἠγάπησεν', lemma: 'ἀγαπάω' };
const present = { pos: 'V-', code: '3PMI-S--', word: 'ἔρχεται', lemma: 'ἔρχομαι' };
const eimi = { pos: 'V-', code: '3IAI-S--', word: 'ἦν', lemma: 'εἰμί' };
const ptc = { pos: 'V-', code: '-APPNSM-', word: 'λυθείς', lemma: 'λύω' };
const art = { pos: 'RA', code: '----DSF-', word: 'τῇ', lemma: 'ὁ' };
const noun = { pos: 'N-', code: '----DSF-', word: 'ἀρχῇ', lemma: 'ἀρχή' };

test('verb clues point at the signs the form carries', () => {
  const c = clues(aorist).join(' ');
  assert.match(c, /augment/);
  assert.match(c, /σα/);
  assert.match(clues(present).join(' '), /no augment/);
  assert.match(clues(present).join(' '), /middle\/passive endings/);
  assert.match(clues(eimi).join(' '), /εἰμί/);
});

test('noun clues use an agreeing article and the dictionary gender', () => {
  assert.match(clues(noun, [art, noun], 1).join(' '), /article τῇ .* dative singular feminine/);
  assert.match(clues(noun, [], 0, 'ἀρχή, ῆς, ἡ').join(' '), /feminine/);
});

test('verb patterns: model λύω beside the word\'s own verb, endings split off', () => {
  const p = pattern(aorist);
  assert.equal(p.modelName, 'λύω');
  assert.equal(p.ownName, 'ἀγαπάω');
  assert.equal(p.rows.length, 6);
  assert.deepEqual(p.rows[0].model[0], { stem: 'ἔλυσ', ending: 'α' });
  assert.ok(p.rows[2].own.includes('ἠγάπησε(ν)'));
  assert.equal(p.rows.some((r) => r.hit), false);
  assert.equal(pattern(aorist, { reveal: true }).rows[2].hit, true);
});

test('present middle/passive and εἰμί patterns', () => {
  assert.match(pattern(present).title, /present middle\/passive indicative/);
  const e = pattern(eimi, { reveal: true });
  assert.equal(e.modelName, 'εἰμί');
  assert.equal(e.rows.find((r) => r.hit).label, '3 sg');
});

test('participle and noun patterns mark the matching row on reveal', () => {
  assert.equal(pattern(ptc, { reveal: true }).rows.find((r) => r.hit).label, 'aorist passive');
  const n = pattern(noun, { reveal: true });
  assert.equal(n.rows.find((r) => r.hit).label, 'dat sg');
  assert.equal(n.rows[2].model[0].ending, 'ῇ');
});

test('help html grows by step and the chart renders', () => {
  assert.equal(helpHtml(aorist, 0), '');
  assert.doesNotMatch(helpHtml(aorist, 1), /<table/);
  assert.match(helpHtml(aorist, 2), /<table/);
  assert.match(patternHtml(aorist, { reveal: true }), /class="hit"/);
  const chart = chartHtml();
  assert.match(chart, /ἐλύθην/);
  assert.match(chart, /λέλυκα/);
  assert.match(chart, /εἰσί/);
});
