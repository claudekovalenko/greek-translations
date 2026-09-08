import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCode, drillFields, checkParse, describeParse } from '../js/parsing.js';

const verb = { pos: 'V-', code: '3AAI-S--', word: 'ἠγάπησεν', lemma: 'ἀγαπάω' };
const ptc = { pos: 'V-', code: '-PAPNSM-', word: 'πιστεύων', lemma: 'πιστεύω' };
const inf = { pos: 'V-', code: '-AAN----', word: 'λῦσαι', lemma: 'λύω' };
const noun = { pos: 'N-', code: '----ASM-', word: 'κόσμον', lemma: 'κόσμος' };
const mp = { pos: 'V-', code: '3PMI-S--', word: 'ἔρχεται', lemma: 'ἔρχομαι' };
const conj = { pos: 'C-', code: '--------', word: 'ἵνα', lemma: 'ἵνα' };

test('decodeCode', () => {
  assert.deepEqual(decodeCode('3AAI-S--'), { person: '3', tense: 'A', voice: 'A', mood: 'I', case: null, number: 'S', gender: null, degree: null });
});

test('drillFields depends on word class', () => {
  assert.deepEqual(drillFields(verb), ['person', 'tense', 'voice', 'mood', 'number']);
  assert.deepEqual(drillFields(ptc), ['tense', 'voice', 'mood', 'case', 'number', 'gender']);
  assert.deepEqual(drillFields(inf), ['tense', 'voice', 'mood']);
  assert.deepEqual(drillFields(noun), ['case', 'number', 'gender']);
  assert.deepEqual(drillFields(conj), []);
});

test('checkParse marks fields', () => {
  const r = checkParse(verb, { person: '3', tense: 'A', voice: 'A', mood: 'I', number: 'S' });
  assert.equal(r.correct, true);
  const bad = checkParse(verb, { person: '3', tense: 'P', voice: 'A', mood: 'I', number: 'P' });
  assert.equal(bad.correct, false);
  assert.equal(bad.fields.tense.ok, false); assert.equal(bad.fields.tense.expected, 'A');
  assert.equal(bad.fields.number.ok, false);
  assert.equal(bad.fields.person.ok, true);
});

test('middle and passive interchangeable where forms coincide', () => {
  assert.equal(checkParse(mp, { person: '3', tense: 'P', voice: 'P', mood: 'I', number: 'S' }).correct, true);
  const aor = { pos: 'V-', code: '3AMI-S--', word: 'ἐγένετο', lemma: 'γίνομαι' };
  assert.equal(checkParse(aor, { person: '3', tense: 'A', voice: 'P', mood: 'I', number: 'S' }).correct, false);
});

test('describeParse', () => {
  assert.equal(describeParse(verb), 'aor act ind 3 sg');
  assert.equal(describeParse(verb, { long: true }), 'aorist active indicative 3rd singular');
  assert.equal(describeParse(noun), 'acc sg masc');
  assert.equal(describeParse(conj), 'conjunction');
});
