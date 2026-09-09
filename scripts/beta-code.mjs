// Beta Code → Unicode Greek, enough of the TLG scheme for the Dodson lexicon.
// Build-time only: the app ships the converted lexicon.

const LETTERS = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι',
  k: 'κ', l: 'λ', m: 'μ', n: 'ν', c: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ',
  t: 'τ', u: 'υ', f: 'φ', x: 'χ', y: 'ψ', w: 'ω', v: 'ϝ',
};
const MARKS = { ')': '̓', '(': '̔', '/': '́', '\\': '̀', '=': '͂', '+': '̈', '|': 'ͅ' };
// Combining marks in the order NFC expects them.
const MARK_ORDER = ['̓', '̔', '̈', '́', '̀', '͂', 'ͅ'];

export function betaToUnicode(input) {
  let out = '';
  let i = 0;
  while (i < input.length) {
    let capital = false;
    if (input[i] === '*') { capital = true; i++; }
    // After a capital marker the diacritics come before the letter.
    let marks = '';
    while (capital && MARKS[input[i]]) { marks += MARKS[input[i]]; i++; }
    const ch = input[i];
    const base = LETTERS[ch?.toLowerCase()];
    if (!base) { out += ch ?? ''; i++; continue; }
    i++;
    while (MARKS[input[i]]) { marks += MARKS[input[i]]; i++; }
    let letter = base;
    if (base === 'σ' && !LETTERS[input[i]?.toLowerCase()]) letter = 'ς';
    if (capital) letter = letter.toUpperCase();
    out += (letter + MARK_ORDER.filter((m) => marks.includes(m)).join('')).normalize('NFC');
  }
  return out;
}
