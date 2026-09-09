// Export of the project as Markdown, JSON or a printable HTML fragment.

import { BOOK_BY_ID } from './books.js';
import { describeParse, isInflected } from './parsing.js';
import { verseText } from './morphgnt.js';
import { wordKey } from './state.js';
import { passageVocabulary, entryFor } from './lexicon.js';

function refOf(verse) {
  const book = BOOK_BY_ID.get(verse.b);
  return `${book ? book.abbr : 'Text'} ${verse.c}:${verse.v}`;
}

export function toMarkdown(state) {
  const lines = [];
  lines.push('# Greek translation notes', '');
  lines.push(`_Exported ${new Date().toISOString().slice(0, 10)}. Greek text: SBLGNT. Morphology: MorphGNT (CC BY-SA)._`, '');
  for (const passage of state.passages) {
    lines.push(`## ${passage.label}`, '');
    for (const verse of passage.verses) {
      lines.push(`### ${passage.plain ? passage.label + ' ' + verse.v : refOf(verse)}`, '');
      lines.push(verseText(verse), '');
      lines.push(verse.translation?.trim() ? verse.translation.trim() : '_(no translation yet)_', '');
      if (verse.note?.trim()) lines.push(`> ${verse.note.trim().replace(/\n/g, '\n> ')}`, '');
      const notes = [];
      verse.words.forEach((w, i) => {
        const d = state.drills[wordKey(verse, i)];
        if (!d || !isInflected(w)) return;
        notes.push(`- **${w.word}** — ${w.lemma}, ${describeParse(w)} ${d.correct ? '✓' : `✗ (you said: ${d.givenText ?? '—'})`}`);
      });
      if (notes.length) lines.push('Parsing:', '', ...notes, '');
    }
  }
  for (const passage of state.passages) {
    if (passage.plain) continue;
    const vocab = passageVocabulary(passage).filter((r) => r.entry?.gloss);
    if (!vocab.length) continue;
    lines.push(`## Vocabulary — ${passage.label}`, '');
    lines.push('| Word | Meaning | Here | In the NT |', '| --- | --- | ---: | ---: |');
    for (const { lemma, count, entry } of vocab) {
      const star = state.vocab?.[lemma] ? ' ★' : '';
      lines.push(`| ${entry.headword}${star} | ${entry.gloss} | ${count} | ${entry.frequency} |`);
    }
    lines.push('');
  }

  const deck = Object.entries(state.vocab ?? {});
  if (deck.length) {
    lines.push('## Review deck', '');
    for (const [lemma, card] of deck.sort((a, b) => (a[1].box ?? 0) - (b[1].box ?? 0))) {
      const entry = entryFor(lemma);
      lines.push(`- ${entry?.headword ?? lemma} — ${entry?.gloss ?? '—'} (box ${(card.box ?? 0) + 1}${card.seen ? `, ${card.right}/${card.seen} recalled` : ''})`);
    }
    lines.push('');
  }

  const paradigms = Object.entries(state.paradigms);
  if (paradigms.length) {
    lines.push('## Paradigm drills', '');
    for (const [key, p] of paradigms) {
      const [lemma, tvm] = key.split('|');
      lines.push(`- ${lemma} (${tvm}): ${p.correct}/${p.total} correct`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function toJSON(state) {
  return JSON.stringify(state, null, 2);
}

/** Verses as plain interlinear text: Greek line, then translation. */
export function toPlainText(state) {
  const out = [];
  for (const passage of state.passages) {
    out.push(passage.label.toUpperCase(), '');
    for (const verse of passage.verses) {
      out.push(`${verse.c}:${verse.v}  ${verseText(verse)}`);
      out.push(`      ${verse.translation?.trim() || '…'}`, '');
    }
  }
  return out.join('\n');
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
