// Help with parsing, for the walk-through and the game: clues about where to
// look in a form, the pattern to compare it with, and a full conjugation chart
// with memory tips. Patterns come from the paradigm generator, so they are the
// same forms the rest of the app checks against.

import { analyzeVerb, conjugate, declineNominal, PERSONS, IMPV_PERSONS, NOUN_CELLS } from './paradigm.js';
import { decodeCode, FIELDS } from './parsing.js';
import { wordClass } from './walk-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Help comes in this many steps before "Show me". */
export const HELP_STEPS = 2;

// ---------------------------------------------------------------------------
// Step 1: clues

/**
 * Where to look in this form, as a few short sentences. They point at the
 * signs the form actually carries; the learner still has to read them.
 * @param {object} word
 * @param {object[]} verseWords  the verse, for finding an agreeing article
 * @param {number} wi            the word's index in the verse
 * @param {string} [headword]    dictionary headword, which shows a noun's gender
 */
export function clues(word, verseWords = [], wi = 0, headword = '') {
  const p = decodeCode(word.code);
  const cls = wordClass(word);
  const out = [];
  if (cls === 'verb') {
    if (word.lemma === 'εἰμί') {
      out.push('This is a form of εἰμί, "to be". It is irregular: compare it with the εἰμί pattern below rather than with endings.');
      return out;
    }
    if (p.mood === 'I' && 'IAY'.includes(p.tense)) out.push('Front: it has an augment, ἐ‑ or a lengthened first vowel (ἀ/ἐ → ἠ, ο → ω). An augment means past time, and only the indicative has one.');
    else if (p.mood === 'I') out.push('Front: no augment, so it is not a past tense (not imperfect or aorist).');
    if (p.tense === 'X' || p.tense === 'Y') out.push('Front: the first consonant is doubled with ε (λέ‑λυκα). That reduplication is the sign of the perfect.');
    if (p.tense === 'A' && p.voice === 'P') out.push('Middle: look for θη or θε before the ending, the sign of the aorist passive (ἐ‑λύ‑θη).');
    else if (p.tense === 'F' && p.voice === 'P') out.push('Middle: look for θησ, the sign of the future passive (λυ‑θήσ‑εται).');
    else if (p.tense === 'F') out.push('Middle: look for σ just before the ending (λύ‑σ‑ει), the sign of the future. Stems in λ, μ, ν, ρ use ε instead (μενῶ).');
    else if (p.tense === 'A') out.push('Middle: a first aorist shows σα (ἔ‑λυ‑σα‑ν); a second aorist has a changed stem with imperfect-style endings (ἔ‑λαβ‑ον, from λαμβάνω).');
    else if (p.tense === 'X' && p.voice === 'A') out.push('Middle: κα before the ending is typical of the perfect active (λέλυ‑κα‑μεν).');
    else if (p.tense === 'P' && p.mood === 'I') out.push('Middle: no σ, no θη: just the present stem.');
    if (p.mood === 'S') out.push('Mood: the connecting vowel is long, ω or η (λύ‑ω‑μεν, λύ‑η‑τε). That makes it subjunctive, often after ἵνα or ἐάν.');
    if (p.mood === 'D') out.push('Mood: a command ending (‑ε, ‑ετε, ‑έτω, ‑σον, ‑σατε, ‑θητι). That makes it imperative.');
    if (p.mood === 'N') out.push('Mood: an infinitive ending (‑ειν, ‑σαι, ‑ναι, ‑σθαι). Infinitives have no person or number.');
    if (p.mood === 'P') out.push('Mood: participle markers ‑ντ‑ (λύοντος), ‑μεν‑ (λυόμενος), ‑σας/‑σαντ‑, ‑θεις/‑θεντ‑. Then read case, number and gender from the last letters, as with an adjective.');
    if (p.mood !== 'P' && p.mood !== 'N') {
      if ((p.voice === 'M' || p.voice === 'P') && !(p.tense === 'A' && p.voice === 'P')) {
        out.push('Ending: ‑μαι, ‑ῃ, ‑ται, ‑μεθα, ‑σθε, ‑νται or ‑μην, ‑ου, ‑το, ‑ντο are middle/passive endings.');
      } else {
        out.push('Ending: match the last letters to a row of the pattern to find person and number.');
      }
    }
    return out;
  }
  if (cls === 'article') {
    out.push('Articles beginning with τ‑ are every form except ὁ, ἡ, οἱ, αἱ. ‑ου/‑ῳ are genitive/dative masculine or neuter, ‑ης/‑ῃ feminine, ‑ων and ‑οις/‑αις plural.');
    return out;
  }
  // Nouns, adjectives, pronouns: the article is the best clue.
  for (let k = wi - 1; k >= Math.max(0, wi - 4); k--) {
    const w = verseWords[k];
    if (w?.pos !== 'RA') continue;
    const a = decodeCode(w.code);
    if (a.case === p.case && a.number === p.number && (a.gender === p.gender || !p.gender)) {
      out.push(`The article ${w.word} just before it is ${FIELDS.case.options[a.case]} ${FIELDS.number.options[a.number]} ${FIELDS.gender.options[a.gender]}, and an article always agrees with its word.`);
      break;
    }
  }
  if (!out.length) {
    out.push('Look at the last letters and find them in the pattern below. Careful: ‑ον can be accusative masculine or nominative/accusative neuter, and ‑α can be feminine singular or neuter plural.');
  }
  const art = cls === 'noun' && headword.match(/, (ὁ|ἡ|τό)(?=$|[,;\s])/u);
  if (art) {
    const g = art[1];
    out.push(`A noun's gender never changes: the dictionary entry "${headword}" gives it the article ${g}, so it is ${{ ὁ: 'masculine', ἡ: 'feminine', τό: 'neuter' }[g]}.`);
  } else if (cls === 'adjective' || word.pos === 'RR' || word.pos === 'RD') {
    out.push('An adjective or pronoun takes the gender of the word it goes with: find that word and check its gender.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2: the pattern

const PN = { '1S': '1 sg', '2S': '2 sg', '3S': '3 sg', '1P': '1 pl', '2P': '2 pl', '3P': '3 pl' };
const CN = { NS: 'nom sg', GS: 'gen sg', DS: 'dat sg', AS: 'acc sg', NP: 'nom pl', GP: 'gen pl', DP: 'dat pl', AP: 'acc pl' };

const verbCache = new Map();
function verbDesc(lemma) {
  if (!verbCache.has(lemma)) {
    let d = null;
    try { d = analyzeVerb(lemma); } catch { d = null; }
    verbCache.set(lemma, d);
  }
  return verbCache.get(lemma);
}

const TENSE_NAME = { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', X: 'perfect', Y: 'pluperfect' };
const MOOD_NAME = { I: 'indicative', S: 'subjunctive', D: 'imperative', N: 'infinitive', O: 'optative' };

/**
 * The pattern to compare a word with: the model verb λύω (or εἰμί) in the
 * word's own tense, voice and mood, with the word's own verb beside it when
 * the generator can make it; for nominals, the word's own declension or a
 * model. Rows are labelled; the matching row is not marked unless `reveal`.
 */
export function pattern(word, { reveal = false } = {}) {
  const p = decodeCode(word.code);
  const cls = wordClass(word);
  if (cls === 'verb') {
    if (p.mood === 'P') return participlePattern(p, reveal);
    const voice = p.voice === 'P' && 'PIXY'.includes(p.tense) ? 'M' : p.voice;
    const tvm = { tense: p.tense, voice, mood: p.mood };
    const isEimi = word.lemma === 'εἰμί';
    const model = isEimi ? 'εἰμί' : 'λύω';
    const m = conjugate(verbDesc(model), tvm);
    if (!m.cells.length) return null;
    let own = null;
    if (!isEimi && word.lemma !== 'λύω') {
      const d = verbDesc(word.lemma);
      const r = d ? conjugate(d, tvm) : null;
      if (r?.cells.some((c) => c.forms.length)) own = r;
    }
    const persons = p.mood === 'D' ? IMPV_PERSONS : p.mood === 'N' ? [[null, null]] : PERSONS;
    const key = `${p.person}${p.number}`;
    const rows = m.cells.map((c, i) => ({
      label: p.mood === 'N' ? 'infinitive' : PN[`${persons[i][0]}${persons[i][1]}`],
      model: c.forms,
      own: own?.cells[i]?.forms ?? [],
      hit: reveal && (p.mood === 'N' || `${persons[i][0]}${persons[i][1]}` === key),
    }));
    const vname = voice === 'M' && 'PIXY'.includes(p.tense) ? 'middle/passive' : FIELDS.voice.options[voice];
    return {
      title: `${TENSE_NAME[p.tense]} ${vname} ${MOOD_NAME[p.mood] ?? ''}`.trim(),
      modelName: model,
      ownName: own ? word.lemma : null,
      rows: markEndings(rows),
    };
  }
  // Nominals
  const gender = p.gender ?? 'M';
  let r = null;
  try { r = declineNominal(word.lemma, word.pos, gender); } catch { r = null; }
  let name = word.lemma;
  if (!r?.cells?.some((c) => c.forms.length)) {
    const fallback = cls === 'pronoun' || cls === 'article' ? ['ὁ', 'RA'] : { M: ['λόγος', 'N-'], F: ['ἀρχή', 'N-'], N: ['ἔργον', 'N-'] }[gender];
    r = declineNominal(fallback[0], fallback[1], gender);
    name = fallback[1] === 'RA' ? 'the article' : fallback[0];
    if (!r?.cells?.some((c) => c.forms.length)) return null;
  }
  const key = `${p.case}${p.number}`;
  const rows = NOUN_CELLS.map(([c, n], i) => ({ label: CN[`${c}${n}`], model: r.cells[i]?.forms ?? [], own: [], hit: reveal && `${c}${n}` === key }));
  const third = name !== word.lemma && cls === 'noun';
  return {
    title: `${FIELDS.gender.options[gender]}${name !== word.lemma ? ' (model)' : ''}`,
    modelName: name,
    ownName: null,
    rows: markEndings(rows),
    note: third ? 'This word follows a different (probably third declension) pattern; the model shows how case endings line up. Third declension: ‑ος gen sg, ‑ι dat sg, ‑α acc sg, ‑ες nom pl, ‑σι(ν) dat pl.' : null,
  };
}

function participlePattern(p, reveal) {
  const rows = [
    ['present active', 'λύων, λύουσα, λῦον', 'λύοντος'],
    ['present middle/passive', 'λυόμενος, ‑η, ‑ον', 'λυομένου'],
    ['future active', 'λύσων, λύσουσα, λῦσον', 'λύσοντος'],
    ['aorist active', 'λύσας, λύσασα, λῦσαν', 'λύσαντος'],
    ['aorist middle', 'λυσάμενος, ‑η, ‑ον', 'λυσαμένου'],
    ['aorist passive', 'λυθείς, λυθεῖσα, λυθέν', 'λυθέντος'],
    ['perfect active', 'λελυκώς, λελυκυῖα, λελυκός', 'λελυκότος'],
    ['perfect middle/passive', 'λελυμένος, ‑η, ‑ον', 'λελυμένου'],
  ];
  const want = `${TENSE_NAME[p.tense]} ${p.voice === 'A' ? 'active' : p.tense === 'A' ? (p.voice === 'P' ? 'passive' : 'middle') : p.tense === 'F' ? 'active' : 'middle/passive'}`;
  return {
    title: 'participles of λύω (nominative sg m, f, n · genitive sg m)',
    modelName: 'λύω',
    ownName: null,
    rows: rows.map(([label, nom, gen]) => ({ label, model: [nom], own: [gen], hit: reveal && label === want })),
    ownHeader: 'gen sg',
    note: 'Participles decline like adjectives: ‑ος/‑η/‑ον types like ἀγαθός, ‑ων/‑ας/‑εις types like third declension in the masculine and neuter, first declension in the feminine.',
  };
}

/** Split each form into stem and ending: the ending is what differs across the pattern. */
function markEndings(rows) {
  const forms = rows.map((r) => r.model[0]).filter(Boolean);
  const clusters = (s) => s.normalize('NFD').match(/\P{M}\p{M}*/gu) ?? [];
  const base = (c) => c.normalize('NFD')[0].toLowerCase();
  const split = (list) => {
    const cl = list.map((f) => clusters(f.replace(/\(.*\)$/, '')));
    let k = 0;
    while (cl.length > 1 && cl.every((c) => c[k] && base(c[k]) === base(cl[0][k]))) k++;
    return Math.max(0, Math.min(k, ...cl.map((c) => c.length - 1)));
  };
  const k = forms.length > 1 ? split(forms) : 0;
  return rows.map((r) => ({
    ...r,
    model: r.model.map((f) => {
      const cl = clusters(f);
      return { stem: cl.slice(0, k).join('').normalize('NFC'), ending: cl.slice(k).join('').normalize('NFC') };
    }),
  }));
}

// ---------------------------------------------------------------------------
// HTML

/** The help shown under the parse buttons, for steps 1 and 2. */
export function helpHtml(word, level, { verseWords = [], wi = 0, headword = '' } = {}) {
  if (!level) return '';
  let html = `<div class="wk-help"><h4>💡 Where to look</h4><ul>${clues(word, verseWords, wi, headword).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  if (level >= 2) html += patternHtml(word);
  return `${html}</div>`;
}

/** A pattern table; with `reveal`, the row matching the word is highlighted. */
export function patternHtml(word, { reveal = false } = {}) {
  const pat = pattern(word, { reveal });
  if (!pat) return '';
  const own = pat.ownName || pat.ownHeader;
  const rows = pat.rows.map((r) => `<tr class="${r.hit ? 'hit' : ''}"><th>${esc(r.label)}</th>
    <td class="greek">${r.model.map((f) => `${esc(f.stem)}<b>${esc(f.ending)}</b>`).join(' / ') || '—'}</td>
    ${own ? `<td class="greek">${esc(r.own.join(' / ')) || '—'}</td>` : ''}</tr>`).join('');
  return `<div class="wk-pattern"><p class="wk-pattern-title">Compare: <b>${esc(pat.title)}</b></p>
    <div class="wk-pattern-scroll"><table><thead><tr><th></th><th class="greek">${esc(pat.modelName)}</th>${own ? `<th class="greek">${esc(pat.ownName ?? pat.ownHeader)}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    ${pat.note ? `<p class="hint">${esc(pat.note)}</p>` : ''}
    ${reveal ? '' : '<p class="hint">Find the row whose ending matches your word. Endings are in bold.</p>'}</div>`;
}

// ---------------------------------------------------------------------------
// The full chart

const TIPS = [
  ['Present, future and perfect take the primary endings', '‑ω, ‑εις, ‑ει, ‑ομεν, ‑ετε, ‑ουσι(ν). Chant them: "o, eis, ei, omen, ete, ousi".'],
  ['Middle/passive primary endings', '‑μαι, ‑σαι, ‑ται, ‑μεθα, ‑σθε, ‑νται ("my, sigh, tie…"). After the vowel ‑εσαι contracts to ‑ῃ.'],
  ['Past tenses (with an augment) take the secondary endings', 'active ‑ν, ‑ς, ‑(ε), ‑μεν, ‑τε, ‑ν; middle ‑μην, ‑σο (→ ‑ου), ‑το, ‑μεθα, ‑σθε, ‑ντο. Same skeleton, vowels peeled off.'],
  ['Tense signs', 'augment = past · σ = future and first aorist · θη = aorist passive · θησ = future passive · reduplication + κ = perfect.'],
  ['Build the aorist', 'augment + stem + σα + ending: ἐ‑λυ‑σα‑μεν "we loosed". A second aorist swaps σα for a new stem: ἐ‑λάβ‑ομεν.'],
  ['Subjunctive', 'lengthen the vowel: ο → ω, ε → η, ει → ῃ. λύομεν "we loose" → λύωμεν "let us loose".'],
  ['Person at a glance', '‑μεν / ‑μεθα is always "we"; ‑τε / ‑σθε is "you (all)"; ‑ουσι, ‑νται, ‑ντο, ‑σαν are "they". In the imperfect ‑ον can be "I" or "they": context decides.'],
];

export function chartHtml() {
  const d = verbDesc('λύω');
  const cols = (list) => list.map(([t, v, label]) => ({ label, cells: conjugate(d, { tense: t, voice: v, mood: 'I' }).cells }));
  const table = (caption, list) => {
    const c = cols(list);
    const head = c.map((x) => `<th>${x.label}</th>`).join('');
    const body = PERSONS.map(([pp, n], i) => `<tr><th>${PN[`${pp}${n}`]}</th>${c.map((x) => `<td>${esc(x.cells[i]?.forms.join(' / ') ?? '')}</td>`).join('')}</tr>`).join('');
    return `<div class="wk-pattern-scroll"><table class="wk-cheat-table wk-chart"><caption>${caption}</caption><thead><tr><th></th>${head}</tr></thead><tbody class="greek">${body}</tbody></table></div>`;
  };
  const eimi = verbDesc('εἰμί');
  const eimiCols = [['P', 'present'], ['I', 'imperfect'], ['F', 'future']].map(([t, label]) => ({ label, cells: conjugate(eimi, { tense: t, voice: 'A', mood: 'I' }).cells })).filter((x) => x.cells.length);
  const eimiTable = `<div class="wk-pattern-scroll"><table class="wk-cheat-table wk-chart"><caption>εἰμί "I am"</caption><thead><tr><th></th>${eimiCols.map((x) => `<th>${x.label}</th>`).join('')}</tr></thead><tbody class="greek">${PERSONS.map(([pp, n], i) => `<tr><th>${PN[`${pp}${n}`]}</th>${eimiCols.map((x) => `<td>${esc(x.cells[i]?.forms.join(' / ') ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<h2>Conjugation chart: λύω, "I loose"</h2>
    <ol class="wk-tips">${TIPS.map(([h, t]) => `<li><b>${esc(h)}:</b> ${esc(t)}</li>`).join('')}</ol>
    ${table('Indicative active', [['P', 'A', 'present'], ['I', 'A', 'imperfect'], ['F', 'A', 'future'], ['A', 'A', 'aorist'], ['X', 'A', 'perfect']])}
    ${table('Indicative middle and passive', [['P', 'M', 'present m/p'], ['I', 'M', 'imperfect m/p'], ['A', 'M', 'aorist middle'], ['A', 'P', 'aorist passive'], ['F', 'P', 'future passive'], ['X', 'M', 'perfect m/p']])}
    ${eimiTable}
    <p class="hint">Subjunctive: λύω, λύῃς, λύῃ, λύωμεν, λύητε, λύωσι(ν) (aorist λύσω, λύσῃς…). Imperative: λῦε, λυέτω, λύετε, λυέτωσαν (aorist λῦσον, λυσάτω…). Infinitives: λύειν, λύεσθαι, λῦσαι, λυθῆναι, λελυκέναι.</p>`;
}
