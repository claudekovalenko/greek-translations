// Anagnosis walk-through: one passage, one word at a time, then your translation.

import { parseReference } from './refs.js';
import { loadBook } from './datasource.js';
import { groupVerses, selectVerses } from './morphgnt.js';
import { FIELDS, checkParse, describeParse } from './parsing.js';
import { loadLexicon, entryFor, shortGloss, frequencyBand } from './lexicon.js';
import { download, copyText } from './export.js';
import {
  CLASSES, wordClass, classLabel, walkFields, renderingHints, newSession, answerKey, answerFor,
  wordStage, progress, nextPosition, prevPosition, verseLabel, translationText, translationMarkdown,
  formatDate, fileSlug, score, level, recordStreak, POINTS,
} from './walk-core.js';
import { confetti, confettiFrom, floatPoints, banner, startSky, bindTilt, sound } from './walk-fx.js';

const STORE_KEY = 'anagnosis-walk-v1';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = loadStore();
const ui = {
  view: 'start',      // 'start' | 'walk' | 'done'
  status: '',
  statusKind: '',
  busy: false,
  showGreek: false,
  showNotes: false,
  focusTranslation: false,
  lastCard: null,
  lastVerse: null,   // the verse on screen, so its tiles only fly in once     // the word card on screen, so it only flips in when the word changes
  fx: null,           // one-shot card animation: 'good' | 'bad'
  celebrate: false,   // play the finish animation once
};
const root = $('#app');

// ---------------------------------------------------------------------------
// Storage

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (data && Array.isArray(data.sessions)) return data;
  } catch { /* fall through */ }
  return { current: null, sessions: [], opts: { askClass: true, parseArticles: false, sound: false } };
}

let saveTimer = null;
function save({ soon = false } = {}) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
  };
  if (soon) saveTimer = setTimeout(write, 300);
  else write();
}

const current = () => store.sessions.find((s) => s.id === store.current) ?? null;

function touch(session) {
  session.updated = Date.now();
  save();
}

// ---------------------------------------------------------------------------
// Boot

init();

async function init() {
  const s = current();
  if (s) ui.view = s.finished ? 'done' : 'walk';
  render();
  bindGlobal();
  startSky($('#wk-sky'));
  bindTilt(root);
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) {
    history.replaceState(null, '', location.pathname);
    await start(ref);
  }
  if (await loadLexicon()) render();
}

function bindGlobal() {
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('textarea, input, dialog, select')) return;
    const primary = $('[data-primary]', root);
    if (primary && !primary.disabled) {
      e.preventDefault();
      primary.click();
    }
  });
}

// ---------------------------------------------------------------------------
// Starting a passage

async function start(text) {
  let range;
  try {
    range = parseReference(text);
  } catch (err) {
    return setStatus(err.message, 'error');
  }
  // The same passage again: carry on where you were.
  const existing = store.sessions.find((s) => s.label === range.label && !s.finished);
  if (existing) return open(existing.id);

  ui.busy = true;
  setStatus(`Loading ${range.label}…`);
  try {
    const { words } = await loadBook(range.book.id, { onStatus: (m) => setStatus(m) });
    const verses = selectVerses(groupVerses(words), range);
    if (!verses.length) throw new Error(`No verses found for ${range.label}.`);
    const session = newSession({ label: range.label, verses });
    session.opts = { ...store.opts };
    store.sessions.unshift(session);
    store.current = session.id;
    save();
    ui.busy = false;
    ui.status = '';
    ui.view = 'walk';
    render();
    scrollToCard();
  } catch (err) {
    ui.busy = false;
    setStatus(err.message, 'error');
  }
}

function open(id, view) {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return;
  store.current = id;
  save();
  ui.status = '';
  ui.view = view ?? (s.finished ? 'done' : 'walk');
  render();
  window.scrollTo({ top: 0 });
  if (ui.view === 'walk') scrollToCard();
}

function setStatus(message, kind = '') {
  ui.status = message;
  ui.statusKind = kind;
  const el = $('#wk-status');
  if (el) {
    el.textContent = message;
    el.className = `status ${kind}`;
  } else render();
}

// ---------------------------------------------------------------------------
// Events

function onSubmit(e) {
  if (e.target.id === 'wk-start') {
    e.preventDefault();
    const text = $('#wk-ref').value.trim();
    if (text && !ui.busy) start(text);
  }
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-opt]')) {
    const s = ui.view === 'start' || t.dataset.opt === 'sound' ? null : current();
    const opts = s ? s.opts : store.opts;
    opts[t.dataset.opt] = t.checked;
    if (t.dataset.opt === 'sound') sound('good', t.checked);
    save();
    render();
  } else if (t.matches('[data-show]')) {
    ui[t.dataset.show] = t.checked;
    render();
  }
}

function onInput(e) {
  const t = e.target;
  if (t.matches('[data-tr]')) {
    const s = current();
    s.translations[Number(t.dataset.tr)] = t.value;
    s.updated = Date.now();
    autosize(t);
    save({ soon: true });
  }
}

function onClick(e) {
  const btn = e.target.closest('button, [data-goto]');
  if (!btn) return;
  const s = current();
  const d = btn.dataset;

  if (d.open) return open(d.open);
  if (d.view) return open(d.view, 'done');
  if (d.delete) {
    const victim = store.sessions.find((x) => x.id === d.delete);
    if (victim && confirm(`Delete your walk-through of ${victim.label}? Your translation of it will be lost.`)) {
      store.sessions = store.sessions.filter((x) => x.id !== d.delete);
      if (store.current === d.delete) store.current = null;
      save();
      render();
    }
    return;
  }
  if (d.action === 'home') {
    store.current = null;
    save();
    ui.view = 'start';
    render();
    return;
  }
  if (d.action === 'cheat') return $('#cheat').showModal();
  if (!s) return;

  const pos = s.at;
  const verse = s.verses[pos.v];
  const word = verse?.words[pos.w];

  if (d.goto != null) {
    const [v, w] = d.goto.split('.').map(Number);
    s.at = { v, w };
    touch(s);
    ui.view = 'walk';
    render();
    if (btn.matches('.wk-past-btn, .wk-next-btn')) scrollToCard();
    return;
  }

  switch (d.action) {
    case 'class': {
      const a = ensureAnswer(s);
      a.cls = d.cls;
      a.clsOk = d.cls === wordClass(word);
      recordStreak(s, a.clsOk);
      reward(btn, a.clsOk, POINTS.cls, s);
      touch(s);
      render();
      break;
    }
    case 'pick': {
      const a = ensureAnswer(s);
      a.parse = { ...a.parse, [d.field]: d.value };
      if (a.marks) delete a.marks[d.field];
      sound('tap', store.opts.sound);
      touch(s);
      render();
      break;
    }
    case 'check': {
      const a = ensureAnswer(s);
      const fields = walkFields(word, s.opts);
      const missing = fields.filter((f) => !a.parse?.[f]);
      if (missing.length) {
        a.notice = `Choose a ${missing.map((f) => FIELDS[f].label.toLowerCase()).join(', ')} first.`;
        render();
        break;
      }
      delete a.notice;
      const result = checkParse(word, a.parse);
      const ok = fields.every((f) => result.fields[f].ok);
      a.marks = Object.fromEntries(fields.map((f) => [f, result.fields[f].ok]));
      const first = a.firstTry == null;
      if (first) {
        a.firstTry = ok;
        recordStreak(s, ok);
        reward(btn, ok, POINTS.parse, s);
      } else {
        ui.fx = ok ? 'good' : 'bad';
        sound(ok ? 'good' : 'bad', store.opts.sound);
      }
      if (ok) a.solved = true;
      touch(s);
      render();
      break;
    }
    case 'reveal': {
      const a = ensureAnswer(s);
      a.revealed = true;
      if (a.firstTry == null) {
        a.firstTry = false;
        recordStreak(s, false);
      }
      touch(s);
      render();
      break;
    }
    case 'next': {
      if (word) ensureAnswer(s).done = true;
      // Leaving a verse you have translated earns its points.
      if (!word && s.translations[pos.v]?.trim()) {
        floatPoints(btn, `+${POINTS.verse} XP`);
        sound('good', store.opts.sound);
      }
      const next = nextPosition(s, pos);
      if (next && next.w === s.verses[next.v].words.length) {
        banner(`Verse ${s.verses[next.v].v} parsed!`);
        confetti({ count: 60 });
        sound('win', store.opts.sound);
      }
      if (next) {
        s.at = next;
        touch(s);
        ui.focusTranslation = next.w === s.verses[next.v].words.length;
        render();
        scrollToCard();
      } else finish(s);
      break;
    }
    case 'prev': {
      const prev = prevPosition(s, pos);
      if (prev) {
        s.at = prev;
        touch(s);
        render();
        scrollToCard();
      }
      break;
    }
    case 'finish':
      finish(s);
      break;
    case 'edit':
      ui.view = 'walk';
      render();
      scrollToCard();
      break;
    case 'print':
      window.print();
      break;
    case 'copy':
      copyText(translationText(s)).then((ok) => flash(ok ? 'Copied.' : 'Copy failed — select the text and copy it instead.'));
      break;
    case 'txt':
      download(`${fileSlug(s.label)}.txt`, translationText(s));
      break;
    case 'md':
      download(`${fileSlug(s.label)}.md`, translationMarkdown(s, { greek: ui.showGreek, notes: ui.showNotes, gloss: (l) => entryFor(l)?.gloss }), 'text/markdown');
      break;
    default:
  }
}

function ensureAnswer(s) {
  const key = answerKey(s.at.v, s.at.w);
  s.answers[key] ??= {};
  return s.answers[key];
}

function finish(s) {
  s.finished = Date.now();
  touch(s);
  ui.view = 'done';
  ui.celebrate = true;
  render();
  window.scrollTo({ top: 0 });
  sound('win', store.opts.sound);
  confetti({ y: innerHeight * 0.25, count: 90, spread: 1.4 });
  setTimeout(() => confetti({ x: innerWidth * 0.2, y: innerHeight * 0.4, count: 40 }), 350);
  setTimeout(() => confetti({ x: innerWidth * 0.8, y: innerHeight * 0.4, count: 40 }), 600);
}

/** Points, confetti and sound for a first-try answer; the level-up banner when one is crossed. */
function reward(el, right, points, s) {
  ui.fx = right ? 'good' : 'bad';
  sound(right ? 'good' : 'bad', store.opts.sound);
  if (!right) {
    if ((s.best ?? 0) >= 3 && s.streak === 0) floatPoints(el, 'streak lost', 'bad');
    return;
  }
  const before = level(score(s) - points).level;
  floatPoints(el, `+${points} XP`);
  confettiFrom(el, { count: s.streak >= 5 ? 36 : 18, spread: 0.6 });
  if (level(score(s)).level > before) {
    banner(`Level ${level(score(s)).level}!`);
    confetti({ count: 80 });
  } else if (s.streak > 0 && s.streak % 5 === 0) {
    banner(`${s.streak} in a row!`);
  }
}

function flash(message) {
  const el = $('#wk-flash');
  if (!el) return;
  el.textContent = message;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { el.textContent = ''; }, 2500);
}

function scrollToCard() {
  requestAnimationFrame(() => {
    const card = $('.wk-card', root);
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  const s = current();
  if (ui.view === 'walk' && s) root.innerHTML = renderWalk(s);
  else if (ui.view === 'done' && s) root.innerHTML = renderDone(s);
  else root.innerHTML = renderStart();
  root.querySelectorAll('textarea[data-tr]').forEach(autosize);
  if (ui.focusTranslation) {
    ui.focusTranslation = false;
    $('textarea[data-tr].current', root)?.focus({ preventScroll: true });
  }
}

function renderStart() {
  const list = store.sessions.map((s) => {
    const p = progress(s);
    const state = s.finished ? 'finished' : `${p.done} of ${p.words} words`;
    return `<li class="wk-saved">
      <div><b>${esc(s.label)}</b><span class="muted"> · ${state} · ${p.translated}/${p.verses} verses translated · ${esc(formatDate(new Date(s.updated)))}</span></div>
      <div class="wk-saved-actions">
        <button class="btn btn-sm" type="button" data-open="${s.id}">${s.finished ? 'Revisit' : 'Continue'}</button>
        <button class="btn btn-sm" type="button" data-view="${s.id}">Translation</button>
        <button class="btn btn-sm btn-quiet" type="button" data-delete="${s.id}" aria-label="Delete ${esc(s.label)}">Delete</button>
      </div>
    </li>`;
  }).join('');
  return `
  <section class="wk-intro">
    <h1>Walk through a passage</h1>
    <p>Give a reference. You will meet the passage one word at a time: say what kind of word it is, parse every verb and noun, see what the form means for your English, then write each verse in your own words. At the end your verses come together as your translation, ready to print or save.</p>
    <form id="wk-start" class="wk-start" autocomplete="off">
      <input type="text" id="wk-ref" placeholder="e.g. John 1:1-5" aria-label="Scripture reference" required>
      <button class="btn btn-primary" type="submit"${ui.busy ? ' disabled' : ''}>Start</button>
    </form>
    <p class="status ${ui.statusKind}" id="wk-status" role="status" aria-live="polite">${esc(ui.status)}</p>
    <div class="wk-opts">
      ${optToggles(store.opts)}
    </div>
  </section>
  ${list ? `<section class="wk-list"><h2>Your walk-throughs</h2><ul>${list}</ul></section>` : ''}`;
}

function optToggles(opts) {
  return `<label class="toggle"><input type="checkbox" data-opt="askClass"${opts.askClass ? ' checked' : ''}> Ask me what kind of word each one is</label>
      <label class="toggle"><input type="checkbox" data-opt="parseArticles"${opts.parseArticles ? ' checked' : ''}> Parse the article (ὁ, ἡ, τό) too</label>
      <label class="toggle"><input type="checkbox" data-opt="sound"${store.opts.sound ? ' checked' : ''}> Sound effects</label>`;
}

function renderWalk(s) {
  const p = progress(s);
  const pct = p.words ? Math.round((p.done / p.words) * 100) : 0;
  const verses = s.verses.map((verse, vi) => {
    if (vi === s.at.v) return renderCurrentVerse(s, verse, vi);
    const tr = s.translations[vi]?.trim();
    const cls = vi < s.at.v ? 'past' : 'future';
    return `<li class="wk-verse ${cls}">
      <button class="wk-past-btn" type="button" data-goto="${vi}.0" title="Go to ${esc(verseLabel(s, verse))}">
        <span class="wk-vnum">${verse.v}</span>
        <span class="${tr ? 'wk-tr-line' : 'greek wk-gk-line'}">${esc(tr || verse.words.map((w) => w.text).join(' '))}</span>
      </button>
    </li>`;
  }).join('');
  return `
  <div class="wk-head">
    <div class="wk-head-row">
      <h1>${esc(s.label)}</h1>
      <div class="wk-head-actions">
        <button class="btn btn-sm btn-quiet" type="button" data-action="cheat">Endings cheat sheet</button>
        <button class="btn btn-sm" type="button" data-action="finish">See my translation</button>
        <button class="btn btn-sm btn-quiet" type="button" data-action="home">All passages</button>
      </div>
    </div>
    ${hud(s, p, pct)}
    <details class="wk-opts-inline"><summary>Options</summary>${optToggles(s.opts)}</details>
  </div>
  <ol class="wk-verses">${verses}</ol>`;
}

function hud(s, p, pct) {
  const xp = score(s);
  const lv = level(xp);
  const streak = s.streak ?? 0;
  return `<div class="wk-hud">
      <div class="wk-badge wk-lv" title="${xp} XP"><span class="wk-gem">${lv.level}</span><span class="wk-badge-text"><b>Level ${lv.level}</b><span class="wk-xpbar"><i style="width:${lv.into}%"></i></span><small>${xp} XP</small></span></div>
      <div class="wk-badge wk-streak${streak >= 3 ? ' hot' : ''}${streak >= 8 ? ' blazing' : ''}" title="Right first time in a row. Best: ${s.best ?? 0}"><span class="wk-flame" aria-hidden="true">🔥</span><span class="wk-badge-text"><b>${streak}</b><small>streak</small></span></div>
      <div class="wk-badge"><span class="wk-badge-text"><b>${p.done}/${p.words}</b><small>words</small></span></div>
      <div class="wk-badge"><span class="wk-badge-text"><b>${p.translated}/${p.verses}</b><small>verses</small></span></div>
    </div>
    <div class="wk-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress through the passage"><i style="width:${pct}%"></i></div>`;
}

function renderCurrentVerse(s, verse, vi) {
  const words = verse.words.map((w, wi) => {
    const a = answerFor(s, vi, wi);
    const cur = wi === s.at.w;
    let state = '';
    if (a?.done) state = a.firstTry === false || a.clsOk === false ? ' miss' : ' ok';
    const under = a?.done
      ? `<span class="wk-u">${esc(shortGloss(w.lemma) ?? '')}</span><span class="wk-p">${esc(walkFields(w, { parseArticles: true }).length ? describeParse(w) : '')}</span>`
      : '';
    return `<button type="button" class="wk-w${cur ? ' cur' : ''}${state}" data-goto="${vi}.${wi}" aria-current="${cur}" style="--i:${wi}">
      <span class="greek wk-g">${esc(w.text)}</span>${under}</button>`;
  }).join(' ');
  const translating = s.at.w >= verse.words.length;
  const lineEnter = ui.lastVerse !== `${s.id}:${vi}`;
  ui.lastVerse = `${s.id}:${vi}`;
  return `<li class="wk-verse current">
    <div class="wk-vlabel">${esc(verseLabel(s, verse))}</div>
    <div class="wk-line${lineEnter ? ' enter' : ''}">${words}</div>
    ${translating ? '' : renderCard(s, verse, vi, s.at.w)}
    <label class="wk-tr-label" for="tr-${vi}">Your translation of verse ${verse.v}</label>
    <textarea id="tr-${vi}" class="wk-tr${translating ? ' current' : ''}" data-tr="${vi}" rows="2" lang="en" placeholder="Write it in your own English">${esc(s.translations[vi] ?? '')}</textarea>
    ${translating ? renderTranslateCard(s, verse, vi) : ''}
  </li>`;
}

function renderTranslateCard(s, verse, vi) {
  const last = vi === s.verses.length - 1;
  const rows = verse.words.map((w) => {
    const gloss = shortGloss(w.lemma) ?? '';
    const parse = walkFields(w, { parseArticles: true }).length ? describeParse(w) : classLabel(w);
    return `<tr><td class="greek">${esc(w.word)}</td><td>${esc(gloss)}</td><td class="muted">${esc(parse)}</td></tr>`;
  }).join('');
  const enter = ui.lastCard !== `${s.id}:${vi}.t`;
  ui.lastCard = `${s.id}:${vi}.t`;
  return `<section class="wk-card wk-translate wk-tilt${enter ? ' enter' : ''}">
    <h2>Now translate verse ${verse.v}</h2>
    <p>You have been through every word. Write the verse above in natural English: find the main verb and its subject first, then attach the rest.</p>
    <details><summary>Your word-by-word notes</summary><table class="wk-notes">${rows}</table></details>
    <div class="wk-card-actions">
      <button class="btn" type="button" data-action="prev">← Back</button>
      <button class="btn btn-primary" type="button" data-action="next" data-primary>${last ? 'Finish: see my translation' : `Next verse →`}</button>
    </div>
  </section>`;
}

function renderCard(s, verse, vi, wi) {
  const word = verse.words[wi];
  const a = answerFor(s, vi, wi) ?? {};
  const stage = wordStage(s, vi, wi);
  const fields = walkFields(word, s.opts);
  const head = `<div class="wk-card-head">
      <span class="greek wk-big">${esc(word.word)}</span>
      <span class="muted">word ${wi + 1} of ${verse.words.length}</span>
    </div>`;
  const back = `<button class="btn" type="button" data-action="prev"${vi === 0 && wi === 0 ? ' disabled' : ''}>← Back</button>`;
  const key = `${s.id}:${vi}.${wi}`;
  const fx = `wk-tilt${ui.lastCard !== key ? ' enter' : ''}${ui.fx ? ` fx-${ui.fx}` : ''}${stage === 'summary' ? ' flipped' : ''}`;
  ui.lastCard = key;
  ui.fx = null;

  if (stage === 'class') {
    const buttons = Object.entries(CLASSES).map(([key, label]) =>
      `<button class="btn wk-choice" type="button" data-action="class" data-cls="${key}">${label}</button>`).join('');
    return `<section class="wk-card ${fx}">${head}
      <h2>What kind of word is this?</h2>
      <div class="wk-choices">${buttons}</div>
      <p class="hint">Look at the ending. Verbs end in person endings (‑ω, ‑ει, ‑ουσιν, ‑εται, ‑σεν…); nouns, adjectives, articles and pronouns end in case endings (‑ος, ‑ου, ‑ῳ, ‑ον, ‑η, ‑ης…). Words that never change are prepositions, conjunctions, adverbs or particles. <button class="linkish" type="button" data-action="cheat">Endings cheat sheet</button></p>
      <div class="wk-card-actions">${back}</div>
    </section>`;
  }

  const classLine = s.opts.askClass && a.cls
    ? (a.clsOk
      ? `<p class="wk-fb ok">✓ ${esc(cap(classLabel(word)))}</p>`
      : `<p class="wk-fb bad">✗ You said ${esc(CLASSES[a.cls].toLowerCase())}. It is ${/^[aeiou]/.test(classLabel(word)) ? 'an' : 'a'} ${esc(classLabel(word))}.</p>`)
    : `<p class="wk-fb">${esc(cap(classLabel(word)))}</p>`;

  if (stage === 'parse') {
    const rows = fields.map((f) => {
      const mark = a.marks?.[f];
      const chosen = a.parse?.[f];
      const opts = Object.entries(FIELDS[f].options).map(([value, label]) =>
        `<button type="button" class="wk-seg${chosen === value ? ' on' : ''}" data-action="pick" data-field="${f}" data-value="${value}" aria-pressed="${chosen === value}">${label}</button>`).join('');
      const flag = mark === true ? '<span class="wk-mark ok" aria-label="right">✓</span>' : mark === false ? '<span class="wk-mark bad" aria-label="not right">✗</span>' : '';
      return `<div class="wk-field${mark === false ? ' bad' : ''}"><span class="wk-flabel">${FIELDS[f].label}${flag}</span><div class="wk-segs">${opts}</div></div>`;
    }).join('');
    const tried = a.marks && Object.values(a.marks).some((m) => m === false);
    return `<section class="wk-card ${fx}">${head}${classLine}
      <h2>Parse it</h2>
      ${rows}
      ${a.notice ? `<p class="status error">${esc(a.notice)}</p>` : ''}
      ${tried ? '<p class="hint">Fields marked ✗ are not right yet. Change them and check again, or ask to be shown.</p>' : ''}
      <div class="wk-card-actions">
        ${back}
        <button class="btn btn-quiet" type="button" data-action="reveal">Show me</button>
        <button class="btn btn-quiet" type="button" data-action="cheat">Cheat sheet</button>
        <button class="btn btn-primary" type="button" data-action="check" data-primary>Check</button>
      </div>
    </section>`;
  }

  // Summary
  const entry = entryFor(word.lemma);
  const parsed = fields.length
    ? `<p class="wk-parse">${a.revealed && !a.solved ? '<span class="wk-mark bad">Shown:</span> ' : a.solved ? '<span class="wk-mark ok">✓</span> ' : ''}<b>${esc(describeParse(word, { long: true }))}</b></p>`
    : '';
  const band = entry ? frequencyBand(entry.frequency) : null;
  const lex = `<div class="wk-lex">
      <span class="greek wk-lemma">${esc(entry?.headword ?? word.lemma)}</span>
      <span>${esc(entry?.gloss ?? '(no gloss available)')}</span>
      ${entry ? `<span class="muted">· ${entry.frequency}× in the NT, ${band.label}</span>` : ''}
    </div>`;
  const hints = renderingHints(word).map((h) => `<li>${esc(h)}</li>`).join('');
  const lastWord = wi === verse.words.length - 1;
  return `<section class="wk-card ${fx}">${head}${classLine}${parsed}
    <h3>Dictionary form</h3>${lex}
    ${hints ? `<h3>What this means for your translation</h3><ul class="wk-hints">${hints}</ul>` : ''}
    <div class="wk-card-actions">
      ${back}
      <button class="btn btn-primary" type="button" data-action="next" data-primary>${lastWord ? 'Translate the verse →' : 'Next word →'}</button>
    </div>
  </section>`;
}

function renderDone(s) {
  const p = progress(s);
  const multi = new Set(s.verses.map((v) => v.c)).size > 1;
  const body = s.verses.map((verse, i) => {
    const first = i === 0 || s.verses[i - 1].c !== verse.c;
    const mark = multi && first ? `${verse.c}:${verse.v}` : verse.v;
    const tr = s.translations[i]?.trim();
    return `<sup>${mark}</sup>${tr ? esc(tr) : '<span class="muted">[not translated]</span>'} `;
  }).join('');
  const detail = (ui.showGreek || ui.showNotes) ? s.verses.map((verse, vi) => {
    const rows = ui.showNotes ? `<table class="wk-notes">${verse.words.map((w, wi) => {
      const a = answerFor(s, vi, wi);
      const mark = a?.firstTry === true ? '✓' : a?.firstTry === false ? '✗' : '';
      const parse = walkFields(w, { parseArticles: true }).length ? describeParse(w) : classLabel(w);
      return `<tr><td class="greek">${esc(w.word)}</td><td class="greek muted">${esc(w.lemma)}</td><td>${esc(parse)}</td><td>${esc(shortGloss(w.lemma) ?? '')}</td><td class="wk-mark ${mark === '✓' ? 'ok' : 'bad'}">${mark}</td></tr>`;
    }).join('')}</table>` : '';
    return `<section class="wk-detail">
      <h3>${esc(verseLabel(s, verse))}</h3>
      ${ui.showGreek ? `<p class="greek wk-detail-gk">${esc(verse.words.map((w) => w.text).join(' '))}</p>` : ''}
      ${rows}
      <p class="wk-detail-tr">${esc(s.translations[vi]?.trim() || '[not translated]')}</p>
    </section>`;
  }).join('') : '';
  const tally = [];
  if (p.classAsked) tally.push(`word class right ${p.classRight} of ${p.classAsked}`);
  if (p.parsed) tally.push(`parsed right first time ${p.parsedRight} of ${p.parsed}`);
  const xp = score(s);
  const acc = p.parsed ? Math.round((p.parsedRight / p.parsed) * 100) : null;
  const celebrate = ui.celebrate;
  ui.celebrate = false;
  return `
  <section class="wk-trophy no-print${celebrate ? ' enter' : ''}">
    <div class="wk-cup" aria-hidden="true"><span>🏆</span></div>
    <h2>${esc(s.label)} translated!</h2>
    <div class="wk-medals">
      <div class="wk-medal gold"><b>${xp}</b><small>XP · level ${level(xp).level}</small></div>
      <div class="wk-medal"><b>${s.best ?? 0}</b><small>best streak</small></div>
      <div class="wk-medal"><b>${acc == null ? '—' : `${acc}%`}</b><small>parsed first time</small></div>
    </div>
  </section>
  <div class="wk-done-bar no-print">
    <button class="btn btn-primary" type="button" data-action="print">Print / save as PDF</button>
    <button class="btn" type="button" data-action="copy">Copy text</button>
    <button class="btn" type="button" data-action="txt">Download .txt</button>
    <button class="btn" type="button" data-action="md">Download .md</button>
    <span id="wk-flash" class="wk-flash" role="status" aria-live="polite"></span>
  </div>
  <div class="wk-done-opts no-print">
    <label class="toggle"><input type="checkbox" data-show="showGreek"${ui.showGreek ? ' checked' : ''}> Include the Greek</label>
    <label class="toggle"><input type="checkbox" data-show="showNotes"${ui.showNotes ? ' checked' : ''}> Include my word-by-word parsing</label>
  </div>
  <article class="wk-final${celebrate ? ' enter' : ''}">
    <h1>${esc(s.label)}</h1>
    <p class="wk-final-text">${body}</p>
    <p class="wk-final-meta">My translation · ${esc(formatDate(new Date(s.finished ?? s.updated)))} · Greek text: SBL Greek New Testament</p>
    ${detail}
  </article>
  ${tally.length ? `<p class="wk-score no-print">This session: ${tally.join(', ')}. ${p.translated} of ${p.verses} verse${p.verses === 1 ? '' : 's'} translated.</p>` : ''}
  <div class="wk-done-bar no-print">
    <button class="btn" type="button" data-action="edit">← Back to the passage</button>
    <button class="btn btn-quiet" type="button" data-action="home">Start another passage</button>
  </div>`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
