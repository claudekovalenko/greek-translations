// Guided walk-through: the logic behind walk.html, kept free of the DOM so it
// can be tested. A session is one passage; the learner meets each word in
// order, names its word class, parses it if it is inflected, then writes the
// verse in English. At the end the verses are put together as a translation.

import { BOOK_BY_ID } from './books.js';
import { decodeCode, drillFields, describeParse } from './parsing.js';

// ---------------------------------------------------------------------------
// Word classes

export const CLASSES = {
  verb: 'Verb',
  noun: 'Noun',
  adjective: 'Adjective',
  article: 'Article',
  pronoun: 'Pronoun',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  adverb: 'Adverb',
  particle: 'Particle',
};

const CLASS_BY_POS = {
  'V-': 'verb',
  'N-': 'noun',
  'A-': 'adjective',
  'RA': 'article',
  'RD': 'pronoun',
  'RI': 'pronoun',
  'RP': 'pronoun',
  'RR': 'pronoun',
  'P-': 'preposition',
  'C-': 'conjunction',
  'D-': 'adverb',
  'X-': 'particle',
  'I-': 'particle',
};

/** The word class a learner is asked to name, from a MorphGNT part of speech. */
export function wordClass(word) {
  return CLASS_BY_POS[word.pos] ?? 'particle';
}

/** A fuller name for the answer, e.g. "verb (participle)", "pronoun (relative)". */
export function classLabel(word) {
  const cls = wordClass(word);
  const p = decodeCode(word.code);
  if (cls === 'verb' && p.mood === 'P') return 'verb (participle)';
  if (cls === 'verb' && p.mood === 'N') return 'verb (infinitive)';
  const sub = { RD: 'demonstrative', RI: 'interrogative / indefinite', RP: 'personal', RR: 'relative' }[word.pos];
  if (sub) return `pronoun (${sub})`;
  if (word.pos === 'I-') return 'interjection';
  return cls;
}

/**
 * The fields to parse for this word in a walk: the drill fields that actually
 * carry a value (indeclinable words can lack some). Articles are only parsed
 * when the learner asks for it.
 */
export function walkFields(word, { parseArticles = false } = {}) {
  if (wordClass(word) === 'article' && !parseArticles) return [];
  const p = decodeCode(word.code);
  return drillFields(word).filter((f) => p[f] != null);
}

// ---------------------------------------------------------------------------
// What a parse means for translation

const FIELD_WORD = {
  case: { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' },
  number: { S: 'singular', P: 'plural' },
  gender: { M: 'masculine', F: 'feminine', N: 'neuter' },
};

const SUBJECT = {
  '1S': 'I', '2S': 'you (one person)', '3S': 'he / she / it',
  '1P': 'we', '2P': 'you (more than one)', '3P': 'they',
};

const IMPERATIVE_SUBJECT = {
  '2S': 'a command to one person: "(you) …!"',
  '2P': 'a command to several people: "(you all) …!"',
  '3S': 'a command in the third person: "let him / her / it …"',
  '3P': 'a command in the third person: "let them …"',
};

const INDICATIVE = {
  P: 'Present indicative: action going on now. With λύω, "loose": "looses" or "is loosing".',
  I: 'Imperfect: ongoing or repeated action in the past. With λύω: "was loosing", "used to loose".',
  F: 'Future: action still to come. With λύω: "will loose".',
  A: 'Aorist indicative: a simple past event. With λύω: "loosed".',
  X: 'Perfect: a completed action whose result still stands. With λύω: "has loosed".',
  Y: 'Pluperfect: a completed action whose result stood in the past. With λύω: "had loosed".',
};

const MOOD = {
  S: 'Subjunctive: something possible, intended or hoped for, often after ἵνα ("so that") or ἐάν ("if"). "may …", "should …"; in the first person plural "let us …".',
  D: 'Imperative: a command or request.',
  O: 'Optative: a wish. "may it be …" (rare in the New Testament).',
  N: 'Infinitive: "to …". It can also complete another verb ("wants to …") or, with the article, act as a noun.',
  P: 'Participle: a verbal adjective. "…ing", "the one who …", or a clause such as "while / after / because he …". It agrees with the noun or pronoun it goes with in case, number and gender.',
};

const ASPECT = {
  P: 'Present outside the indicative is not about time: it views the action as ongoing or repeated.',
  A: 'Aorist outside the indicative is not about past time: it views the action as a single, whole event.',
  X: 'Perfect: the action is complete and its result continues.',
};

const VOICE = {
  A: 'Active: the subject does the action.',
  M: 'Middle: the subject acts on or for itself. Many verbs have only middle forms (ἔρχομαι, γίνομαι) and are translated as active.',
  P: 'Passive: the subject receives the action. "is / was …ed". The doer, if named, is often ὑπό + genitive.',
};

const CASE = {
  N: 'Nominative: the subject of the verb, or what the subject is ("… is a prophet").',
  G: 'Genitive: usually "of …": possession, source, description. Also follows prepositions such as ἐκ, ἀπό, διά ("through"), ὑπό ("by").',
  D: 'Dative: "to / for …" (the indirect object), or "by / with …" (means). Also follows ἐν and σύν.',
  A: 'Accusative: the direct object of the verb. Also follows prepositions such as εἰς, πρός, διά ("because of").',
  V: 'Vocative: someone being addressed directly. "O Lord", "brothers, …".',
};

const CLASS_NOTES = {
  article: 'The article "the". It agrees with its noun in case, number and gender, so it tells you that noun\'s case. Greek uses it where English may not ("the God"), and it can turn an adjective, participle or phrase into a noun ("the [ones] in Christ").',
  adjective: 'Describes a noun and agrees with it in case, number and gender. With an article and no noun it stands in for one: "the good [person]".',
  preposition: 'Starts a phrase with the noun that follows. The case of that noun decides the meaning of some prepositions (διά + genitive "through", + accusative "because of").',
  conjunction: 'Joins words or clauses. Notice it: it tells you how this clause relates to the one before ("and", "but", "for", "so that", "because").',
  adverb: 'Modifies a verb, an adjective or the whole clause: how, when, where.',
  particle: 'A small word that adds emphasis, negation or tone. Negatives: οὐ with the indicative, μή with the other moods.',
};

const PRONOUN_NOTES = {
  RP: 'Personal pronoun: I, you, he, she, it, we, they. In the nominative it adds emphasis, because the verb already contains its subject. αὐτός after a noun can mean "himself / the same".',
  RR: 'Relative pronoun: "who, which, that". It takes its gender and number from the word it refers back to, and its case from its job in its own clause.',
  RD: 'Demonstrative pronoun: "this" (οὗτος) or "that" (ἐκεῖνος). Alone it can mean "this man", "these things".',
  RI: 'Interrogative "who? what? why?" (τίς, accented) or indefinite "someone, something, a certain" (τις, unaccented).',
};

/**
 * Plain-English pointers on how this word's form shapes its translation.
 * @returns {string[]}
 */
export function renderingHints(word) {
  const cls = wordClass(word);
  const p = decodeCode(word.code);
  const hints = [];
  if (cls === 'verb') {
    const key = `${p.person ?? ''}${p.number ?? ''}`;
    if (p.mood === 'D' && IMPERATIVE_SUBJECT[key]) hints.push(`Imperative, ${IMPERATIVE_SUBJECT[key]}`);
    else if (SUBJECT[key]) hints.push(`The subject is built into the ending: "${SUBJECT[key]}", unless a nominative noun names it.`);
    if (p.mood === 'I') {
      if (INDICATIVE[p.tense]) hints.push(INDICATIVE[p.tense]);
    } else {
      if (MOOD[p.mood] && p.mood !== 'D') hints.push(MOOD[p.mood]);
      if (ASPECT[p.tense]) hints.push(ASPECT[p.tense]);
      else if (p.tense === 'F') hints.push('Future: the action is still to come.');
    }
    if (word.lemma === 'εἰμί') {
      hints.push('εἰμί, "to be", links the subject to what it is. A nominative after it is the predicate ("the Word was God"), not an object.');
    } else if (VOICE[p.voice]) {
      let v = VOICE[p.voice];
      if ((p.voice === 'M' || p.voice === 'P') && 'PIXY'.includes(p.tense ?? '')) {
        v += ' In this tense middle and passive forms look the same, so context decides.';
      }
      hints.push(v);
    }
    if (p.mood === 'P' && CASE[p.case]) hints.push(`It is ${FIELD_WORD.case[p.case]}, so it goes with a ${FIELD_WORD.case[p.case]} word (or stands on its own as "the one who …").`);
    return hints;
  }
  if (cls === 'pronoun' && PRONOUN_NOTES[word.pos]) hints.push(PRONOUN_NOTES[word.pos]);
  else if (CLASS_NOTES[cls]) hints.push(CLASS_NOTES[cls]);
  if (CASE[p.case] && cls !== 'article') hints.push(CASE[p.case]);
  else if (cls === 'article' && p.case) hints.push(`Here it is ${FIELD_WORD.case[p.case]} ${FIELD_WORD.number[p.number] ?? ''} ${FIELD_WORD.gender[p.gender] ?? ''}`.replace(/\s+/g, ' ').trim() + ': look for the word it belongs to.');
  return hints;
}

// ---------------------------------------------------------------------------
// Sessions

/** A word as stored in a walk session (only what the walk needs). */
export function slimWord(w) {
  return { text: w.text, word: w.word, pos: w.pos, code: w.code, lemma: w.lemma };
}

export function newSession({ label, verses, now = Date.now(), id }) {
  return {
    id: id ?? `w${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label,
    created: now,
    updated: now,
    verses: verses.map((v) => ({ b: v.b, c: v.c, v: v.v, words: v.words.map(slimWord) })),
    at: { v: 0, w: 0 },
    answers: {},
    translations: verses.map(() => ''),
    opts: { askClass: true, parseArticles: false },
    streak: 0,
    best: 0,
    finished: null,
  };
}

export const answerKey = (vi, wi) => `${vi}.${wi}`;

export function answerFor(session, vi, wi) {
  return session.answers[answerKey(vi, wi)] ?? null;
}

/**
 * Where the learner is on a word:
 *   'class'   — name the word class
 *   'parse'   — identify the parsing fields
 *   'summary' — read what the form means, then move on
 */
export function wordStage(session, vi, wi) {
  const word = session.verses[vi]?.words[wi];
  if (!word) return null;
  const a = answerFor(session, vi, wi) ?? {};
  if (session.opts.askClass && !a.cls) return 'class';
  const fields = walkFields(word, session.opts);
  if (fields.length && !a.solved && !a.revealed) return 'parse';
  return 'summary';
}

/** True once the learner has finished with a word. */
export function wordDone(session, vi, wi) {
  return !!answerFor(session, vi, wi)?.done;
}

/** Counts for the progress bar and the final summary. */
export function progress(session) {
  let words = 0, done = 0, classAsked = 0, classRight = 0, parsed = 0, parsedRight = 0;
  session.verses.forEach((verse, vi) => {
    verse.words.forEach((word, wi) => {
      words++;
      const a = answerFor(session, vi, wi);
      if (!a) return;
      if (a.done) done++;
      if (a.cls) { classAsked++; if (a.clsOk) classRight++; }
      if (a.firstTry != null) { parsed++; if (a.firstTry) parsedRight++; }
    });
  });
  const translated = session.translations.filter((t) => t?.trim()).length;
  return { words, done, classAsked, classRight, parsed, parsedRight, verses: session.verses.length, translated };
}

// ---------------------------------------------------------------------------
// Points, levels and streaks

export const POINTS = { cls: 10, parse: 20, verse: 30 };
export const LEVEL_SIZE = 100;

/** Experience points, derived from the answers so they can never drift. */
export function score(session) {
  const p = progress(session);
  return p.classRight * POINTS.cls + p.parsedRight * POINTS.parse + p.translated * POINTS.verse;
}

export function level(xp) {
  return { level: Math.floor(xp / LEVEL_SIZE) + 1, into: xp % LEVEL_SIZE, size: LEVEL_SIZE };
}

/** Record a first-try result: a right answer extends the streak, a wrong one ends it. */
export function recordStreak(session, right) {
  session.streak = right ? (session.streak ?? 0) + 1 : 0;
  session.best = Math.max(session.best ?? 0, session.streak);
  return session.streak;
}

/** The position after the current one: next word, the verse's translation step, or the next verse. */
export function nextPosition(session, { v, w }) {
  const verse = session.verses[v];
  if (!verse) return null;
  if (w < verse.words.length) return { v, w: w + 1 }; // w === length is the translate step
  if (v + 1 < session.verses.length) return { v: v + 1, w: 0 };
  return null;
}

export function prevPosition(session, { v, w }) {
  if (w > 0) return { v, w: w - 1 };
  if (v > 0) return { v: v - 1, w: session.verses[v - 1].words.length };
  return null;
}

// ---------------------------------------------------------------------------
// The translation

export function verseLabel(session, verse) {
  const book = BOOK_BY_ID.get(verse.b);
  return `${book?.abbr ?? ''} ${verse.c}:${verse.v}`.trim();
}

/** Verse numbers as they appear inside the translation: "16", or "4:1" where a chapter starts. */
function verseMarks(session) {
  const multi = new Set(session.verses.map((v) => v.c)).size > 1;
  return session.verses.map((verse, i) => {
    const first = i === 0 || session.verses[i - 1].c !== verse.c;
    return multi && first ? `${verse.c}:${verse.v}` : String(verse.v);
  });
}

/** The learner's translation as plain text, one paragraph with verse numbers. */
export function translationText(session, { date = new Date(session.finished ?? session.updated) } = {}) {
  const marks = verseMarks(session);
  const body = session.verses
    .map((_, i) => `${marks[i]} ${session.translations[i]?.trim() || '[not translated]'}`)
    .join(' ');
  return `${session.label}\n\n${body}\n\nMy translation, ${formatDate(date)}. Greek text: SBLGNT.\n`;
}

/** Markdown: the translation, optionally followed by the Greek and the word-by-word notes. */
export function translationMarkdown(session, { greek = false, notes = false, gloss = () => null } = {}) {
  const marks = verseMarks(session);
  const out = [`# ${session.label}`, ''];
  out.push(session.verses.map((_, i) => `<sup>${marks[i]}</sup> ${session.translations[i]?.trim() || '_[not translated]_'}`).join(' '), '');
  out.push(`_My translation, ${formatDate(new Date(session.finished ?? session.updated))}. Greek text: SBLGNT._`, '');
  if (greek || notes) {
    session.verses.forEach((verse, vi) => {
      out.push(`## ${verseLabel(session, verse)}`, '');
      if (greek) out.push(`> ${verse.words.map((w) => w.text).join(' ')}`, '');
      if (notes) {
        out.push('| Greek | Lexical form | Class | Parsing | Meaning | |', '| --- | --- | --- | --- | --- | --- |');
        verse.words.forEach((w, wi) => {
          const a = answerFor(session, vi, wi);
          const mark = a?.firstTry === true ? '✓' : a?.firstTry === false || a?.revealed ? '✗' : '';
          const parse = walkFields(w, { parseArticles: true }).length ? describeParse(w) : '';
          out.push(`| ${w.word} | ${w.lemma} | ${classLabel(w)} | ${parse} | ${(gloss(w.lemma) ?? '').replace(/\|/g, '/')} | ${mark} |`);
        });
        out.push('');
      }
      if (notes || greek) out.push(`**My translation:** ${session.translations[vi]?.trim() || '_[not translated]_'}`, '');
    });
  }
  return out.join('\n');
}

export function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fileSlug(label) {
  return label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'translation';
}
