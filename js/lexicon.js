// Vocabulary: glosses and New Testament frequencies for MorphGNT lemmas.
//
// The data file (data/lexicon.json, built by scripts/build-lexicon.mjs) maps
// each lemma to { g: gloss, h: dictionary headword, d: fuller definition,
// s: Strong's number, f: how often the lemma occurs in the SBLGNT }.

let entries = null;
let loading = null;

/** True once glosses are available. */
export function lexiconReady() {
  return entries !== null;
}

/**
 * Load the lexicon once. Resolves to true when glosses are available and
 * false when they could not be fetched (the app stays usable without them).
 */
export function loadLexicon() {
  if (entries) return Promise.resolve(true);
  if (loading) return loading;
  const embedded = globalThis.__ANAGNOSIS_LEXICON;
  if (embedded) {
    entries = embedded.entries ?? embedded;
    return Promise.resolve(true);
  }
  const url = typeof document !== 'undefined'
    ? new URL('data/lexicon.json', document.baseURI).href
    : 'data/lexicon.json';
  loading = fetch(url, { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => { entries = data.entries ?? data; return true; })
    .catch(() => false);
  return loading;
}

/**
 * Look a lemma up.
 * @returns {{ lemma:string, gloss:string|null, headword:string, definition:string|null,
 *             strongs:string|null, frequency:number }|null}
 */
export function entryFor(lemma) {
  if (!entries || !lemma) return null;
  const record = entries[lemma];
  if (!record) return null;
  return {
    lemma,
    gloss: record.g ?? null,
    headword: record.h ?? lemma,
    definition: record.d ?? null,
    strongs: record.s ?? null,
    frequency: record.f ?? 0,
  };
}

export function glossFor(lemma) {
  return entryFor(lemma)?.gloss ?? null;
}

/**
 * The first sense only, short enough to sit under a word while reading.
 * "the world, universe" → "the world"; "I destroy, lose, am perishing" → "I destroy".
 */
export function shortGloss(lemma) {
  const gloss = glossFor(lemma);
  if (!gloss) return null;
  const senses = gloss.split(/[,;]/)
    .map((s) => s.replace(/^\((?:[a-z]|[ivx]+)\)\s*/i, '').trim())
    .filter(Boolean);
  if (!senses.length) return null;
  // Keep adding senses while they still fit: "I offer, give" reads better
  // than "I offer" alone, and the first sense is not always the clearest.
  let out = senses[0];
  for (const sense of senses.slice(1)) {
    const next = `${out}, ${sense}`;
    if (next.length > 20) break;
    out = next;
  }
  if (out.length > 24) out = `${out.slice(0, 22).trimEnd()}…`;
  return out;
}

/**
 * How common a lemma is, as a band a learner can act on. The thresholds follow
 * the usual vocabulary-list cutoffs: words down to 50 occurrences are learned
 * first, 10 and above is standard second-year vocabulary, below that is rare.
 */
export function frequencyBand(frequency) {
  if (frequency >= 500) return { key: 'core', label: 'core vocabulary' };
  if (frequency >= 50) return { key: 'common', label: 'common' };
  if (frequency >= 10) return { key: 'known', label: 'worth learning' };
  if (frequency >= 3) return { key: 'rare', label: 'rare' };
  return { key: 'veryrare', label: frequency === 1 ? 'once in the NT' : 'very rare' };
}

/**
 * Distinct vocabulary of a passage, rarest first — the order in which a
 * reader is most likely to need help.
 * @returns {{ lemma:string, entry:object|null, count:number }[]}
 */
export function passageVocabulary(passage) {
  const counts = new Map();
  for (const verse of passage.verses) {
    for (const word of verse.words) {
      if (!word.lemma) continue;
      counts.set(word.lemma, (counts.get(word.lemma) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([lemma, count]) => ({ lemma, count, entry: entryFor(lemma) }))
    .sort((a, b) => (a.entry?.frequency ?? 0) - (b.entry?.frequency ?? 0) || a.lemma.localeCompare(b.lemma, 'el'));
}
