// Greek text utilities: normalization, comparison, syllabification and
// accentuation. Everything works on NFD (decomposed) strings internally so
// that diacritics are individual combining characters.

export const ACUTE = '́';
export const GRAVE = '̀';
export const CIRCUMFLEX = '͂';
export const SMOOTH = '̓';
export const ROUGH = '̔';
export const DIAERESIS = '̈';
export const IOTA_SUB = 'ͅ';
export const MACRON = '̄'; // used internally to mark a long α/ι/υ
export const BREVE = '̆';  // used internally to mark a short α/ι/υ

const ACCENTS = new Set([ACUTE, GRAVE, CIRCUMFLEX]);
const COMBINING = /[̀-ͯͅ]/g;
const VOWELS = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
const DIPHTHONGS = new Set(['αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ου', 'ηυ', 'ωυ']);

// Critical-apparatus sigla used in the SBLGNT text column.
const SIGLA = /[⸀-⸏⟦⟧]/g;
const PUNCT = /[,.;·:!?()\[\]«»"'’—–\-]/g;

export const nfd = (s) => s.normalize('NFD');
export const nfc = (s) => s.normalize('NFC');

/** Remove critical sigla and punctuation, keeping letters and diacritics. */
export function stripPunctuation(s) {
  return nfc(s).replace(SIGLA, '').replace(PUNCT, '').trim();
}

export function stripSigla(s) {
  return s.replace(SIGLA, '');
}

/** Remove all diacritics (accents, breathings, iota subscript, diaeresis). */
export function stripDiacritics(s) {
  return nfc(nfd(s).replace(COMBINING, ''));
}

/** Remove the accent marks only, keeping breathings and iota subscript. */
export function stripAccents(s) {
  return nfc(nfd(s).replace(/[̀́͂]/g, ''));
}

/** Movable-nu notation "ἐστί(ν)" → ["ἐστί", "ἐστίν"]. */
export function expandMovable(s) {
  const m = s.match(/^(.*)\((.)\)$/);
  if (!m) return [s];
  return [m[1], m[1] + m[2]];
}

/**
 * Normalize a form for answer comparison.
 * loose mode: lowercase, no diacritics, final sigma folded, punctuation gone.
 * strict mode: lowercase, NFC, grave folded to acute, punctuation gone.
 */
export function normalizeForCompare(s, { strict = false } = {}) {
  let t = stripPunctuation(s).toLowerCase().replace(/\s+/g, '');
  t = t.replace(/ς/g, 'σ');
  if (strict) {
    t = nfd(t).replace(/[̄̆]/g, '').replace(/̀/g, ACUTE);
    // Put combining marks into a canonical order so NFC composes identically.
    return nfc(t);
  }
  return stripDiacritics(t);
}

/** True if the user's answer matches any of the accepted keys. */
export function formsMatch(answer, keys, opts = {}) {
  const a = normalizeForCompare(answer, opts);
  if (!a) return false;
  for (const k of keys) {
    for (const v of expandMovable(k)) {
      if (normalizeForCompare(v, opts) === a) return true;
    }
  }
  return false;
}

/** Final sigma: turn a trailing σ into ς. */
export function fixFinalSigma(s) {
  return s.replace(/σ$/, 'ς').replace(/σ(?=\(ν\)$)/, 'ς');
}

// ---------------------------------------------------------------------------
// Syllabification

/**
 * Split an NFD word into syllables described as
 * { onset, nucleus (base vowels), marks (combining chars on the nucleus), coda }.
 * Consonant assignment between syllables is approximate: a single consonant
 * goes to the next syllable, a cluster is split after its first letter. That
 * is enough for accent placement, which only needs vowel groups.
 */
export function syllabify(word) {
  const s = nfd(word);
  const chars = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (COMBINING.test(ch)) {
      COMBINING.lastIndex = 0;
      if (chars.length) chars[chars.length - 1].marks += ch;
      continue;
    }
    COMBINING.lastIndex = 0;
    chars.push({ ch, marks: '' });
  }
  const isVowel = (c) => c && VOWELS.has(c.ch.toLowerCase());
  const nuclei = []; // arrays of char indices
  let i = 0;
  while (i < chars.length) {
    if (!isVowel(chars[i])) { i++; continue; }
    const group = [i];
    const next = chars[i + 1];
    if (
      next && isVowel(next) &&
      DIPHTHONGS.has(chars[i].ch.toLowerCase() + next.ch.toLowerCase()) &&
      !next.marks.includes(DIAERESIS) &&
      // A breathing on the second vowel means two syllables, not a diphthong
      // (e.g. προϊστημι, but in NFD breathing sits on the second letter of a
      // diphthong, so only diaeresis truly separates).
      true
    ) {
      group.push(i + 1);
      i += 2;
    } else {
      i += 1;
    }
    nuclei.push(group);
  }
  const syllables = [];
  for (let n = 0; n < nuclei.length; n++) {
    const start = n === 0 ? 0 : syllables[n - 1].end;
    const nucleusStart = nuclei[n][0];
    const nucleusEnd = nuclei[n][nuclei[n].length - 1] + 1;
    let end;
    if (n === nuclei.length - 1) end = chars.length;
    else {
      const nextNucleus = nuclei[n + 1][0];
      const consonants = nextNucleus - nucleusEnd;
      end = consonants <= 1 ? nucleusEnd : nucleusEnd + 1;
    }
    const onset = chars.slice(start, nucleusStart).map((c) => c.ch + c.marks).join('');
    const nucleus = chars.slice(nucleusStart, nucleusEnd).map((c) => c.ch).join('');
    const marks = chars.slice(nucleusStart, nucleusEnd).map((c) => c.marks).join('');
    const coda = chars.slice(nucleusEnd, end).map((c) => c.ch + c.marks).join('');
    syllables.push({ onset, nucleus, marks, coda, end });
  }
  return syllables;
}

/** Is this syllable's vowel long for accentuation purposes? */
export function isLong(syl, { final = false } = {}) {
  const v = syl.nucleus.toLowerCase();
  if (syl.marks.includes(MACRON)) return true;
  if (syl.marks.includes(BREVE)) return false;
  if (syl.marks.includes(IOTA_SUB)) return true;
  if (v.length === 2) {
    // Word-final -αι and -οι count as short for accent (not -αις/-οις; optative not generated).
    if (final && !syl.coda && (v === 'αι' || v === 'οι')) return false;
    return true;
  }
  if (v === 'η' || v === 'ω') return true;
  if (v === 'ε' || v === 'ο') return false;
  // α, ι, υ: unknown quantity, treated as short unless marked.
  return false;
}

function joinSyllables(syls) {
  return syls.map((s) => s.onset + s.nucleus.split('').map((ch, i) => ch + (i === s.nucleus.length - 1 ? s.marks : '')).join('') + s.coda).join('');
}

/** Remove accent marks from a syllable's marks string. */
function withoutAccent(marks) {
  return marks.split('').filter((m) => !ACCENTS.has(m)).join('');
}

/** Insert an accent mark into a marks string in canonical order (breathing, accent, iota sub). */
function withAccent(marks, accent) {
  const rest = withoutAccent(marks).replace(/[̄̆]/g, '');
  const breathing = rest.match(/[̓̔̈]/g)?.join('') ?? '';
  const iota = rest.includes(IOTA_SUB) ? IOTA_SUB : '';
  return breathing + accent + iota;
}

/**
 * Place an accent on syllable `index` (0-based from the start) following the
 * general rules: circumflex is allowed only on a long penult before a short
 * ultima (or on a long ultima when requested); otherwise acute.
 * `kind` may be 'acute', 'circumflex' or 'auto'.
 */
export function accentSyllable(word, index, kind = 'auto') {
  const syls = syllabify(word);
  if (!syls.length) return nfc(word);
  const n = syls.length;
  const idx = Math.max(0, Math.min(index, n - 1));
  for (const s of syls) s.marks = withoutAccent(s.marks).replace(/[̄̆]/g, '') + (s.marks.match(/[̄̆]/g)?.join('') ?? '');
  let accent = ACUTE;
  if (kind === 'circumflex') accent = CIRCUMFLEX;
  else if (kind === 'auto') {
    const ultimaLong = isLong(syls[n - 1], { final: true });
    if (idx === n - 2 && isLong(syls[idx]) && !ultimaLong) accent = CIRCUMFLEX;
    else if (idx === n - 1 && n === 1 && isLong(syls[idx], { final: true })) accent = CIRCUMFLEX;
  }
  syls[idx].marks = withAccent(syls[idx].marks, accent);
  for (const s of syls) s.marks = s.marks.replace(/[̄̆]/g, '');
  return nfc(joinSyllables(syls));
}

/**
 * Recessive accent (the verb rule): as far from the end as allowed.
 * Antepenult if the ultima is short, otherwise penult.
 */
export function accentRecessive(word) {
  const syls = syllabify(word);
  const n = syls.length;
  if (n === 0) return nfc(word);
  if (n === 1) return accentSyllable(word, 0, 'auto');
  const ultimaLong = isLong(syls[n - 1], { final: true });
  if (n >= 3 && !ultimaLong) return accentSyllable(word, n - 3, 'acute');
  return accentSyllable(word, n - 2, 'auto');
}

/** Strip the internal length markers (macron/breve) from a word. */
export function stripLengthMarks(s) {
  return nfc(nfd(s).replace(/[̄̆]/g, ''));
}

/** Which syllable (0-based) carries the accent, or -1. Also returns its kind. */
export function findAccent(word) {
  const syls = syllabify(word);
  for (let i = 0; i < syls.length; i++) {
    for (const m of syls[i].marks) {
      if (ACCENTS.has(m)) return { index: i, kind: m === CIRCUMFLEX ? 'circumflex' : 'acute', count: syls.length };
    }
  }
  return { index: -1, kind: null, count: syls.length };
}

export { VOWELS, DIPHTHONGS };
