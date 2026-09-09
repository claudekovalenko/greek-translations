// Anagnosis — application UI.

import { BOOK_BY_ID } from './books.js';
import { parseReference, formatReference } from './refs.js';
import { loadBook, registerPartial, loadedWords } from './datasource.js';
import { parseMorphGNT, groupVerses, selectVerses } from './morphgnt.js';
import { FIELDS, decodeCode, drillFields, checkParse, describeParse, posLabel, isInflected, MP_IDENTICAL_TENSES } from './parsing.js';
import { analyzeVerb, conjugate, declineNominal, CONJUGATIONS, PERSONS, IMPV_PERSONS, NOUN_CELLS } from './paradigm.js';
import { formsMatch, stripPunctuation } from './greek.js';
import { loadState, saveState, clearState, emptyState, wordKey, verseKey, uid, scoreSummary } from './state.js';
import { toMarkdown, toJSON, toPlainText, download, copyText } from './export.js';
import { SAMPLE_REF, SAMPLE_TEXT } from './sample.js';
import { loadLexicon, lexiconReady, entryFor, shortGloss, frequencyBand, passageVocabulary } from './lexicon.js';

const state = loadState();
const ui = { open: null, tab: 'parse' }; // open: { passageId, verseIndex, wordIndex }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const els = {
  passages: $('#passages'),
  status: $('#status'),
  exportStatus: $('#export-status'),
  refForm: $('#ref-form'),
  refInput: $('#ref-input'),
};

// ---------------------------------------------------------------------------
// Boot

init();

async function init() {
  bindRail();
  bindPwa();
  applySettings();
  render();
  if (!state.passages.length) await loadSample();
  // Glosses arrive after the first paint; redraw once they do.
  const ok = await loadLexicon();
  if (ok) render();
  else setStatus('English glosses could not be loaded. Everything else still works.', 'error');
}

// ---------------------------------------------------------------------------
// PWA: service worker, install prompt, update notice, compact rail on phones

function bindPwa() {
  const narrow = matchMedia('(max-width: 900px)');
  const more = $('#rail-more');
  const syncRail = () => { more.open = !narrow.matches; };
  syncRail();
  narrow.addEventListener('change', syncRail);

  let deferredPrompt = null;
  const installBtn = $('#install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // A waiting worker after an update means new files are ready.
    const notify = () => { $('#update-toast').hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) notify();
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) notify();
      });
    });
  }).catch(() => { /* offline features unavailable; the app still works */ });
  $('#update-reload').addEventListener('click', () => location.reload());
  $('#update-dismiss').addEventListener('click', () => { $('#update-toast').hidden = true; });
}

async function loadSample() {
  const words = parseMorphGNT(SAMPLE_TEXT);
  registerPartial(words);
  const verses = groupVerses(words);
  addPassage({ label: SAMPLE_REF, bookId: 4, verses, sample: true });
  setStatus('Loaded John 3:16-17 as a starting point. Add any passage above.');
}

// ---------------------------------------------------------------------------
// Rail: passage loader, options, export

function bindRail() {
  els.refForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.refInput.value.trim();
    if (!text) return;
    await addReference(text);
  });

  $('#ref-remove').addEventListener('click', () => {
    const text = els.refInput.value.trim();
    if (!text) { setStatus('Type the reference you want to remove.', 'error'); return; }
    removeReference(text);
  });

  $('#paste-btn').addEventListener('click', () => {
    const text = $('#paste-text').value.trim();
    if (!text) { setStatus('Paste some Greek text first.', 'error'); return; }
    const label = $('#paste-label').value.trim() || 'Pasted text';
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const verses = lines.map((line, i) => ({
      b: 0, c: 0, v: i + 1,
      words: line.split(/\s+/).map((t) => ({ pos: '--', code: '--------', text: t, word: stripPunctuation(t), norm: '', lemma: '' })),
    }));
    addPassage({ label, bookId: 0, verses, plain: true });
    $('#paste-text').value = '';
    $('#paste-label').value = '';
    setStatus(`Added "${label}" (${verses.length} line${verses.length === 1 ? '' : 's'}).`);
  });

  $('#opt-hints').addEventListener('change', (e) => { state.settings.hints = e.target.checked; applySettings(); saveState(state); });
  $('#opt-strict').addEventListener('change', (e) => { state.settings.strict = e.target.checked; saveState(state); });
  $('#opt-interlinear').addEventListener('change', (e) => {
    state.settings.interlinear = e.target.checked;
    applySettings();
    saveState(state);
  });

  $$('[data-export]').forEach((btn) => btn.addEventListener('click', () => doExport(btn.dataset.export)));
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.version !== 1 || !Array.isArray(data.passages)) throw new Error('not a backup');
      Object.assign(state, emptyState(), data, {
        settings: { ...emptyState().settings, ...(data.settings ?? {}) },
        openVocab: data.openVocab ?? {},
      });
      saveState(state, { immediate: true });
      ui.open = null;
      applySettings();
      render();
      setExportStatus(`Restored ${data.passages.length} passage${data.passages.length === 1 ? '' : 's'}.`);
    } catch {
      setExportStatus('That file is not an Anagnosis backup.', 'error');
    }
    e.target.value = '';
  });
  $('#clear-btn').addEventListener('click', () => {
    if (!confirm('Remove all passages, translations and drill results from this browser?')) return;
    clearState();
    Object.assign(state, loadState());
    ui.open = null;
    render();
    setExportStatus('Cleared.');
  });
  $('#help-btn').addEventListener('click', () => $('#help').showModal());
  // Saves are debounced, so flush them before the page goes away — closing a
  // tab right after answering a card must not lose the answer.
  const flush = () => saveState(state, { immediate: true });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.open) { closeDrill(); }
  });
}

function applySettings() {
  $('#opt-hints').checked = !!state.settings.hints;
  $('#opt-strict').checked = !!state.settings.strict;
  $('#opt-interlinear').checked = !!state.settings.interlinear;
  document.body.classList.toggle('hints', !!state.settings.hints);
  document.body.classList.toggle('interlinear', !!state.settings.interlinear);
}

async function addReference(text) {
  let ref;
  try {
    ref = parseReference(text);
  } catch (err) {
    setStatus(err.message, 'error');
    return;
  }
  setStatus(`Loading ${ref.label}…`, 'busy');
  els.refForm.querySelector('button').disabled = true;
  try {
    const { words, source } = await loadBook(ref.book.id, { onStatus: (m) => setStatus(m, 'busy') });
    const verses = selectVerses(groupVerses(words), ref);
    if (!verses.length) throw new Error(`${ref.label} has no verses in the SBLGNT. Check the verse numbers.`);
    addPassage({ label: ref.label, bookId: ref.book.id, verses });
    els.refInput.value = '';
    const from = { remote: 'downloaded from MorphGNT', cache: 'from the browser cache', local: 'from the local data folder', embedded: 'from the built-in text', memory: '' }[source];
    setStatus(`Added ${ref.label}: ${verses.length} verse${verses.length === 1 ? '' : 's'}${from ? ' (' + from + ')' : ''}.`);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    els.refForm.querySelector('button').disabled = false;
  }
}

/** Take the verses of a reference back out, wherever they sit. */
function removeReference(text) {
  let ref;
  try {
    ref = parseReference(text);
  } catch (err) {
    setStatus(err.message, 'error');
    return;
  }
  const matches = (v) => {
    if (v.b !== ref.book.id) return false;
    if (v.c < ref.chapter || v.c > ref.endChapter) return false;
    if (v.c === ref.chapter && ref.verse != null && v.v < ref.verse) return false;
    if (v.c === ref.endChapter && ref.endVerse != null && v.v > ref.endVerse) return false;
    return true;
  };
  const doomed = state.passages.flatMap((p) => p.verses.filter(matches));
  if (!doomed.length) {
    setStatus(`${ref.label} is not among your passages.`, 'error');
    return;
  }
  const written = doomed.filter((v) => v.translation?.trim() || v.note?.trim()).length;
  if (written && !confirm(`Remove ${doomed.length} verse${doomed.length === 1 ? '' : 's'}? ${written} ${written === 1 ? 'has a translation that' : 'have translations that'} will be deleted.`)) return;

  for (const passage of state.passages) {
    const keep = [];
    for (const verse of passage.verses) {
      if (!matches(verse)) { keep.push(verse); continue; }
      verse.words.forEach((_, wi) => {
        delete state.drills[wordKey(verse, wi)];
        delete state.revealed[wordKey(verse, wi)];
      });
      forgetVerse(verse);
    }
    if (keep.length !== passage.verses.length) {
      passage.verses = keep;
      relabel(passage);
    }
  }
  const emptied = state.passages.filter((p) => !p.verses.length);
  emptied.forEach((p) => delete state.openVocab[p.id]);
  state.passages = state.passages.filter((p) => p.verses.length);
  ui.open = null;
  els.refInput.value = '';
  saveState(state);
  render();
  setStatus(`Removed ${doomed.length} verse${doomed.length === 1 ? '' : 's'} (${ref.label}).`);
}

function forgetVerse(verse) {
  delete state.collapsed[verseKey(verse)];
  delete state.verseGloss[verseKey(verse)];
}

/** Keep a passage's heading honest after verses are taken out of it. */
function relabel(passage) {
  if (passage.plain || !passage.verses.length) return;
  const book = BOOK_BY_ID.get(passage.bookId);
  if (!book) return;
  const first = passage.verses[0];
  const last = passage.verses[passage.verses.length - 1];
  passage.label = formatReference({
    book, chapter: first.c, verse: first.v, endChapter: last.c, endVerse: last.v,
  });
}

function addPassage({ label, bookId, verses, plain = false, sample = false }) {
  const passage = {
    id: uid(),
    label,
    bookId,
    plain,
    sample,
    verses: verses.map((v) => ({ b: v.b, c: v.c, v: v.v, words: v.words.map(stripWord), translation: '', note: '' })),
  };
  state.passages.push(passage);
  saveState(state);
  render();
  const el = $(`[data-passage="${passage.id}"]`);
  if (el && state.passages.length > 1) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function stripWord(w) {
  return { pos: w.pos, code: w.code, text: w.text, word: w.word, norm: w.norm, lemma: w.lemma };
}

function setStatus(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = `status ${kind}`;
}

function setExportStatus(msg, kind = '') {
  els.exportStatus.textContent = msg;
  els.exportStatus.className = `status ${kind}`;
  if (msg) setTimeout(() => { if (els.exportStatus.textContent === msg) els.exportStatus.textContent = ''; }, 4000);
}

async function doExport(kind) {
  if (!state.passages.length && kind !== 'print') { setExportStatus('Nothing to export yet.', 'error'); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'md') { download(`greek-notes-${stamp}.md`, toMarkdown(state), 'text/markdown'); setExportStatus('Markdown downloaded.'); }
  else if (kind === 'txt') { download(`greek-notes-${stamp}.txt`, toPlainText(state)); setExportStatus('Text file downloaded.'); }
  else if (kind === 'json') { download(`anagnosis-backup-${stamp}.json`, toJSON(state), 'application/json'); setExportStatus('Backup downloaded.'); }
  else if (kind === 'copy') { const ok = await copyText(toMarkdown(state)); setExportStatus(ok ? 'Markdown copied to the clipboard.' : 'Could not copy. Try the Markdown download.', ok ? '' : 'error'); }
  else if (kind === 'print') { window.print(); }
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  renderScore();
  if (!state.passages.length) {
    els.passages.innerHTML = `<div class="empty"><span class="gk">Ἐν ἀρχῇ ἦν ὁ λόγος</span>Add a passage from the panel to begin.</div>`;
    return;
  }
  els.passages.innerHTML = state.passages.map(renderPassage).join('');
  $$('.translation', els.passages).forEach(autosize);
  if (ui.open) mountDrill();
}

function renderScore() {
  const s = scoreSummary(state);
  $('#stat-translated').textContent = `${s.translated}/${s.verses}`;
  $('#stat-parsed').textContent = String(s.parsed);
  $('#stat-accuracy').textContent = s.parsed ? `${Math.round((s.correct / s.parsed) * 100)}%` : '—';
  $('#stat-cells').textContent = String(s.cells);
  $('#meter-bar').style.width = s.parsed ? `${Math.round((s.correct / s.parsed) * 100)}%` : '0%';
}

function renderPassage(p) {
  const book = BOOK_BY_ID.get(p.bookId);
  const meta = p.plain ? 'pasted text · no parsing data' : `${book?.name ?? ''} · SBLGNT${p.sample ? ' · sample' : ''}`;
  return `
  <article class="passage" data-passage="${p.id}">
    <header class="passage-head">
      <h2 class="passage-title">${esc(p.label)}<span class="passage-meta">${esc(meta)}</span></h2>
      <span class="passage-tools">
        <button class="btn btn-quiet btn-sm" type="button" data-fold-all="${p.id}">${allFolded(p) ? 'Open all' : 'Fold all'}</button>
        <button class="btn btn-quiet btn-sm" type="button" data-clear-glosses="${p.id}">Hide meanings</button>
        <button class="btn btn-quiet btn-sm" type="button" data-remove="${p.id}" aria-label="Remove ${esc(p.label)}">Remove</button>
      </span>
    </header>
    ${p.verses.map((v, vi) => renderVerse(p, v, vi)).join('')}
    ${renderVocabList(p)}
  </article>`;
}

/** The distinct vocabulary of a passage, rarest word first. */
function renderVocabList(p) {
  if (p.plain) return '';
  if (!lexiconReady()) return '<div class="vocab-loading">Loading vocabulary…</div>';
  const rows = passageVocabulary(p);
  if (!rows.length) return '';
  const open = !!state.openVocab?.[p.id];
  return `
  <details class="vocab" data-vocab="${p.id}"${open ? ' open' : ''}>
    <summary><span>Glossary</span> <span class="vocab-count">${rows.length} words, rarest first</span></summary>
    <div class="vocab-body">
      <div class="para-wrap">
        <table class="vocab-table">
          <thead><tr><th>Word</th><th>Meaning</th><th class="num">Here</th><th class="num">In the NT</th></tr></thead>
          <tbody>
            ${rows.map((r) => renderVocabRow(r)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </details>`;
}

function renderVocabRow({ lemma, count, entry }) {
  const band = frequencyBand(entry?.frequency ?? 0);
  return `<tr>
    <td class="gk" lang="grc">${esc(entry?.headword ?? lemma)}</td>
    <td>${entry?.gloss ? esc(entry.gloss) : '<span class="muted">no gloss in the lexicon</span>'}</td>
    <td class="num">${count}</td>
    <td class="num"><span class="freq ${band.key}" title="${esc(band.label)}">${entry?.frequency ?? '—'}</span></td>
  </tr>`;
}

function renderVerse(p, v, vi) {
  const refLabel = p.plain ? String(v.v) : `${v.c}:${v.v}`;
  const name = p.plain ? `line ${v.v}` : `${BOOK_BY_ID.get(v.b)?.abbr ?? ''} ${v.c}:${v.v}`;
  const key = verseKey(v);
  const collapsed = !!state.collapsed?.[key];
  const glossed = !!state.verseGloss?.[key];
  const classes = ['verse'];
  if (collapsed) classes.push('collapsed');
  if (glossed) classes.push('interlinear');
  return `
  <section class="${classes.join(' ')}" data-verse="${vi}">
    <div class="verse-ref">
      <button class="verse-num" type="button" data-toggle-verse="${vi}" aria-expanded="${!collapsed}" title="${collapsed ? 'Open' : 'Fold away'} ${esc(name)}"><span class="caret" aria-hidden="true"></span>${esc(refLabel)}</button>
      <span class="verse-tools">
        <button class="verse-tool${glossed ? ' on' : ''}" type="button" data-verse-gloss="${vi}" aria-pressed="${glossed}" title="${glossed ? 'Hide the English under this verse' : 'Show the English under every word of this verse'}">gloss</button>
        <button class="verse-tool remove" type="button" data-remove-verse="${vi}" title="Remove this verse" aria-label="Remove ${esc(name)}">✕</button>
      </span>
    </div>
    <div class="verse-peek" data-toggle-verse="${vi}" role="button" tabindex="0">${esc(versePeek(v))}</div>
    <div class="verse-body">
      <p class="greek" lang="grc">${v.words.map((w, wi) => renderWord(p, v, w, wi)).join(' ')}</p>
      <textarea class="translation${v.translation?.trim() ? ' filled' : ''}" data-translation placeholder="${esc(`Your translation of ${name}`)}" rows="2" lang="en">${esc(v.translation ?? '')}</textarea>
    </div>
  </section>`;
}

/** What a folded verse shows: your translation if you have written one, else the Greek. */
function versePeek(verse) {
  const text = verse.translation?.trim() || verse.words.map((w) => w.text).join(' ');
  return text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text;
}

function renderWord(p, v, w, wi) {
  const m = w.text.match(/^(.*?)([,.;·:!?)]*)$/);
  const core = m ? m[1] : w.text;
  const punct = m ? m[2] : '';
  if (p.plain) return `<span class="w-unit"><span class="w plain">${esc(core)}</span>${punct ? `<span class="punct">${esc(punct)}</span>` : ''}</span>`;
  const d = state.drills[wordKey(v, wi)];
  const cls = ['w'];
  if (d) cls.push(d.correct ? 'ok' : 'miss');
  if (ui.open && ui.open.passageId === p.id && ui.open.verseIndex === v.vi && ui.open.wordIndex === wi) cls.push('active');
  const entry = entryFor(w.lemma);
  const parse = d ? `${w.lemma} — ${describeParse(w)}` : `${w.lemma || ''} ${posLabel(w)}`.trim();
  const title = entry?.gloss ? `${parse} · ${entry.gloss}` : parse;
  const under = shortGloss(w.lemma);
  const revealed = !!state.revealed?.[wordKey(v, wi)];
  return `<span class="w-unit${revealed ? ' revealed' : ''}"><span class="w-line"><span class="${cls.join(' ')}" role="button" tabindex="0" data-word="${wi}" data-pos="${esc(w.pos)}" title="${esc(title)}">${esc(core)}</span>${punct ? `<span class="punct">${esc(punct)}</span>` : ''}</span><span class="wg">${under ? esc(under) : ''}</span></span>`;
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, 48)}px`;
}

// Event delegation for the passages column
els.passages.addEventListener('click', (e) => {
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    const p = state.passages.find((x) => x.id === remove.dataset.remove);
    if (p && confirm(`Remove ${p.label}? Your translations for it will be deleted.`)) {
      state.passages = state.passages.filter((x) => x !== p);
      if (ui.open?.passageId === p.id) ui.open = null;
      saveState(state);
      render();
    }
    return;
  }
  const toggleVerse = e.target.closest('[data-toggle-verse]');
  if (toggleVerse) {
    const { verse, verseEl } = contextOf(toggleVerse);
    const key = verseKey(verse);
    const collapsed = !state.collapsed[key];
    setCollapsed(key, collapsed);
    // The summary line is built at render time; refresh it so it shows the
    // translation as it stands right now.
    verseEl.querySelector('.verse-peek').textContent = versePeek(verse);
    verseEl.classList.toggle('collapsed', collapsed);
    verseEl.querySelector('.verse-num').setAttribute('aria-expanded', String(!collapsed));
    if (collapsed && ui.open?.verseIndex === Number(verseEl.dataset.verse)) closeDrill();
    refreshFoldAll(verseEl.closest('[data-passage]')?.dataset.passage);
    saveState(state);
    return;
  }
  const verseGloss = e.target.closest('[data-verse-gloss]');
  if (verseGloss) {
    const { verse, verseEl } = contextOf(verseGloss);
    const key = verseKey(verse);
    const on = !state.verseGloss[key];
    if (on) state.verseGloss[key] = true;
    else delete state.verseGloss[key];
    verseEl.classList.toggle('interlinear', on);
    verseGloss.classList.toggle('on', on);
    verseGloss.setAttribute('aria-pressed', String(on));
    verseGloss.title = on ? 'Hide the English under this verse' : 'Show the English under every word of this verse';
    saveState(state);
    return;
  }
  const foldAll = e.target.closest('[data-fold-all]');
  if (foldAll) {
    const passage = state.passages.find((x) => x.id === foldAll.dataset.foldAll);
    if (!passage) return;
    const fold = !allFolded(passage);
    passage.verses.forEach((v) => setCollapsed(verseKey(v), fold));
    if (fold) ui.open = null;
    saveState(state);
    render();
    return;
  }
  const removeVerse = e.target.closest('[data-remove-verse]');
  if (removeVerse) {
    const { passage, verse, verseIndex } = contextOf(removeVerse);
    const written = verse.translation?.trim() || verse.note?.trim();
    if (written && !confirm(`Remove ${passage.plain ? `line ${verse.v}` : `${BOOK_BY_ID.get(verse.b)?.abbr ?? ''} ${verse.c}:${verse.v}`}? Your translation of it will be deleted.`)) return;
    // Drill results and revealed meanings are keyed by the verse's reference,
    // so only this verse's entries need clearing.
    verse.words.forEach((_, wi) => {
      delete state.drills[wordKey(verse, wi)];
      delete state.revealed[wordKey(verse, wi)];
    });
    forgetVerse(verse);
    passage.verses.splice(verseIndex, 1);
    relabel(passage);
    if (!passage.verses.length) {
      state.passages = state.passages.filter((x) => x !== passage);
      delete state.openVocab[passage.id];
    }
    ui.open = null;
    saveState(state);
    render();
    return;
  }
  const clear = e.target.closest('[data-clear-glosses]');
  if (clear) {
    const passage = state.passages.find((x) => x.id === clear.dataset.clearGlosses);
    if (!passage) return;
    passage.verses.forEach((v) => {
      delete state.verseGloss[verseKey(v)];
      v.words.forEach((_, wi) => { delete state.revealed[wordKey(v, wi)]; });
    });
    saveState(state);
    render();
    return;
  }
  const word = e.target.closest('.w[data-word]');
  if (word && !e.target.closest('.drill')) {
    openDrillFrom(word);
  }
});

// Remember which vocabulary lists are open across re-renders.
els.passages.addEventListener('toggle', (e) => {
  const list = e.target.closest('[data-vocab]');
  if (!list) return;
  state.openVocab[list.dataset.vocab] = list.open;
  saveState(state);
}, true);

els.passages.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.matches('.w[data-word]')) { e.preventDefault(); openDrillFrom(e.target); }
  else if (e.target.matches('.verse-peek')) { e.preventDefault(); e.target.click(); }
});

function setCollapsed(key, collapsed) {
  if (collapsed) state.collapsed[key] = true;
  else delete state.collapsed[key];
}

function allFolded(passage) {
  return passage.verses.length > 0 && passage.verses.every((v) => state.collapsed[verseKey(v)]);
}

function refreshFoldAll(passageId) {
  const passage = state.passages.find((x) => x.id === passageId);
  const btn = passageId && $(`[data-fold-all="${passageId}"]`);
  if (passage && btn) btn.textContent = allFolded(passage) ? 'Open all' : 'Fold all';
}

els.passages.addEventListener('input', (e) => {
  if (e.target.matches('[data-translation]')) {
    const { passage, verse } = contextOf(e.target);
    verse.translation = e.target.value;
    e.target.classList.toggle('filled', !!verse.translation.trim());
    autosize(e.target);
    saveState(state);
    renderScore();
  }
});

function contextOf(el) {
  const passageEl = el.closest('[data-passage]');
  const verseEl = el.closest('[data-verse]');
  const passage = state.passages.find((p) => p.id === passageEl.dataset.passage);
  const verseIndex = Number(verseEl.dataset.verse);
  return { passage, verse: passage.verses[verseIndex], verseIndex, verseEl, passageEl };
}

function openDrillFrom(wordEl) {
  const { passage, verse, verseIndex } = contextOf(wordEl);
  const wordIndex = Number(wordEl.dataset.word);
  // Asking about a word leaves its meaning under it, so the verse fills in as
  // you work through it.
  const word = verse.words[wordIndex];
  if (shortGloss(word?.lemma)) {
    state.revealed[wordKey(verse, wordIndex)] = true;
    wordEl.closest('.w-unit')?.classList.add('revealed');
    saveState(state);
  }
  const same = ui.open && ui.open.passageId === passage.id && ui.open.verseIndex === verseIndex && ui.open.wordIndex === wordIndex;
  if (same) { closeDrill(); return; }
  ui.open = { passageId: passage.id, verseIndex, wordIndex };
  ui.tab = 'parse';
  mountDrill();
}

function closeDrill() {
  $$('.drill', els.passages).forEach((d) => d.remove());
  $$('.w.active', els.passages).forEach((w) => w.classList.remove('active'));
  ui.open = null;
}

// ---------------------------------------------------------------------------
// Drill panel

function mountDrill() {
  $$('.drill', els.passages).forEach((d) => d.remove());
  $$('.w.active', els.passages).forEach((w) => w.classList.remove('active'));
  const passage = state.passages.find((p) => p.id === ui.open.passageId);
  if (!passage) { ui.open = null; return; }
  const verse = passage.verses[ui.open.verseIndex];
  const word = verse?.words[ui.open.wordIndex];
  if (!word) { ui.open = null; return; }
  const verseEl = $(`[data-passage="${passage.id}"] [data-verse="${ui.open.verseIndex}"]`);
  const wordEl = verseEl.querySelector(`.w[data-word="${ui.open.wordIndex}"]`);
  wordEl.classList.add('active');
  const panel = document.createElement('div');
  panel.className = 'drill';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', `Word panel for ${word.word}`);
  verseEl.querySelector('.greek').after(panel);
  renderDrill(panel, { passage, verse, word, key: wordKey(verse, ui.open.wordIndex) });
}

function renderDrill(panel, ctx) {
  const { word, key } = ctx;
  const parse = decodeCode(word.code);
  const isVerb = word.pos === 'V-';
  const nominal = ['N-', 'A-', 'RA', 'RD', 'RI', 'RP', 'RR'].includes(word.pos);
  const inflected = isInflected(word);
  const tabs = [];
  if (inflected) tabs.push(['parse', 'Parse']);
  if (isVerb) tabs.push(['conjugate', 'Conjugate']);
  if (nominal && parse.gender) tabs.push(['decline', 'Decline']);
  if (!tabs.some(([t]) => t === ui.tab)) ui.tab = tabs[0]?.[0] ?? 'info';

  const done = state.drills[key];
  panel.innerHTML = `
    <div class="drill-head">
      <div class="drill-word">
        <span class="gk" lang="grc">${esc(word.word)}</span>
        <span class="chip ${isVerb ? 'verb' : ''}">${esc(posLabel(word))}</span>
        ${done ? `<span class="chip ${done.correct ? 'ok' : 'bad'}">${done.correct ? 'parsed correctly' : 'corrected'}</span>` : ''}
        <span class="lemma" data-lemma>${word.lemma ? `from <span class="gk" lang="grc">${esc(word.lemma)}</span>` : ''}</span>
      </div>
      <button class="btn btn-quiet btn-sm" type="button" data-close aria-label="Close panel">Close ✕</button>
    </div>
    ${renderWordVocab(word)}
    ${tabs.length > 1 ? `<div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button class="tab" role="tab" type="button" data-tab="${id}" aria-selected="${ui.tab === id}">${label}</button>`).join('')}</div>` : ''}
    <div class="tab-body" data-tab-body></div>`;

  panel.querySelector('[data-close]').addEventListener('click', closeDrill);
  $$('[data-tab]', panel).forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; renderDrill(panel, ctx); }));

  const body = panel.querySelector('[data-tab-body]');
  if (ui.tab === 'parse') renderParseTab(body, ctx);
  else if (ui.tab === 'conjugate') renderConjugateTab(body, ctx);
  else if (ui.tab === 'decline') renderDeclineTab(body, ctx);
  else renderInfoTab(body, ctx);
}

/** Meaning, dictionary headword and NT frequency for the clicked word. */
function renderWordVocab(word) {
  if (!word.lemma) return '';
  const entry = entryFor(word.lemma);
  if (!entry) {
    return lexiconReady()
      ? `<div class="word-vocab"><span class="muted">No gloss for <span class="gk" lang="grc">${esc(word.lemma)}</span> in the lexicon.</span></div>`
      : '';
  }
  const band = frequencyBand(entry.frequency);
  return `<div class="word-vocab"><div class="word-vocab-inner">
    <div class="word-vocab-main">
      <span class="gk headword" lang="grc">${esc(entry.headword)}</span>
      <span class="gloss">${esc(entry.gloss ?? '—')}</span>
    </div>
    <span class="freq ${band.key}" title="occurrences in the New Testament">${entry.frequency}× · ${esc(band.label)}</span>
    ${entry.definition ? `<p class="word-vocab-def">${esc(entry.definition)}</p>` : ''}
  </div></div>`;
}

function renderInfoTab(body, { word, key }) {
  body.innerHTML = `
    <p class="para-note">${esc(word.word)} is ${/^[aeiou]/i.test(posLabel(word)) ? 'an' : 'a'} ${esc(posLabel(word))} (lemma <span class="gk" lang="grc">${esc(word.lemma)}</span>). Nothing to parse here.</p>
    <div class="drill-actions"><span class="spacer"></span><button class="btn" type="button" data-done>Done</button></div>`;
  body.querySelector('[data-done]').addEventListener('click', closeDrill);
}

// ---- Parse tab

function renderParseTab(body, ctx) {
  const { word, key, verse } = ctx;
  const fields = drillFields(word);
  const prior = state.drills[key];
  const gold = decodeCode(word.code);
  body.innerHTML = `
    <div class="parse-grid">
      ${fields.map((f) => `
        <div class="parse-field" data-field="${f}">
          <label for="pf-${f}">${FIELDS[f].label}</label>
          <select id="pf-${f}" data-select="${f}">
            <option value="">—</option>
            ${Object.entries(FIELDS[f].options).filter(([code]) => optionAllowed(f, code, word)).map(([code, label]) => `<option value="${code}">${label}</option>`).join('')}
          </select>
          <span class="expected" hidden></span>
        </div>`).join('')}
    </div>
    <div class="verdict" data-verdict hidden></div>
    <div class="drill-actions">
      <button class="btn btn-primary" type="button" data-check>Check</button>
      <button class="btn" type="button" data-reveal>Reveal</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-done disabled>Done</button>
    </div>`;

  if (prior?.given) {
    for (const [f, val] of Object.entries(prior.given)) {
      const sel = body.querySelector(`[data-select="${f}"]`);
      if (sel && val) sel.value = val;
    }
    if (prior.given) showResult(checkParse(word, prior.given), false);
  }

  body.querySelector('[data-check]').addEventListener('click', () => {
    const answers = {};
    for (const f of fields) answers[f] = body.querySelector(`[data-select="${f}"]`).value || null;
    if (fields.some((f) => !answers[f])) {
      show(body.querySelector('[data-verdict]'), 'Choose a value for every field first.', 'info');
      return;
    }
    const result = checkParse(word, answers);
    const record = state.drills[key] ?? { attempts: 0 };
    record.attempts += 1;
    record.correct = result.correct && record.attempts === 1 ? true : result.correct && record.correct !== false;
    if (record.attempts === 1) record.correct = result.correct;
    else if (!result.correct) record.correct = false;
    record.given = answers;
    record.givenText = fields.map((f) => answers[f] ? FIELDS[f].short[answers[f]] : '—').join(' ');
    record.at = Date.now();
    state.drills[key] = record;
    saveState(state);
    renderScore();
    showResult(result, true);
    markWord();
  });

  body.querySelector('[data-reveal]').addEventListener('click', () => {
    for (const f of fields) body.querySelector(`[data-select="${f}"]`).value = gold[f] ?? '';
    const record = state.drills[key] ?? { attempts: 0 };
    record.attempts += 1;
    record.correct = false;
    record.given = Object.fromEntries(fields.map((f) => [f, gold[f]]));
    record.givenText = 'revealed';
    record.at = Date.now();
    state.drills[key] = record;
    saveState(state);
    renderScore();
    show(body.querySelector('[data-verdict]'), `<span class="gk" lang="grc">${esc(word.word)}</span> — ${esc(word.lemma)}, ${esc(describeParse(word, { long: true }))}. Marked as corrected.`, 'info');
    body.querySelector('[data-done]').disabled = false;
    markWord();
  });

  body.querySelector('[data-done]').addEventListener('click', closeDrill);

  function showResult(result, fresh) {
    for (const [f, r] of Object.entries(result.fields)) {
      const fieldEl = body.querySelector(`[data-field="${f}"]`);
      fieldEl.classList.toggle('ok', r.ok);
      fieldEl.classList.toggle('bad', !r.ok);
      const exp = fieldEl.querySelector('.expected');
      if (!r.ok) {
        exp.hidden = false;
        exp.innerHTML = `→ <b>${esc(FIELDS[f].options[r.expected] ?? '—')}</b>`;
      } else exp.hidden = true;
    }
    const verdict = body.querySelector('[data-verdict]');
    if (result.correct) show(verdict, `Right: <span class="gk" lang="grc">${esc(word.word)}</span> is ${esc(describeParse(word, { long: true }))}${word.lemma ? `, from <span class="gk" lang="grc">${esc(word.lemma)}</span>` : ''}.`, 'ok');
    else {
      const wrong = Object.values(result.fields).filter((r) => !r.ok).length;
      show(verdict, `${wrong} field${wrong === 1 ? '' : 's'} to fix. It is ${esc(describeParse(word, { long: true }))}${mpNote(word)}.`, 'bad');
    }
    body.querySelector('[data-done]').disabled = false;
    if (fresh) body.querySelector('[data-verdict]').scrollIntoView({ block: 'nearest' });
  }

  function markWord() {
    const wordEl = $(`[data-passage="${ctx.passage.id}"] [data-verse="${ui.open.verseIndex}"] .w[data-word="${ui.open.wordIndex}"]`);
    const d = state.drills[key];
    if (!wordEl || !d) return;
    wordEl.classList.toggle('ok', d.correct);
    wordEl.classList.toggle('miss', !d.correct);
    wordEl.title = `${word.lemma} — ${describeParse(word)}`;
    // refresh the chip in the panel header
    const head = wordEl.closest('.verse').querySelector('.drill .drill-word');
    if (head) {
      head.querySelector('.chip.ok, .chip.bad')?.remove();
      const chip = document.createElement('span');
      chip.className = `chip ${d.correct ? 'ok' : 'bad'}`;
      chip.textContent = d.correct ? 'parsed correctly' : 'corrected';
      head.querySelector('.chip').after(chip);
    }
  }
}

function mpNote(word) {
  const p = decodeCode(word.code);
  if (word.pos === 'V-' && MP_IDENTICAL_TENSES.has(p.tense) && (p.voice === 'M' || p.voice === 'P')) {
    return ' (middle and passive forms are identical in this tense, so either is accepted)';
  }
  return '';
}

/** Hide options that can never apply to this word class (keeps the menus short). */
function optionAllowed(field, code, word) {
  if (field === 'mood' && code === 'O') return false; // optative is rare; still accepted if tagged
  if (field === 'case' && code === 'V') return decodeCode(word.code).case === 'V';
  if (field === 'tense' && code === 'Y') return decodeCode(word.code).tense === 'Y' || word.pos === 'V-';
  return true;
}

function show(el, html, kind) {
  el.hidden = false;
  el.className = `verdict ${kind}`;
  el.innerHTML = html;
}

// ---- Attested forms from every loaded book

const attestedCache = new Map();

function attestedIndex(lemma) {
  const bookCount = loadedWords().length; // cheap invalidation key
  const cacheKey = `${lemma}|${bookCount}`;
  if (attestedCache.has(cacheKey)) return attestedCache.get(cacheKey);
  const index = new Map();
  const add = (k, form) => {
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(form);
  };
  for (const w of loadedWords()) {
    if (w.lemma !== lemma) continue;
    const p = decodeCode(w.code);
    const form = w.norm || w.word;
    if (w.pos === 'V-') {
      if (p.mood === 'P') continue;
      const voices = MP_IDENTICAL_TENSES.has(p.tense) && (p.voice === 'M' || p.voice === 'P') ? ['M', 'P'] : [p.voice];
      for (const v of voices) {
        if (p.mood === 'N') add(`${p.tense}${v}N`, form);
        else add(`${p.tense}${v}${p.mood}${p.person}${p.number}`, form);
      }
    } else if (p.case && p.number) {
      add(`${p.case}${p.number}${p.gender ?? '-'}`, form);
    }
  }
  attestedCache.set(cacheKey, index);
  return index;
}

const TENSE_NAMES = { P: 'Present', I: 'Imperfect', F: 'Future', A: 'Aorist', X: 'Perfect', Y: 'Pluperfect' };
const VOICE_NAMES = { A: 'active', M: 'middle', P: 'passive' };
const MOOD_NAMES = { I: 'indicative', S: 'subjunctive', D: 'imperative', N: 'infinitive', O: 'optative' };

function tvmLabel({ tense, voice, mood }) {
  const v = MP_IDENTICAL_TENSES.has(tense) && voice !== 'A' ? 'middle/passive' : VOICE_NAMES[voice];
  return `${TENSE_NAMES[tense]} ${v} ${MOOD_NAMES[mood]}`;
}

// ---- Conjugate tab

function renderConjugateTab(body, ctx) {
  const { word } = ctx;
  const lemma = word.lemma;
  const desc = analyzeVerb(lemma);
  const attested = attestedIndex(lemma);
  const parse = decodeCode(word.code);

  // Options: everything the generator covers, plus any attested finite/infinitive combo.
  const options = new Map();
  for (const c of CONJUGATIONS) {
    if (MP_IDENTICAL_TENSES.has(c.tense) && c.voice === 'P') continue;
    options.set(`${c.tense}${c.voice}${c.mood}`, c);
  }
  for (const k of attested.keys()) {
    const tense = k[0], voice = k[1], mood = k[2];
    if (MP_IDENTICAL_TENSES.has(tense) && voice === 'P') continue;
    if (!options.has(`${tense}${voice}${mood}`)) options.set(`${tense}${voice}${mood}`, { tense, voice, mood });
  }
  let initial = parse.mood && parse.mood !== 'P' ? `${parse.tense}${MP_IDENTICAL_TENSES.has(parse.tense) && parse.voice === 'P' ? 'M' : parse.voice}${parse.mood}` : 'PAI';
  if (!options.has(initial)) initial = 'PAI';
  const sorted = [...options.values()].sort((a, b) => 'ISDNO'.indexOf(a.mood) - 'ISDNO'.indexOf(b.mood) || 'PIFAXY'.indexOf(a.tense) - 'PIFAXY'.indexOf(b.tense) || 'AMP'.indexOf(a.voice) - 'AMP'.indexOf(b.voice));

  body.innerHTML = `
    <div class="para-controls">
      <label for="tvm-select" class="summary-line">Conjugate <span class="gk" lang="grc">${esc(lemma)}</span> in the</label>
      <select id="tvm-select" data-tvm>${sorted.map((c) => `<option value="${c.tense}${c.voice}${c.mood}"${`${c.tense}${c.voice}${c.mood}` === initial ? ' selected' : ''}>${tvmLabel(c)}</option>`).join('')}</select>
    </div>
    <p class="para-note" data-note></p>
    <div class="para-wrap" data-table></div>
    <div class="drill-actions">
      <button class="btn btn-primary" type="button" data-check>Check forms</button>
      <button class="btn" type="button" data-show>Show answers</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-done>Done</button>
    </div>`;

  const select = body.querySelector('[data-tvm]');
  const tableWrap = body.querySelector('[data-table]');
  const note = body.querySelector('[data-note]');
  let cells = [];

  const buildTable = () => {
    const tvm = select.value;
    const spec = { tense: tvm[0], voice: tvm[1], mood: tvm[2] };
    const generated = conjugate(desc, spec);
    const persons = spec.mood === 'D' ? IMPV_PERSONS : spec.mood === 'N' ? [[null, null]] : PERSONS;
    cells = persons.map(([person, number], i) => {
      const gen = generated.cells[i]?.forms ?? [];
      const attKey = spec.mood === 'N' ? `${spec.tense}${spec.voice}N` : `${spec.tense}${spec.voice}${spec.mood}${person}${number}`;
      const att = [...(attested.get(attKey) ?? [])];
      return { person, number, gen, att, keys: [...att, ...gen] };
    });
    const notes = [];
    if (generated.note) notes.push(generated.note);
    if (desc.kind === 'omega' && !generated.note) notes.push('Regular forms are generated from the lemma; attested New Testament forms are preferred where they exist.');
    if (!cells.some((c) => c.keys.length)) notes.push('No answer key is available for this paradigm: fill it in and check it against your grammar.');
    note.textContent = notes.join(' ');
    if (spec.mood === 'N') {
      tableWrap.innerHTML = `<table class="para-table"><thead><tr><th class="row">${esc(tvmLabel(spec))}</th><th>Form</th></tr></thead><tbody>
        <tr><th class="row">infinitive</th><td class="cell${cells[0].keys.length ? '' : ' nokey'}" data-cell="0"><input type="text" lang="grc" aria-label="infinitive" data-input="0"></td></tr></tbody></table>`;
    } else {
      const rows = spec.mood === 'D' ? ['2nd', '3rd'] : ['1st', '2nd', '3rd'];
      const cellAt = (personLabel, number) => cells.findIndex((c) => c.person === personLabel[0] && c.number === number);
      tableWrap.innerHTML = `<table class="para-table"><thead><tr><th class="row">${esc(tvmLabel(spec))}</th><th>Singular</th><th>Plural</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th class="row">${r} person</th>${['S', 'P'].map((n) => { const i = cellAt(r, n); return `<td class="cell${cells[i].keys.length ? '' : ' nokey'}" data-cell="${i}"><input type="text" lang="grc" aria-label="${r} person ${n === 'S' ? 'singular' : 'plural'}" data-input="${i}"></td>`; }).join('')}</tr>`).join('')}
      </tbody></table>`;
    }
    tableWrap.querySelector('input')?.focus();
  };

  const check = ({ reveal = false } = {}) => {
    let total = 0, correct = 0;
    cells.forEach((c, i) => {
      const td = tableWrap.querySelector(`[data-cell="${i}"]`);
      const input = td.querySelector('input');
      td.querySelector('.key')?.remove();
      td.classList.remove('ok', 'bad');
      if (!c.keys.length) {
        if (reveal) td.insertAdjacentHTML('beforeend', `<div class="key"><span class="src">no key</span></div>`);
        return;
      }
      const answer = input.value.trim();
      const ok = !reveal && answer && formsMatch(answer, c.keys, { strict: !!state.settings.strict });
      if (!reveal) { total += 1; if (ok) correct += 1; }
      td.classList.add(ok ? 'ok' : 'bad');
      if (!ok) {
        const shown = new Map();
        for (const f of c.att) shown.set(f, 'att');
        for (const f of c.gen) if (!shown.has(f)) shown.set(f, 'gen');
        td.insertAdjacentHTML('beforeend', `<div class="key">${[...shown].map(([f, src]) => `<span class="gk" lang="grc">${esc(f)}</span><span class="src ${src === 'att' ? 'att' : ''}">${src === 'att' ? 'sblgnt' : 'generated'}</span>`).join('')}</div>`);
      }
    });
    if (!reveal && total) {
      const pkey = `${lemma}|${select.value}`;
      const rec = state.paradigms[pkey] ?? { correct: 0, total: 0 };
      rec.correct += correct; rec.total += total; rec.at = Date.now();
      state.paradigms[pkey] = rec;
      saveState(state);
      renderScore();
      note.textContent = `${correct} of ${total} form${total === 1 ? '' : 's'} right${state.settings.strict ? ' (strict accents)' : ' (accents ignored; turn on strict mode in Options to check them)'}.`;
    }
  };

  select.addEventListener('change', buildTable);
  body.querySelector('[data-check]').addEventListener('click', () => check());
  body.querySelector('[data-show]').addEventListener('click', () => check({ reveal: true }));
  body.querySelector('[data-done]').addEventListener('click', closeDrill);
  tableWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  buildTable();
}

// ---- Decline tab

function renderDeclineTab(body, ctx) {
  const { word } = ctx;
  const parse = decodeCode(word.code);
  const lemma = word.lemma;
  const attested = attestedIndex(lemma);
  const genders = ['M', 'F', 'N'];
  const gender = parse.gender ?? 'M';

  body.innerHTML = `
    <div class="para-controls">
      <label for="gender-select" class="summary-line">Decline <span class="gk" lang="grc">${esc(lemma)}</span> in the</label>
      <select id="gender-select" data-gender>${genders.map((g) => `<option value="${g}"${g === gender ? ' selected' : ''}>${FIELDS.gender.options[g]}</option>`).join('')}</select>
    </div>
    <p class="para-note" data-note></p>
    <div class="para-wrap" data-table></div>
    <div class="drill-actions">
      <button class="btn btn-primary" type="button" data-check>Check forms</button>
      <button class="btn" type="button" data-show>Show answers</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-done>Done</button>
    </div>`;

  const select = body.querySelector('[data-gender]');
  const tableWrap = body.querySelector('[data-table]');
  const note = body.querySelector('[data-note]');
  let cells = [];

  const buildTable = () => {
    const g = select.value;
    const generated = declineNominal(lemma, word.pos, g);
    cells = NOUN_CELLS.map(([cs, num], i) => {
      const gen = generated.cells[i]?.forms ?? [];
      const att = [...(attested.get(`${cs}${num}${g}`) ?? []), ...(word.pos === 'N-' ? [...(attested.get(`${cs}${num}-`) ?? [])] : [])];
      return { case: cs, number: num, gen, att, keys: [...att, ...gen] };
    });
    const notes = [];
    if (generated.note) notes.push(generated.note);
    else notes.push('Regular forms are generated from the lemma; attested New Testament forms are preferred where they exist.');
    if (!cells.some((c) => c.keys.length)) notes.push('No answer key is available: fill it in and check it against your grammar.');
    note.textContent = notes.join(' ');
    const caseRows = ['N', 'G', 'D', 'A'];
    tableWrap.innerHTML = `<table class="para-table"><thead><tr><th class="row">${esc(FIELDS.gender.options[g])}</th><th>Singular</th><th>Plural</th></tr></thead><tbody>
      ${caseRows.map((cs) => `<tr><th class="row">${FIELDS.case.options[cs]}</th>${['S', 'P'].map((n) => { const i = cells.findIndex((c) => c.case === cs && c.number === n); return `<td class="cell${cells[i].keys.length ? '' : ' nokey'}" data-cell="${i}"><input type="text" lang="grc" aria-label="${FIELDS.case.options[cs]} ${n === 'S' ? 'singular' : 'plural'}" data-input="${i}"></td>`; }).join('')}</tr>`).join('')}
    </tbody></table>`;
    tableWrap.querySelector('input')?.focus();
  };

  const check = ({ reveal = false } = {}) => {
    let total = 0, correct = 0;
    cells.forEach((c, i) => {
      const td = tableWrap.querySelector(`[data-cell="${i}"]`);
      const input = td.querySelector('input');
      td.querySelector('.key')?.remove();
      td.classList.remove('ok', 'bad');
      if (!c.keys.length) {
        if (reveal) td.insertAdjacentHTML('beforeend', `<div class="key"><span class="src">no key</span></div>`);
        return;
      }
      const answer = input.value.trim();
      const ok = !reveal && answer && formsMatch(answer, c.keys, { strict: !!state.settings.strict });
      if (!reveal) { total += 1; if (ok) correct += 1; }
      td.classList.add(ok ? 'ok' : 'bad');
      if (!ok) {
        const shown = new Map();
        for (const f of c.att) shown.set(f, 'att');
        for (const f of c.gen) if (!shown.has(f)) shown.set(f, 'gen');
        td.insertAdjacentHTML('beforeend', `<div class="key">${[...shown].map(([f, src]) => `<span class="gk" lang="grc">${esc(f)}</span><span class="src ${src === 'att' ? 'att' : ''}">${src === 'att' ? 'sblgnt' : 'generated'}</span>`).join('')}</div>`);
      }
    });
    if (!reveal && total) {
      const pkey = `${lemma}|decl-${select.value}`;
      const rec = state.paradigms[pkey] ?? { correct: 0, total: 0 };
      rec.correct += correct; rec.total += total; rec.at = Date.now();
      state.paradigms[pkey] = rec;
      saveState(state);
      renderScore();
      note.textContent = `${correct} of ${total} form${total === 1 ? '' : 's'} right${state.settings.strict ? ' (strict accents)' : ' (accents ignored; turn on strict mode in Options to check them)'}.`;
    }
  };

  select.addEventListener('change', buildTable);
  body.querySelector('[data-check]').addEventListener('click', () => check());
  body.querySelector('[data-show]').addEventListener('click', () => check({ reveal: true }));
  body.querySelector('[data-done]').addEventListener('click', closeDrill);
  tableWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  buildTable();
}
