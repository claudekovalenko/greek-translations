#!/usr/bin/env node
// Builds data/lexicon.json: a gloss and a New Testament frequency for every
// lemma in the MorphGNT text.
//
// Glosses come from Jeffrey Dodson's Greek lexicon (public domain), converted
// from Beta Code. Dodson is keyed by Strong's numbers and follows older
// spelling conventions, so lemmas are matched through a chain of
// normalizations before falling back to a small table of known variants.
//
// Run `npm run fetch-data` first, then `npm run build-lexicon`.

import { readFile, writeFile } from 'node:fs/promises';
import { betaToUnicode } from './beta-code.mjs';
import { BOOKS } from '../js/books.js';
import { parseMorphGNT } from '../js/morphgnt.js';

const DODSON_URL = 'https://raw.githubusercontent.com/biblicalhumanities/Dodson-Greek-Lexicon/master/dodson.csv';
const root = new URL('../', import.meta.url);

// Lemmas Dodson spells differently from the SBLGNT (mostly Koine vs Byzantine
// orthography, and deponents listed under their active form).
const ALIASES = {
  'Μωϋσῆς': 'Μωσῆς', 'Καφαρναούμ': 'Καπερναούμ', 'Ναζαρέθ': 'Ναζαρέτ',
  'Μαριάμ': 'Μαρία', 'Σαμαρίτης': 'Σαμαρείτης', 'Σαμαρῖτις': 'Σαμαρεῖτις',
  'τεσσεράκοντα': 'τεσσαράκοντα', 'τεσσερακονταετής': 'τεσσαρακονταετής',
  'ἐλεάω': 'ἐλεέω', 'ἱνατί': 'ἵνα τί', 'κύκλῳ': 'κύκλος',
  'εὐκοπώτερος': 'εὔκοπος', 'στάδιος': 'στάδιον', 'ὀψία': 'ὄψιος',
  'σπλάγχνον': 'σπλάγχνα', 'εἰδωλόθυτον': 'εἰδωλόθυτος', 'γαμίζω': 'γαμίσκω',
  'πρωΐ': 'πρωΐα', 'ῥαββουνί': 'ῥαββονί', 'Βεελζεβούλ': 'Βεελζεβούβ',
  'ἐνώπιον': 'ἐνώπιος', 'Ἰωάνης': 'Ἰωάννης', 'κραβάττος': 'κράβαττος',
  'νοσσία': 'νοσσιά', 'πανοπλία': 'πανοπλίας', 'χρεία': 'χρεῖα',
};

const csv = await fetchDodson();
const entries = parseDodson(csv);
const index = buildIndex(entries);
const { frequency, lemmas } = await corpusStats();

const lexicon = {};
const missing = [];
for (const lemma of lemmas) {
  const entry = lookup(index, lemma);
  const record = { f: frequency.get(lemma) };
  if (entry) {
    record.g = entry.gloss;
    if (entry.headword !== lemma) record.h = entry.headword;
    const long = entry.long?.replace(/\.$/, '');
    if (long && long !== entry.gloss) record.d = entry.long;
    if (entry.strongs) record.s = entry.strongs;
  } else {
    missing.push([lemma, frequency.get(lemma)]);
  }
  lexicon[lemma] = record;
}

const out = {
  source: "Jeffrey Dodson's Greek Lexicon (public domain); frequencies counted in the SBLGNT",
  entries: lexicon,
};
await writeFile(new URL('data/lexicon.json', root), JSON.stringify(out));
const glossed = Object.values(lexicon).filter((r) => r.g).length;
const covered = Object.values(lexicon).reduce((n, r) => n + (r.g ? r.f : 0), 0);
const total = Object.values(lexicon).reduce((n, r) => n + r.f, 0);
console.log(`${glossed} of ${lemmas.length} lemmas glossed (${(100 * covered / total).toFixed(2)}% of word occurrences).`);
missing.sort((a, b) => b[1] - a[1]);
console.log('Most frequent lemmas without a gloss:', missing.slice(0, 12).map(([l, n]) => `${l} (${n})`).join(', ') || 'none');

// ---------------------------------------------------------------------------

async function fetchDodson() {
  const cache = new URL('data/dodson.csv', root);
  try {
    return await readFile(cache, 'utf8');
  } catch {
    const res = await fetch(DODSON_URL);
    if (!res.ok) throw new Error(`Could not download the Dodson lexicon: HTTP ${res.status}`);
    const text = await res.text();
    await writeFile(cache, text);
    return text;
  }
}

function parseDodson(text) {
  const out = [];
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    const [strongs, , beta, brief, long] = cells;
    if (!beta || !brief) continue;
    const headword = betaToUnicode(beta);
    out.push({
      strongs: strongs?.replace(/^0+/, '') ?? '',
      headword,
      lemma: headword.split(',')[0].trim(),
      gloss: brief,
      long,
    });
  }
  return out;
}

function buildIndex(entries) {
  const exact = new Map();
  const loose = new Map();
  for (const e of entries) {
    if (!e.lemma) continue;
    if (!exact.has(e.lemma)) exact.set(e.lemma, e);
    const key = fold(e.lemma);
    if (!loose.has(key)) loose.set(key, e);
  }
  return { exact, loose };
}

/** Accent-, breathing- and case-insensitive key. */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
    .toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, '');
}

/** Candidate spellings for a MorphGNT lemma, most faithful first. */
function* candidates(lemma) {
  yield lemma;
  const alias = ALIASES[lemma];
  if (alias) yield alias;
  // Movable nu / sigma: "οὕτω(ς)" is both οὕτω and οὕτως.
  const movable = lemma.match(/^(.*)\((.)\)$/);
  if (movable) { yield movable[1] + movable[2]; yield movable[1]; }
  // Deponents are listed under the active form.
  const dep = [
    [/έομαι$/, 'έω'], [/άομαι$/, 'άω'], [/όομαι$/, 'όω'],
    [/ίσταμαι$/, 'ίστημι'], [/ομαι$/, 'ω'],
  ];
  for (const [re, rep] of dep) if (re.test(lemma)) yield lemma.replace(re, rep);
}

function lookup({ exact, loose }, lemma) {
  for (const form of candidates(lemma)) {
    if (exact.has(form)) return exact.get(form);
  }
  for (const form of candidates(lemma)) {
    const hit = loose.get(fold(form));
    if (hit) return hit;
  }
  return null;
}

async function corpusStats() {
  const frequency = new Map();
  for (const book of BOOKS) {
    let text;
    try {
      text = await readFile(new URL(`data/morphgnt/${book.file}`, root), 'utf8');
    } catch {
      throw new Error('data/morphgnt/ is missing. Run `npm run fetch-data` first.');
    }
    for (const w of parseMorphGNT(text)) frequency.set(w.lemma, (frequency.get(w.lemma) ?? 0) + 1);
  }
  return { frequency, lemmas: [...frequency.keys()].sort() };
}
