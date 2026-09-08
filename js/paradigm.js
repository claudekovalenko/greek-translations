// Paradigm generation for regular Greek verbs and first/second declension
// nouns. Generated forms are used as the answer key of the conjugation and
// declension drills when no attested form is available in the loaded text.
//
// All string work happens in NFD; public functions return NFC.

import {
  nfd, nfc, accentRecessive, accentSyllable, syllabify, findAccent, isLong,
  fixFinalSigma, stripLengthMarks, MACRON, BREVE, IOTA_SUB, CIRCUMFLEX, ACUTE,
} from './greek.js';

const A_ = 'α', E_ = 'ε', O_ = 'ο';
const LONG_A = 'ᾱ', LONG_I = 'ῑ', LONG_U = 'ῡ'; // used in stems (macron marks quantity)

// ---------------------------------------------------------------------------
// Endings. `s` = ending string (NFD), `fixed` = accent already included (skip
// the recessive rule), `penult` = accent the penult (aorist active infinitive).

const E = (s, extra = {}) => ({ s: nfd(s), ...extra });

const ENDINGS = {
  presAct:  [E('ω'), E('εις'), E('ει'), E('ομεν'), E('ετε'), E('ουσι(ν)')],
  presMP:   [E('ομαι'), E('ῃ'), E('εται'), E('ομεθα'), E('εσθε'), E('ονται')],
  impfAct:  [E('ον'), E('ες'), E('ε(ν)'), E('ομεν'), E('ετε'), E('ον')],
  impfMP:   [E('ομην'), E('ου'), E('ετο'), E('ομεθα'), E('εσθε'), E('οντο')],
  aor1Act:  [E('α'), E('ας'), E('ε(ν)'), E('αμεν'), E('ατε'), E('αν')],
  aor1Mid:  [E('αμην'), E('ω'), E('ατο'), E('αμεθα'), E('ασθε'), E('αντο')],
  aorPass:  [E('ην'), E('ης'), E('η'), E('ημεν'), E('ητε'), E('ησαν')],
  perfAct:  [E('α'), E('ας'), E('ε(ν)'), E('αμεν'), E('ατε'), E('ασι(ν)')],
  perfMP:   [E('μαι'), E('σαι'), E('ται'), E('μεθα'), E('σθε'), E('νται')],
  subjAct:  [E('ω'), E('ῃς'), E('ῃ'), E('ωμεν'), E('ητε'), E('ωσι(ν)')],
  subjMP:   [E('ωμαι'), E('ῃ'), E('ηται'), E('ωμεθα'), E('ησθε'), E('ωνται')],
  subjAorPass: [E('ῶ', { fixed: true }), E('ῇς', { fixed: true }), E('ῇ', { fixed: true }), E('ῶμεν', { fixed: true }), E('ῆτε', { fixed: true }), E('ῶσι(ν)', { fixed: true })],
  // imperatives: 2s, 3s, 2p, 3p
  impvPresAct: [E('ε'), E('ετω'), E('ετε'), E('ετωσαν')],
  impvPresMP:  [E('ου'), E('εσθω'), E('εσθε'), E('εσθωσαν')],
  impvAor1Act: [E('ον'), E('ατω'), E('ατε'), E('ατωσαν')],
  impvAor1Mid: [E('αι'), E('ασθω'), E('ασθε'), E('ασθωσαν')],
  impvAor2Mid: [E('οῦ', { fixed: true }), E('εσθω'), E('εσθε'), E('εσθωσαν')],
  impvAorPass: [E('ητι'), E('ητω'), E('ητε'), E('ητωσαν')],
  // infinitives
  infPresAct: [E('ειν', { spurious: true })],
  infPresMP:  [E('εσθαι')],
  infAor1Act: [E('αι', { penult: true })],
  infAor1Mid: [E('ασθαι')],
  infAor2Act: [E('εῖν', { fixed: true })],
  infAor2Mid: [E('έσθαι', { fixed: true })],
  infAorPass: [E('ῆναι', { fixed: true })],
  infPerfAct: [E('έναι', { fixed: true })],
};

const PERSONS = [['1', 'S'], ['2', 'S'], ['3', 'S'], ['1', 'P'], ['2', 'P'], ['3', 'P']];
const IMPV_PERSONS = [['2', 'S'], ['3', 'S'], ['2', 'P'], ['3', 'P']];

// Second aorist imperatives with irregular final accent.
const OXYTONE_IMPV = new Set(['εἰπέ', 'ἐλθέ', 'εὑρέ', 'ἰδέ', 'λαβέ']);

// ---------------------------------------------------------------------------
// Prepositional prefixes: [form before consonant, form before vowel]

const PREFIXES = [
  ['ἀπο', 'ἀπ'], ['ἀπ', 'ἀπ'], ['ἐπι', 'ἐπ'], ['ἐπ', 'ἐπ'], ['κατα', 'κατ'], ['κατ', 'κατ'],
  ['μετα', 'μετ'], ['μετ', 'μετ'], ['παρα', 'παρ'], ['παρ', 'παρ'], ['ὑπο', 'ὑπ'], ['ὑπ', 'ὑπ'],
  ['ἀνα', 'ἀν'], ['ἀν', 'ἀν'], ['δια', 'δι'], ['δι', 'δι'], ['ἀντι', 'ἀντ'], ['ἀντ', 'ἀντ'],
  ['ἀμφι', 'ἀμφ'], ['περι', 'περι'], ['προσ', 'προσ'], ['προ', 'προ'], ['εἰσ', 'εἰσ'],
  ['ἐκ', 'ἐξ'], ['ἐξ', 'ἐξ'], ['ἐν', 'ἐν'], ['ἐμ', 'ἐν'], ['ἐγ', 'ἐν'], ['ἐλ', 'ἐν'],
  ['συν', 'συν'], ['συμ', 'συν'], ['συγ', 'συν'], ['συλ', 'συν'], ['συσ', 'συν'], ['συ', 'συν'],
  ['ὑπερ', 'ὑπερ'],
].map(([c, v]) => [nfd(c), nfd(v)]);

const VOWEL_RE = /^[αεηιουω]/;
const PREFIX_VOWEL_FORM = new Map(PREFIXES.map(([c, v]) => [c, v]));

/** The prefix as it appears before a given stem (elided before vowels, assimilated before consonants). */
function prefixBefore(prefix, stem) {
  if (!prefix) return '';
  const p = nfd(prefix);
  if (startsWithVowel(stem)) return PREFIX_VOWEL_FORM.get(p) ?? p;
  return assimilate(p, stem);
}

/** Remove the breathing from an initial vowel (the base of a compound loses it). */
function stripInitialBreathing(stem) {
  const s = nfd(stem);
  return s.replace(/^([αεηιουω])([̀-ͯ]*)/, (m, v, marks) => v + marks.replace(/[̓̔]/g, ''));
}

function startsWithVowel(s) {
  return VOWEL_RE.test(nfd(s));
}

/** Assimilate ἐν/συν to the following consonant. */
function assimilate(prefix, next) {
  const p = nfc(prefix);
  const n = nfc(next)[0] ?? '';
  if (p === 'ἐν' || p === 'συν') {
    const head = p.slice(0, -1);
    if ('βπφψμ'.includes(n)) return nfd(head + 'μ');
    if ('γκχξ'.includes(n)) return nfd(head + 'γ');
    if (n === 'λ') return nfd(head + 'λ');
    if (p === 'συν' && (n === 'σ' || n === 'ζ')) return nfd('συ');
  }
  if (p === 'ἐκ' && startsWithVowel(next)) return nfd('ἐξ');
  return prefix;
}

// ---------------------------------------------------------------------------
// Augment and reduplication

const LENGTHEN = { α: 'η', ε: 'η', ο: 'ω', ι: 'ι' + MACRON, υ: 'υ' + MACRON, η: 'η', ω: 'ω' };
const LENGTHEN_DIPH = { αι: 'η' + IOTA_SUB, ει: 'ει', οι: 'ω' + IOTA_SUB, αυ: 'ηυ', ευ: 'ηυ', ου: 'ου' };

/**
 * Augment an unaugmented stem (NFD). Returns an array of variants (Koine
 * often leaves ευ- unaugmented, so both are accepted).
 */
export function augment(stem) {
  const s = nfd(stem);
  if (!s) return [s];
  const chars = splitChars(s);
  if (!/[αεηιουω]/.test(chars[0].base)) return [nfd('ἐ') + s];
  const first = chars[0];
  const second = chars[1];
  const diph = second && !second.marks.includes('̈') ? first.base + second.base : null;
  if (diph && LENGTHEN_DIPH[diph]) {
    const marksFirst = first.marks.replace(/[̄̆]/g, '');
    const marksSecond = second.marks.replace(/[̄̆]/g, '');
    const repl = nfd(LENGTHEN_DIPH[diph]);
    const rest = chars.slice(2).map((c) => c.base + c.marks).join('');
    // Breathing sits on the second letter of a diphthong; on a single vowel it
    // moves onto that vowel.
    const out = repl.length > 1 && /[αεηιουω]/.test(repl[1])
      ? repl[0] + marksFirst + repl[1] + marksSecond + rest
      : repl[0] + marksSecond + marksFirst + repl.slice(1) + rest;
    const variants = [out];
    if (diph === 'ευ') variants.push(s);
    return variants;
  }
  const repl = nfd(LENGTHEN[first.base]);
  const rest = chars.slice(1).map((c) => c.base + c.marks).join('');
  return [repl[0] + first.marks.replace(/[̄̆]/g, '') + repl.slice(1) + rest];
}

const DEASPIRATE = { φ: 'π', χ: 'κ', θ: 'τ' };

/** Perfect reduplication of an unaugmented stem (NFD). */
export function reduplicate(stem) {
  const s = nfd(stem);
  const chars = splitChars(s);
  const c0 = chars[0]?.base;
  if (!c0) return s;
  if (/[αεηιουω]/.test(c0)) return augment(s)[0];
  const c1 = chars[1]?.base;
  const isStop = 'πβφκγχτδθ'.includes(c0);
  const stopLiquid = isStop && c1 && 'λρμν'.includes(c1);
  const single = c1 && /[αεηιουω]/.test(c1);
  if (single || stopLiquid) return (DEASPIRATE[c0] ?? c0) + nfd('ε') + s;
  return nfd('ἐ') + s; // ρ-, ζ-, ξ-, ψ-, σ+stop, two consonants
}

function splitChars(s) {
  const out = [];
  for (const ch of nfd(s)) {
    if (/[̀-ͯ]/.test(ch)) { if (out.length) out[out.length - 1].marks += ch; }
    else out.push({ base: ch, marks: '' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stem-final consonant changes

function plusSigma(stem) {
  const s = nfd(stem);
  const last = s.slice(-1);
  const last2 = s.slice(-2);
  if (last2 === 'πτ' || last2 === 'σσ' || last2 === 'ττ') return s.slice(0, -2) + (last2 === 'πτ' ? 'ψ' : 'ξ');
  if ('πβφ'.includes(last)) return s.slice(0, -1) + 'ψ';
  if ('κγχ'.includes(last)) return s.slice(0, -1) + 'ξ';
  if ('τδθζ'.includes(last)) return s.slice(0, -1) + 'σ';
  return s + 'σ';
}

function plusTheta(stem) {
  const s = nfd(stem);
  const last = s.slice(-1);
  const last2 = s.slice(-2);
  if (last2 === 'πτ') return s.slice(0, -2) + 'φθ';
  if (last2 === 'σσ' || last2 === 'ττ') return s.slice(0, -2) + 'χθ';
  if ('πβφ'.includes(last)) return s.slice(0, -1) + 'φθ';
  if ('κγχ'.includes(last)) return s.slice(0, -1) + 'χθ';
  if ('τδθζ'.includes(last)) return s.slice(0, -1) + 'σθ';
  return s + 'θ';
}

function endsInVowel(stem) {
  return /[αεηιουω][̀-ͯ]*$/.test(nfd(stem));
}

function isLiquid(stem) {
  return /[λμνρ]$/.test(nfd(stem));
}

/** Lengthen the final vowel of a contract stem before σ/κ/θ. */
function lengthenContract(stem, vowel) {
  const s = nfd(stem).slice(0, -1);
  if (vowel === A_) {
    const prev = s.slice(-1);
    return s + ('ειρ'.includes(prev) ? LONG_A : 'η');
  }
  if (vowel === E_) return s + 'η';
  return s + 'ω';
}

// ---------------------------------------------------------------------------
// Verb table: bases with irregular principal parts. Stems are unaugmented
// unless the field is `aug`. `~` after a future stem marks a contract
// (liquid) future. Fields omitted are derived by rule; `null` disables.

const T = {
  'λύω':     { aor: { unaug: 'λῡσ', type: 1 }, aorP: 'λυθ', perf: 'λελυκ', perfMP: 'λελυ' },
  'λέγω':    { fut: 'ἐρ~', aor: { unaug: 'εἰπ', aug: 'εἰπ', type: 2, alt: { unaug: 'εἰπ', aug: 'εἰπ', type: 1 } }, aorP: { unaug: 'ῤηθ', aug: 'ἐρρεθ' }, perf: 'εἰρηκ', perfMP: 'εἰρη' },
  'ἔρχομαι': { fut: { stem: 'ἐλευσ', voices: 'M' }, aor: { unaug: 'ἐλθ', type: 2, voices: 'A' }, aorP: null, perf: 'ἐληλυθ', perfMP: null },
  'ὁράω':    { fut: { stem: 'ὀψ', voices: 'M' }, aor: { unaug: 'ἰδ', aug: 'εἰδ', type: 2 }, aorP: { unaug: 'ὀφθ', aug: 'ὠφθ' }, perf: 'ἑωρακ', perfMP: null },
  'λαμβάνω': { fut: { stem: 'λημψ', voices: 'M' }, aor: { unaug: 'λαβ', type: 2 }, aorP: 'λημφθ', perf: 'εἰληφ', perfMP: null },
  'γίνομαι': { fut: { stem: 'γενησ', voices: 'M' }, aor: { unaug: 'γεν', type: 2, voices: 'M' }, aorP: 'γενηθ', perf: 'γεγον', perfMP: 'γεγενη' },
  'βάλλω':   { fut: 'βαλ~', aor: { unaug: 'βαλ', type: 2 }, aorP: 'βληθ', perf: 'βεβληκ', perfMP: 'βεβλη' },
  'ἔχω':     { fut: 'ἑξ', aor: { unaug: 'σχ', type: 2 }, aorP: null, perf: 'ἐσχηκ', perfMP: null, impf: 'εἰχ' },
  'φέρω':    { fut: 'οἰσ', aor: { unaug: 'ἐνεγκ', type: 1 }, aorP: { unaug: 'ἐνεχθ' }, perf: 'ἐνηνοχ', perfMP: null },
  'στέλλω':  { fut: 'στελ~', aor: { unaug: 'στειλ', type: 1 }, aorP: 'σταλ', perf: 'ἐσταλκ', perfMP: 'ἐσταλ' },
  'ἀγγέλλω': { fut: 'ἀγγελ~', aor: { unaug: 'ἀγγειλ', type: 1 }, aorP: 'ἀγγελ', perf: null, perfMP: null },
  'κρίνω':   { fut: 'κριν~', aor: { unaug: 'κρῑν', type: 1 }, aorP: 'κριθ', perf: 'κεκρικ', perfMP: 'κεκρι' },
  'κρίνομαι': { fut: { stem: 'κριν~', voices: 'M' }, aor: { unaug: 'κρῑν', type: 1, voices: 'M' }, aorP: 'κριθ', perf: null, perfMP: null, deponent: true },
  'μένω':    { fut: 'μεν~', aor: { unaug: 'μειν', type: 1 }, aorP: null, perf: 'μεμενηκ', perfMP: null },
  'ἐγείρω':  { fut: 'ἐγερ~', aor: { unaug: 'ἐγειρ', type: 1 }, aorP: 'ἐγερθ', perf: null, perfMP: 'ἐγηγερ' },
  'σῴζω':    { fut: 'σωσ', aor: { unaug: 'σωσ', type: 1 }, aorP: 'σωθ', perf: 'σεσωκ', perfMP: 'σεσω' },
  'γινώσκω': { fut: { stem: 'γνωσ', voices: 'M' }, aor: null, aorP: 'γνωσθ', perf: 'ἐγνωκ', perfMP: 'ἐγνωσ' },
  'εὑρίσκω': { fut: 'εὑρησ', aor: { unaug: 'εὑρ', aug: 'εὑρ', type: 2 }, aorP: 'εὑρεθ', perf: 'εὑρηκ', perfMP: null },
  'θνῄσκω':  { fut: { stem: 'θαν~', voices: 'M' }, aor: { unaug: 'θαν', type: 2 }, aorP: null, perf: 'τεθνηκ', perfMP: null },
  'θέλω':    { fut: 'θελησ', aor: { unaug: 'θελησ', aug: 'ἠθελησ', type: 1 }, aorP: null, perf: null, perfMP: null, impf: 'ἠθελ' },
  'ἐσθίω':   { fut: { stem: 'φαγ~', voices: 'M' }, aor: { unaug: 'φαγ', type: 2 }, aorP: null, perf: null, perfMP: null },
  'πίνω':    { fut: { stem: 'πι', voices: 'M' }, aor: { unaug: 'πι', type: 2 }, aorP: 'ποθ', perf: 'πεπωκ', perfMP: null },
  'πίπτω':   { fut: { stem: 'πεσ~', voices: 'M' }, aor: { unaug: 'πεσ', type: 2 }, aorP: null, perf: 'πεπτωκ', perfMP: null },
  'ἄγω':     { fut: 'ἀξ', aor: { unaug: 'ἀγαγ', type: 2 }, aorP: 'ἀχθ', perf: null, perfMP: null },
  'διδάσκω': { fut: 'διδαξ', aor: { unaug: 'διδαξ', type: 1 }, aorP: 'διδαχθ', perf: null, perfMP: null },
  'κηρύσσω': { fut: 'κηρυξ', aor: { unaug: 'κηρυξ', type: 1 }, aorP: 'κηρυχθ', perf: null, perfMP: null },
  'καλέω':   { fut: 'καλεσ', aor: { unaug: 'καλεσ', type: 1 }, aorP: 'κληθ', perf: 'κεκληκ', perfMP: 'κεκλη' },
  'δοκέω':   { fut: 'δοξ', aor: { unaug: 'δοξ', type: 1 }, aorP: null, perf: null, perfMP: null },
  'σπείρω':  { fut: 'σπερ~', aor: { unaug: 'σπειρ', type: 1 }, aorP: 'σπαρ', perf: null, perfMP: 'ἐσπαρ' },
  'αἴρω':    { fut: 'ἀρ~', aor: { unaug: 'ἀρ', aug: 'ἠρ', type: 1 }, aorP: { unaug: 'ἀρθ', aug: 'ἠρθ' }, perf: 'ἠρκ', perfMP: 'ἠρ' },
  'δέχομαι': { fut: { stem: 'δεξ', voices: 'M' }, aor: { unaug: 'δεξ', type: 1, voices: 'M' }, aorP: 'δεχθ', perf: null, perfMP: 'δεδεγ' },
  'πορεύομαι': { fut: { stem: 'πορευσ', voices: 'M' }, aor: null, aorP: 'πορευθ', perf: null, perfMP: 'πεπορευ' },
  'φοβέομαι': { fut: null, aor: null, aorP: 'φοβηθ', perf: null, perfMP: null },
  'φοβέω':   { fut: null, aor: null, aorP: 'φοβηθ', perf: null, perfMP: null },
  'ἀκούω':   { fut: 'ἀκουσ', aor: { unaug: 'ἀκουσ', type: 1 }, aorP: 'ἀκουσθ', perf: 'ἀκηκο', perfMP: null },
  'γράφω':   { fut: 'γραψ', aor: { unaug: 'γραψ', type: 1 }, aorP: 'γραφ', perf: 'γεγραφ', perfMP: null },
  'πάσχω':   { fut: null, aor: { unaug: 'παθ', type: 2 }, aorP: null, perf: 'πεπονθ', perfMP: null },
  'τρέχω':   { fut: null, aor: { unaug: 'δραμ', type: 2 }, aorP: null, perf: null, perfMP: null },
  'φεύγω':   { fut: { stem: 'φευξ', voices: 'M' }, aor: { unaug: 'φυγ', type: 2 }, aorP: null, perf: 'πεφευγ', perfMP: null },
  'λείπω':   { fut: 'λειψ', aor: { unaug: 'λιπ', type: 2 }, aorP: 'λειφθ', perf: null, perfMP: 'λελειπ' },
  'μανθάνω': { fut: null, aor: { unaug: 'μαθ', type: 2 }, aorP: null, perf: 'μεμαθηκ', perfMP: null },
  'ἀνοίγω':  { fut: 'ἀνοιξ', aor: { unaug: 'ἀνοιξ', aug: 'ἠνοιξ', type: 1 }, aorP: { unaug: 'ἀνοιχθ', aug: 'ἠνοιχθ' }, perf: null, perfMP: null },
  'πείθω':   { fut: 'πεισ', aor: { unaug: 'πεισ', type: 1 }, aorP: 'πεισθ', perf: 'πεποιθ', perfMP: 'πεπεισ' },
  'πράσσω':  { fut: 'πραξ', aor: { unaug: 'πραξ', type: 1 }, aorP: 'πραχθ', perf: 'πεπραχ', perfMP: null },
  'ζάω':     { unsupported: 'ζάω contracts to η (ζῶ, ζῇς, ζῇ); attested forms only.' },
  'οἶδα':    { unsupported: 'οἶδα is a perfect with present meaning; attested forms only.' },
  'δύναμαι': { unsupported: 'δύναμαι is athematic; attested forms only.' },
};

const MI_VERB = /μι$/;

// ---------------------------------------------------------------------------
// Analysis of a lemma into a verb descriptor

/**
 * Analyze a lemma. Returns
 *   { lemma, kind: 'omega'|'eimi'|'unsupported', reason?, contract, deponent,
 *     prefix, base, stems: {...} }
 */
export function analyzeVerb(lemma) {
  const L = nfc(lemma.trim());
  if (L === 'εἰμί') return { lemma: L, kind: 'eimi', contract: null, deponent: true, stems: {} };
  if (T[L]?.unsupported) return { lemma: L, kind: 'unsupported', reason: T[L].unsupported };
  if (MI_VERB.test(L)) return { lemma: L, kind: 'unsupported', reason: 'μι-verbs (athematic conjugation) are not generated; attested forms only.' };

  let prefix = '';
  let base = L;
  let entry = T[L];
  if (!entry) {
    const split = splitPrefix(L);
    if (split) { prefix = split.prefix; base = split.base; entry = T[base]; }
    if (!entry && split && !T[split.base]) { /* keep split for augment placement */ }
  }
  const shape = lemmaShape(base);
  if (!shape) return { lemma: L, kind: 'unsupported', reason: 'This lemma does not end in -ω or -ομαι; attested forms only.' };
  const { stem, contract, deponent } = shape;
  const desc = {
    lemma: L, kind: 'omega', contract, deponent: entry?.deponent ?? deponent,
    prefix: nfd(prefix), base, stems: {},
  };
  const s = desc.stems;
  s.pres = stem; // NFD, unaugmented, without contract vowel removed (contract vowel is last char)
  s.impf = entry?.impf ? [nfd(entry.impf)] : augment(stem);

  // Future
  if (entry && entry.fut === null) s.fut = null;
  else if (entry?.fut) {
    const f = typeof entry.fut === 'string' ? { stem: entry.fut } : entry.fut;
    const liquid = f.stem.endsWith('~');
    s.fut = { stem: nfd(f.stem.replace('~', '')) + (liquid ? E_ : ''), contract: liquid ? E_ : null, voices: f.voices ?? 'AM' };
  } else if (contract) s.fut = { stem: lengthenContract(stem, contract) + 'σ', contract: null, voices: 'AM' };
  else if (isLiquid(stem)) s.fut = { stem: stem.replace(/λλ$/, 'λ') + E_, contract: E_, voices: 'AM' };
  else s.fut = { stem: plusSigma(stem), contract: null, voices: 'AM' };

  // Aorist active/middle
  if (entry && entry.aor === null) s.aor = null;
  else if (entry?.aor) s.aor = normalizeAor(entry.aor);
  else if (contract) s.aor = normalizeAor({ unaug: lengthenContract(stem, contract) + 'σ', type: 1 });
  else if (isLiquid(stem)) s.aor = null; // unpredictable stem vowel change
  else s.aor = normalizeAor({ unaug: plusSigma(stem), type: 1 });

  // Aorist passive
  if (entry && entry.aorP === null) s.aorP = null;
  else if (entry?.aorP) {
    const p = typeof entry.aorP === 'string' ? { unaug: entry.aorP } : entry.aorP;
    s.aorP = { unaug: nfd(p.unaug), aug: p.aug ? [nfd(p.aug)] : augment(nfd(p.unaug)) };
  } else if (contract) { const u = lengthenContract(stem, contract) + 'θ'; s.aorP = { unaug: u, aug: augment(u) }; }
  else if (isLiquid(stem)) s.aorP = null;
  else { const u = plusTheta(stem); s.aorP = { unaug: u, aug: augment(u) }; }

  // Perfect active / middle-passive
  if (entry && entry.perf === null) s.perf = null;
  else if (entry?.perf) s.perf = nfd(entry.perf);
  else if (contract) s.perf = reduplicate(lengthenContract(stem, contract) + 'κ');
  else if (endsInVowel(stem)) s.perf = reduplicate(stem + 'κ');
  else s.perf = null;

  if (entry && entry.perfMP === null) s.perfMP = null;
  else if (entry?.perfMP) s.perfMP = nfd(entry.perfMP);
  else if (contract) s.perfMP = reduplicate(lengthenContract(stem, contract));
  else if (endsInVowel(stem)) s.perfMP = reduplicate(stem);
  else s.perfMP = null;

  return desc;
}

function normalizeAor(a) {
  const unaug = nfd(a.unaug);
  const out = { unaug, aug: a.aug ? [nfd(a.aug)] : augment(unaug), type: a.type, voices: a.voices ?? 'AM' };
  if (a.alt) out.alt = normalizeAor(a.alt);
  return out;
}

/** Split a compound lemma into prefix + base if the base is a known table entry or looks like a verb. */
function splitPrefix(lemma) {
  const L = nfd(lemma);
  const candidates = [];
  for (const [pc, pv] of PREFIXES) {
    for (const p of new Set([pc, pv])) {
      if (L.startsWith(p) && L.length - p.length >= 4) {
        const rest = L.slice(p.length);
        for (const base of baseVariants(rest)) {
          candidates.push({ prefix: nfc(p), base, known: !!T[base] });
        }
      }
    }
  }
  if (!candidates.length) return null;
  const known = candidates.find((c) => c.known);
  if (known) return known;
  // Unknown base: only accept a split if the base can be analysed on its own
  // and starts plausibly (no stray leading consonant cluster from a mis-split).
  const c = candidates.sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return lemmaShape(c.base) ? c : null;
}

/** A compound's base has lost its breathing: try it bare and with either breathing. */
function baseVariants(rest) {
  const out = [nfc(rest)];
  if (startsWithVowel(rest)) {
    const bare = stripInitialBreathing(rest);
    for (const br of ['̓', '̔']) {
      out.push(nfc(bare.replace(/^([αεηιουω])([̀-ͯ]*)/, (m, v, marks) => v + br + marks)));
    }
  }
  return out;
}

/** Determine stem, contraction vowel and deponency from the lemma's ending. */
function lemmaShape(lemma) {
  const L = nfd(lemma);
  let m;
  if ((m = L.match(/^(.*?)([αεο])́ομαι$/))) return { stem: m[1] + m[2], contract: m[2], deponent: true };
  if ((m = L.match(/^(.*?)ομαι$/))) return { stem: stripAcc(m[1]), contract: null, deponent: true };
  if ((m = L.match(/^(.*?)([αεο])́ω$/))) return { stem: stripAcc(m[1]) + m[2], contract: m[2], deponent: false };
  if ((m = L.match(/^(.*?)ω$/))) return { stem: stripAcc(m[1]), contract: null, deponent: false };
  return null;
}

function stripAcc(s) {
  return nfd(s).replace(/[̀́͂]/g, '');
}

// ---------------------------------------------------------------------------
// Form building

/**
 * Build one form: prefix + stem + ending, with contraction and accent.
 * @returns {string} NFC form, or '' when impossible.
 */
function build({ prefix = '', stem, ending, contract = null, augmented = false, minFromPrefix = false }) {
  if (!stem) return '';
  const pre = prefixBefore(prefix, stem);
  if (pre) stem = stripInitialBreathing(stem);
  let endingStr = ending.s;
  if (contract && endingStr === nfd('ε(ν)')) endingStr = nfd('ε');
  const raw = pre + nfd(stem) + endingStr;
  let word;
  const prefixSyllables = pre ? syllabify(pre).length : 0;
  if (ending.fixed) {
    word = nfc(raw);
  } else if (ending.penult) {
    const n = syllabify(raw).length;
    word = accentSyllable(raw, Math.max(0, n - 2), 'auto');
  } else {
    word = recessive(raw, augmented && minFromPrefix ? prefixSyllables : 0);
  }
  if (contract) word = contractStemVowel(word, pre + nfd(stem), ending.spurious);
  word = stripLengthMarks(word);
  return fixFinalSigma(nfc(word));
}

/** Recessive accent that may not recede before syllable `minIndex`. */
function recessive(word, minIndex = 0) {
  const syls = syllabify(word);
  const n = syls.length;
  if (n <= 1) return accentRecessive(word);
  const ultimaLong = isLong(syls[n - 1], { final: true });
  let idx = n >= 3 && !ultimaLong ? n - 3 : n - 2;
  if (idx < minIndex) idx = Math.min(minIndex, n - 1);
  return accentSyllable(word, idx, idx === n - 3 ? 'acute' : 'auto');
}

const CONTRACT = {
  α: { ε: 'α', ει: 'ᾳ', η: 'α', ῃ: 'ᾳ', ο: 'ω', ου: 'ω', ω: 'ω', οι: 'ῳ' },
  ε: { ε: 'ει', ει: 'ει', η: 'η', ῃ: 'ῃ', ο: 'ου', ου: 'ου', ω: 'ω', οι: 'οι' },
  ο: { ε: 'ου', ει: 'οι', η: 'ω', ῃ: 'οι', ο: 'ου', ου: 'ου', ω: 'ω', οι: 'οι' },
};
const CONTRACT_SPURIOUS = { α: 'α', ε: 'ει', ο: 'ου' }; // stem vowel + spurious ει (infinitive)

/**
 * Contract the final stem vowel with the first vowel group of the ending.
 * `word` is accented; `stemPart` is the unaccented NFD prefix+stem whose last
 * character is the contracting vowel.
 */
function contractStemVowel(word, stemPart, spurious = false) {
  const syls = syllabify(word);
  const k = syllabify(stemPart).length - 1; // syllable holding the stem vowel
  const a = syls[k];
  const b = syls[k + 1];
  if (!a || !b) return word;
  const v = a.nucleus;
  const endingVowel = b.nucleus + (b.marks.includes(IOTA_SUB) ? IOTA_SUB : '');
  const table = CONTRACT[v];
  if (!table) return word;
  let result = spurious && endingVowel === 'ει' ? CONTRACT_SPURIOUS[v] : table[nfc(endingVowel)];
  if (!result) return word;
  result = nfd(result);
  const iota = result.includes(IOTA_SUB) ? IOTA_SUB : '';
  const nucleus = result.replace(IOTA_SUB, '');
  const accentOnStem = /[́͂]/.test(a.marks);
  const accentOnEnding = /[́͂]/.test(b.marks);
  let accent = '';
  if (accentOnStem) accent = CIRCUMFLEX;
  else if (accentOnEnding) accent = b.marks.includes(CIRCUMFLEX) ? CIRCUMFLEX : ACUTE;
  const breathing = (a.marks.match(/[̓̔]/g) ?? []).join('');
  const merged = { onset: a.onset, nucleus, marks: breathing + accent + iota, coda: b.coda };
  const out = [...syls.slice(0, k), merged, ...syls.slice(k + 2)];
  return nfc(out.map((s) => s.onset + s.nucleus.slice(0, -1) + s.nucleus.slice(-1) + s.marks + s.coda).join(''));
}

// ---------------------------------------------------------------------------
// εἰμί

const EIMI = {
  'P-I': { A: ['εἰμί', 'εἶ', 'ἐστί(ν)', 'ἐσμέν', 'ἐστέ', 'εἰσί(ν)'] },
  'I-I': { A: [['ἤμην', 'ἦν'], ['ἦς', 'ἦσθα'], ['ἦν'], ['ἦμεν', 'ἤμεθα'], ['ἦτε'], ['ἦσαν']] },
  'F-I': { M: ['ἔσομαι', 'ἔσῃ', 'ἔσται', 'ἐσόμεθα', 'ἔσεσθε', 'ἔσονται'] },
  'P-S': { A: ['ὦ', 'ᾖς', 'ᾖ', 'ὦμεν', 'ἦτε', 'ὦσι(ν)'] },
  'P-D': { A: ['ἴσθι', 'ἔστω', 'ἔστε', 'ἔστωσαν'] },
  'P-N': { A: ['εἶναι'] },
};

// ---------------------------------------------------------------------------
// Public conjugation API

/** All tense/voice/mood combinations the generator knows how to build. */
export const CONJUGATIONS = [
  { tense: 'P', voice: 'A', mood: 'I' }, { tense: 'P', voice: 'M', mood: 'I' },
  { tense: 'I', voice: 'A', mood: 'I' }, { tense: 'I', voice: 'M', mood: 'I' },
  { tense: 'F', voice: 'A', mood: 'I' }, { tense: 'F', voice: 'M', mood: 'I' }, { tense: 'F', voice: 'P', mood: 'I' },
  { tense: 'A', voice: 'A', mood: 'I' }, { tense: 'A', voice: 'M', mood: 'I' }, { tense: 'A', voice: 'P', mood: 'I' },
  { tense: 'X', voice: 'A', mood: 'I' }, { tense: 'X', voice: 'M', mood: 'I' },
  { tense: 'P', voice: 'A', mood: 'S' }, { tense: 'P', voice: 'M', mood: 'S' },
  { tense: 'A', voice: 'A', mood: 'S' }, { tense: 'A', voice: 'M', mood: 'S' }, { tense: 'A', voice: 'P', mood: 'S' },
  { tense: 'P', voice: 'A', mood: 'D' }, { tense: 'P', voice: 'M', mood: 'D' },
  { tense: 'A', voice: 'A', mood: 'D' }, { tense: 'A', voice: 'M', mood: 'D' }, { tense: 'A', voice: 'P', mood: 'D' },
  { tense: 'P', voice: 'A', mood: 'N' }, { tense: 'P', voice: 'M', mood: 'N' },
  { tense: 'A', voice: 'A', mood: 'N' }, { tense: 'A', voice: 'M', mood: 'N' }, { tense: 'A', voice: 'P', mood: 'N' },
];

/**
 * Generate a paradigm.
 * @param {object} desc  from analyzeVerb()
 * @param {{tense:string, voice:string, mood:string}} tvm
 * @returns {{ cells: {person:string|null, number:string|null, forms:string[]}[], note:string|null }}
 *   forms is empty when the generator has no answer for that cell.
 */
export function conjugate(desc, { tense, voice, mood }) {
  if (desc.kind !== 'omega' && desc.kind !== 'eimi') {
    return { cells: [], note: desc.reason ?? 'Not generated for this verb.' };
  }
  if (desc.kind === 'eimi') {
    const table = EIMI[`${tense}-${mood}`];
    const forms = table?.[voice] ?? (table && voice === 'P' && table.M ? table.M : null);
    if (!forms) return { cells: [], note: 'εἰμί has no forms in this tense/voice/mood.' };
    const persons = mood === 'D' ? IMPV_PERSONS : mood === 'N' ? [[null, null]] : PERSONS;
    return { cells: forms.map((f, i) => ({ person: persons[i][0], number: persons[i][1], forms: Array.isArray(f) ? f : [f] })), note: null };
  }

  const s = desc.stems;
  const pfx = desc.prefix;
  const mp = voice === 'M' || voice === 'P';
  const notes = [];
  let spec = null; // { stems: [..variants], endings, contract, augmented, persons }

  const noActive = desc.deponent && voice === 'A' && (tense === 'P' || tense === 'I');
  if (noActive) return { cells: [], note: `${desc.lemma} is deponent: no active forms in the present system.` };

  const finite = (endings) => (mood === 'D' ? IMPV_PERSONS : mood === 'N' ? [[null, null]] : PERSONS);

  switch (`${tense}${mood}`) {
    case 'PI': spec = { stems: [s.pres], endings: mp ? ENDINGS.presMP : ENDINGS.presAct, contract: desc.contract }; break;
    case 'II': spec = { stems: s.impf, endings: mp ? ENDINGS.impfMP : ENDINGS.impfAct, contract: desc.contract, augmented: true }; break;
    case 'PS': spec = { stems: [s.pres], endings: mp ? ENDINGS.subjMP : ENDINGS.subjAct, contract: desc.contract }; break;
    case 'PD': spec = { stems: [s.pres], endings: mp ? ENDINGS.impvPresMP : ENDINGS.impvPresAct, contract: desc.contract }; break;
    case 'PN': spec = { stems: [s.pres], endings: mp ? ENDINGS.infPresMP : ENDINGS.infPresAct, contract: desc.contract }; break;
    case 'FI':
      if (voice === 'P') {
        if (!s.aorP) return { cells: [], note: 'No aorist passive stem is known, so the future passive is not generated.' };
        spec = { stems: [s.aorP.unaug + 'ησ'], endings: ENDINGS.presMP };
      } else {
        if (!s.fut) return { cells: [], note: 'The future stem of this verb is not generated.' };
        if (!s.fut.voices.includes(voice)) return { cells: [], note: voice === 'A' ? `${desc.lemma} has a deponent (middle) future; use the middle voice.` : 'No middle future is generated for this verb.' };
        spec = { stems: [s.fut.stem], endings: mp ? ENDINGS.presMP : ENDINGS.presAct, contract: s.fut.contract };
      }
      break;
    case 'AI': case 'AS': case 'AD': case 'AN': {
      if (voice === 'P') {
        if (!s.aorP) return { cells: [], note: 'The aorist passive stem of this verb is not generated (irregular or unknown).' };
        const stems = mood === 'I' ? s.aorP.aug : [s.aorP.unaug];
        const endings = { I: ENDINGS.aorPass, S: ENDINGS.subjAorPass, D: ENDINGS.impvAorPass, N: ENDINGS.infAorPass }[mood];
        spec = { stems, endings, augmented: mood === 'I' };
        break;
      }
      if (!s.aor) return { cells: [], note: 'The aorist stem of this verb is not generated (liquid or irregular); attested forms only.' };
      if (!s.aor.voices.includes(voice)) {
        return { cells: [], note: voice === 'A' ? `${desc.lemma} has a middle (deponent) aorist; use the middle voice.` : 'No middle aorist is generated for this verb.' };
      }
      const aorSpecs = [s.aor, mood === 'I' || mood === 'D' ? s.aor.alt : null].filter(Boolean).map((a) => {
        const stems = mood === 'I' ? a.aug : [a.unaug];
        let endings;
        if (a.type === 1) endings = { I: mp ? ENDINGS.aor1Mid : ENDINGS.aor1Act, S: mp ? ENDINGS.subjMP : ENDINGS.subjAct, D: mp ? ENDINGS.impvAor1Mid : ENDINGS.impvAor1Act, N: mp ? ENDINGS.infAor1Mid : ENDINGS.infAor1Act }[mood];
        else endings = { I: mp ? ENDINGS.impfMP : ENDINGS.impfAct, S: mp ? ENDINGS.subjMP : ENDINGS.subjAct, D: mp ? ENDINGS.impvAor2Mid : ENDINGS.impvPresAct, N: mp ? ENDINGS.infAor2Mid : ENDINGS.infAor2Act }[mood];
        return { stems, endings, augmented: mood === 'I', type: a.type };
      });
      spec = aorSpecs[0];
      spec.extra = aorSpecs.slice(1);
      break;
    }
    case 'XI':
      if (mp) {
        if (!s.perfMP) return { cells: [], note: 'The perfect middle/passive is not generated for consonant stems; attested forms only.' };
        spec = { stems: [s.perfMP], endings: ENDINGS.perfMP };
      } else {
        if (!s.perf) return { cells: [], note: 'The perfect active is not generated for this stem type; attested forms only.' };
        spec = { stems: [s.perf], endings: ENDINGS.perfAct };
      }
      break;
    default:
      return { cells: [], note: 'This combination is not generated; attested forms only.' };
  }

  const persons = finite(spec.endings);
  const cells = persons.map(([person, number], i) => ({ person, number, forms: [] }));
  const emit = (sp) => {
    sp.stems.forEach((stem) => {
      sp.endings.forEach((ending, i) => {
        if (!cells[i]) return;
        let form = build({ prefix: pfx, stem, ending, contract: sp.contract ?? null, augmented: !!sp.augmented, minFromPrefix: true });
        if (!form) return;
        // Irregular oxytone second-aorist imperatives (εἰπέ, ἐλθέ, ...)
        if (sp.type === 2 && mood === 'D' && i === 0 && voice === 'A') {
          const bare = nfc(nfd(form).replace(/[̀́͂]/g, ''));
          const oxy = [...OXYTONE_IMPV].find((o) => nfc(nfd(o).replace(/[̀́͂]/g, '')) === bare);
          if (oxy) form = oxy;
        }
        if (!cells[i].forms.includes(form)) cells[i].forms.push(form);
      });
    });
  };
  emit(spec);
  for (const extra of spec.extra ?? []) emit(extra);
  if (spec.contract || desc.contract) notes.push('Contract verb: contracted forms shown.');
  return { cells, note: notes.length ? notes.join(' ') : null };
}

// ---------------------------------------------------------------------------
// Nouns: first and second declension

const NOUN_ENDINGS = {
  // [nomS, genS, datS, accS, nomP, genP, datP, accP] with quantity marks
  eta:   ['η', 'ης', 'ῃ', 'ην', 'αι', 'ων', 'αις', 'ᾱς'],
  alphaPure: ['ᾱ', 'ᾱς', 'ᾳ', 'ᾱν', 'αι', 'ων', 'αις', 'ᾱς'],
  alphaMixed: ['ᾰ', 'ης', 'ῃ', 'ᾰν', 'αι', 'ων', 'αις', 'ᾱς'],
  mascEta: ['ης', 'ου', 'ῃ', 'ην', 'αι', 'ων', 'αις', 'ᾱς'],
  mascAlpha: ['ᾱς', 'ου', 'ᾳ', 'ᾱν', 'αι', 'ων', 'αις', 'ᾱς'],
  os:    ['ος', 'ου', 'ῳ', 'ον', 'οι', 'ων', 'οις', 'ους'],
  on:    ['ον', 'ου', 'ῳ', 'ον', 'ᾰ', 'ων', 'οις', 'ᾰ'],
};
const NOUN_CELLS = [['N', 'S'], ['G', 'S'], ['D', 'S'], ['A', 'S'], ['N', 'P'], ['G', 'P'], ['D', 'P'], ['A', 'P']];

/**
 * Decline a first- or second-declension noun.
 * @param {string} lemma  nominative singular (accented)
 * @param {string} gender 'M' | 'F' | 'N'
 * @returns {{ cells: {case:string, number:string, forms:string[]}[], note:string|null }}
 */
export function decline(lemma, gender) {
  const L = nfd(lemma.trim());
  const B = stripAcc(L);
  let type = null;
  let stem = null;
  if (/ος$/.test(B) && gender !== 'N') { type = 'os'; stem = B.slice(0, -2); }
  else if (/ον$/.test(B) && gender === 'N') { type = 'on'; stem = B.slice(0, -2); }
  else if (/ης$/.test(B) && gender === 'M') { type = 'mascEta'; stem = B.slice(0, -2); }
  else if (/ας$/.test(B) && gender === 'M') { type = 'mascAlpha'; stem = B.slice(0, -2); }
  else if (/η$/.test(B) && gender === 'F') { type = 'eta'; stem = B.slice(0, -1); }
  else if (/α$/.test(B) && gender === 'F') {
    stem = B.slice(0, -1);
    const prev = stem.replace(/[̀-ͯ]/g, '').slice(-1);
    type = 'ειρ'.includes(prev) ? 'alphaPure' : 'alphaMixed';
  }
  if (!type) return { cells: [], note: 'Only first and second declension nouns are generated; attested forms only.' };
  const lemmaAccent = findAccent(L);
  if (lemmaAccent.index < 0) return { cells: [], note: 'The lemma carries no accent.' };
  let endings = NOUN_ENDINGS[type].map((e) => nfd(e));
  // ἀλήθεια, βασίλεια: an antepenult accent proves the nominative α is short.
  if (type === 'alphaPure' && lemmaAccent.index === lemmaAccent.count - 3) {
    endings = endings.map((e, i) => (i === 0 || i === 3 ? e.replace(MACRON, BREVE) : e));
  }
  // Infer the quantity of an accented penult from the lemma's accent shape.
  const lemmaSyls = syllabify(L);
  const nomEndingLong = isLong(lemmaSyls[lemmaSyls.length - 1], { final: true });
  let penultMark = '';
  if (lemmaAccent.index === lemmaAccent.count - 2) {
    if (lemmaAccent.kind === 'circumflex') penultMark = MACRON;
    else if (!nomEndingLong) penultMark = BREVE;
  }
  const oxytone = lemmaAccent.index === lemmaAccent.count - 1;
  const cells = NOUN_CELLS.map(([cs, num], i) => {
    const ending = endings[i];
    let raw = stem + ending;
    if (penultMark) raw = markSyllable(raw, lemmaAccent.index, penultMark);
    const isFirstDecl = type !== 'os' && type !== 'on';
    let form;
    const n = syllabify(raw).length;
    if (isFirstDecl && cs === 'G' && num === 'P') form = accentSyllable(raw, n - 1, 'circumflex');
    else if (oxytone) form = accentSyllable(raw, n - 1, cs === 'G' || cs === 'D' ? 'circumflex' : 'acute');
    else {
      let idx = lemmaAccent.index;
      const syls = syllabify(raw);
      const ultimaLong = isLong(syls[n - 1], { final: true });
      if (idx <= n - 3 && ultimaLong) idx = n - 2;
      if (idx < n - 3) idx = n - 3;
      form = accentSyllable(raw, idx, 'auto');
    }
    return { case: cs, number: num, forms: [fixFinalSigma(stripLengthMarks(form))] };
  });
  return { cells, note: null };
}

/** Add a quantity mark to the nucleus of syllable `index` of an NFD word. */
function markSyllable(word, index, mark) {
  const syls = syllabify(word);
  if (!syls[index]) return word;
  return syls.map((s, i) => s.onset + s.nucleus.slice(0, -1) + s.nucleus.slice(-1) + s.marks + (i === index ? mark : '') + s.coda).join('');
}

export { ENDINGS, PERSONS, IMPV_PERSONS, NOUN_CELLS };

// ---------------------------------------------------------------------------
// Fixed tables for the article and αὐτός (the two most frequent nominals).

const FIXED_NOMINALS = {
  'ὁ': {
    M: ['ὁ', 'τοῦ', 'τῷ', 'τόν', 'οἱ', 'τῶν', 'τοῖς', 'τούς'],
    F: ['ἡ', 'τῆς', 'τῇ', 'τήν', 'αἱ', 'τῶν', 'ταῖς', 'τάς'],
    N: ['τό', 'τοῦ', 'τῷ', 'τό', 'τά', 'τῶν', 'τοῖς', 'τά'],
  },
  'αὐτός': {
    M: ['αὐτός', 'αὐτοῦ', 'αὐτῷ', 'αὐτόν', 'αὐτοί', 'αὐτῶν', 'αὐτοῖς', 'αὐτούς'],
    F: ['αὐτή', 'αὐτῆς', 'αὐτῇ', 'αὐτήν', 'αὐταί', 'αὐτῶν', 'αὐταῖς', 'αὐτάς'],
    N: ['αὐτό', 'αὐτοῦ', 'αὐτῷ', 'αὐτό', 'αὐτά', 'αὐτῶν', 'αὐτοῖς', 'αὐτά'],
  },
  'οὗτος': {
    M: ['οὗτος', 'τούτου', 'τούτῳ', 'τοῦτον', 'οὗτοι', 'τούτων', 'τούτοις', 'τούτους'],
    F: ['αὕτη', 'ταύτης', 'ταύτῃ', 'ταύτην', 'αὗται', 'τούτων', 'ταύταις', 'ταύτας'],
    N: ['τοῦτο', 'τούτου', 'τούτῳ', 'τοῦτο', 'ταῦτα', 'τούτων', 'τούτοις', 'ταῦτα'],
  },
  'ἐκεῖνος': {
    M: ['ἐκεῖνος', 'ἐκείνου', 'ἐκείνῳ', 'ἐκεῖνον', 'ἐκεῖνοι', 'ἐκείνων', 'ἐκείνοις', 'ἐκείνους'],
    F: ['ἐκείνη', 'ἐκείνης', 'ἐκείνῃ', 'ἐκείνην', 'ἐκεῖναι', 'ἐκείνων', 'ἐκείναις', 'ἐκείνας'],
    N: ['ἐκεῖνο', 'ἐκείνου', 'ἐκείνῳ', 'ἐκεῖνο', 'ἐκεῖνα', 'ἐκείνων', 'ἐκείνοις', 'ἐκεῖνα'],
  },
  'ὅς': {
    M: ['ὅς', 'οὗ', 'ᾧ', 'ὅν', 'οἵ', 'ὧν', 'οἷς', 'οὕς'],
    F: ['ἥ', 'ἧς', 'ᾗ', 'ἥν', 'αἵ', 'ὧν', 'αἷς', 'ἅς'],
    N: ['ὅ', 'οὗ', 'ᾧ', 'ὅ', 'ἅ', 'ὧν', 'οἷς', 'ἅ'],
  },
};

/**
 * Decline any nominal the generator knows: fixed tables for the article and
 * common pronouns, rule-based first/second declension for nouns, and the
 * masculine/neuter of -ος adjectives.
 * @param {string} lemma
 * @param {string} pos   MorphGNT part of speech
 * @param {string} gender 'M' | 'F' | 'N'
 */
export function declineNominal(lemma, pos, gender) {
  const L = nfc(lemma.trim());
  const fixed = FIXED_NOMINALS[L];
  if (fixed) {
    const forms = fixed[gender];
    if (!forms) return { cells: [], note: `${L} has no ${gender} forms.` };
    return { cells: NOUN_CELLS.map(([cs, num], i) => ({ case: cs, number: num, forms: [forms[i]] })), note: null };
  }
  if (pos === 'N-') return decline(L, gender);
  if (pos === 'A-') {
    if (gender === 'M' && /ος$/.test(stripAcc(L))) return decline(L, 'M');
    if (gender === 'N' && /ος$/.test(stripAcc(L))) return decline(nfc(nfd(L).replace(/ς$/, 'ν')), 'N');
    return { cells: [], note: 'Feminine and third-declension adjective forms are not generated; attested forms only.' };
  }
  return { cells: [], note: 'This word class is not generated; attested forms only.' };
}
