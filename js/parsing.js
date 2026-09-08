// Decoding of MorphGNT part-of-speech and parsing codes into fields and
// human-readable labels, plus the drill field sets per part of speech.

export const POS_LABELS = {
  'A-': 'adjective',
  'C-': 'conjunction',
  'D-': 'adverb',
  'I-': 'interjection',
  'N-': 'noun',
  'P-': 'preposition',
  'RA': 'definite article',
  'RD': 'demonstrative pronoun',
  'RI': 'interrogative / indefinite pronoun',
  'RP': 'personal pronoun',
  'RR': 'relative pronoun',
  'V-': 'verb',
  'X-': 'particle',
};

export const FIELDS = {
  person: { label: 'Person', options: { 1: '1st', 2: '2nd', 3: '3rd' }, short: { 1: '1', 2: '2', 3: '3' } },
  tense:  { label: 'Tense', options: { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', X: 'perfect', Y: 'pluperfect' }, short: { P: 'pres', I: 'impf', F: 'fut', A: 'aor', X: 'pf', Y: 'plpf' } },
  voice:  { label: 'Voice', options: { A: 'active', M: 'middle', P: 'passive' }, short: { A: 'act', M: 'mid', P: 'pass' } },
  mood:   { label: 'Mood', options: { I: 'indicative', D: 'imperative', S: 'subjunctive', O: 'optative', N: 'infinitive', P: 'participle' }, short: { I: 'ind', D: 'impv', S: 'subj', O: 'opt', N: 'inf', P: 'ptc' } },
  case:   { label: 'Case', options: { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' }, short: { N: 'nom', G: 'gen', D: 'dat', A: 'acc', V: 'voc' } },
  number: { label: 'Number', options: { S: 'singular', P: 'plural' }, short: { S: 'sg', P: 'pl' } },
  gender: { label: 'Gender', options: { M: 'masculine', F: 'feminine', N: 'neuter' }, short: { M: 'masc', F: 'fem', N: 'neut' } },
  degree: { label: 'Degree', options: { C: 'comparative', S: 'superlative' }, short: { C: 'comp', S: 'superl' } },
};

const ORDER = ['person', 'tense', 'voice', 'mood', 'case', 'number', 'gender', 'degree'];
// Conventional order when describing a parse: "aor act ind 3 sg", "acc sg masc".
const DESCRIBE_ORDER = ['tense', 'voice', 'mood', 'person', 'case', 'number', 'gender', 'degree'];

/** Decode an 8-character parsing code into { person, tense, ... } with '-' → null. */
export function decodeCode(code) {
  const out = {};
  for (let i = 0; i < ORDER.length; i++) {
    const ch = code[i] ?? '-';
    out[ORDER[i]] = ch === '-' ? null : ch;
  }
  return out;
}

/** Tenses whose middle and passive forms are identical. */
export const MP_IDENTICAL_TENSES = new Set(['P', 'I', 'X', 'Y']);

/**
 * The fields a learner should identify for a given word, in display order.
 * Verbs: finite → person, tense, voice, mood, number.
 *        participle → tense, voice, mood, case, number, gender.
 *        infinitive → tense, voice, mood.
 * Nominals: case, number, gender (+ degree if the adjective is compared).
 */
export function drillFields(word) {
  const p = decodeCode(word.code);
  if (word.pos === 'V-') {
    if (p.mood === 'P') return ['tense', 'voice', 'mood', 'case', 'number', 'gender'];
    if (p.mood === 'N') return ['tense', 'voice', 'mood'];
    return ['person', 'tense', 'voice', 'mood', 'number'];
  }
  if (['N-', 'A-', 'RA', 'RD', 'RI', 'RP', 'RR'].includes(word.pos)) {
    const fields = ['case', 'number', 'gender'];
    if (word.pos === 'RP' && p.gender == null) fields.pop(); // ἐγώ, σύ have no gender
    if (p.degree) fields.push('degree');
    return fields;
  }
  return []; // uninflected: nothing to parse
}

export function isInflected(word) {
  return drillFields(word).length > 0;
}

/**
 * Check a learner's field-by-field parse against the gold code.
 * Returns { correct: boolean, fields: { [field]: { given, expected, ok } } }.
 * Voice: in tenses where middle and passive are formally identical, either
 * answer is accepted for a form tagged the other way.
 */
export function checkParse(word, answers) {
  const gold = decodeCode(word.code);
  const result = { correct: true, fields: {} };
  for (const f of drillFields(word)) {
    const given = answers[f] ?? null;
    const expected = gold[f];
    let ok = given === expected;
    if (!ok && f === 'voice' && MP_IDENTICAL_TENSES.has(gold.tense) && 'MP'.includes(given ?? '') && 'MP'.includes(expected ?? '')) ok = true;
    if (!ok) result.correct = false;
    result.fields[f] = { given, expected, ok };
  }
  return result;
}

/** Short human-readable parse, e.g. "aor act ind 3 sg" or "acc sg masc". */
export function describeParse(word, { long = false } = {}) {
  const p = decodeCode(word.code);
  const dict = long ? 'options' : 'short';
  const fields = new Set(drillFields(word));
  const parts = [];
  for (const f of DESCRIBE_ORDER) {
    if (fields.has(f) && p[f]) parts.push(FIELDS[f][dict][p[f]]);
  }
  if (!parts.length) return POS_LABELS[word.pos] ?? word.pos;
  return parts.join(' ');
}

export function posLabel(word) {
  return POS_LABELS[word.pos] ?? word.pos;
}
