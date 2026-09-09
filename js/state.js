// Project state and persistence (localStorage).

const KEY = 'anagnosis.project.v1';

export function emptyState() {
  return {
    version: 1,
    passages: [],
    drills: {},      // wordKey → { correct, attempts, given, at }
    paradigms: {},   // "lemma|TVM" → { correct, total, at }
    openVocab: {},   // passage id → is its glossary open
    settings: { strict: false, hints: true, interlinear: true },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return emptyState();
    return { ...emptyState(), ...parsed, settings: { ...emptyState().settings, ...(parsed.settings ?? {}) } };
  } catch {
    return emptyState();
  }
}

let saveTimer = null;
export function saveState(state, { immediate = false } = {}) {
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: the session still works in memory */
    }
  };
  if (immediate) { clearTimeout(saveTimer); write(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 250);
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function wordKey(verse, index) {
  return `${verse.b}.${verse.c}.${verse.v}.${index}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Summary counts for the score panel. */
export function scoreSummary(state) {
  const drills = Object.values(state.drills);
  const parsed = drills.length;
  const correct = drills.filter((d) => d.correct).length;
  const paradigms = Object.values(state.paradigms);
  const cells = paradigms.reduce((n, p) => n + p.total, 0);
  const cellsCorrect = paradigms.reduce((n, p) => n + p.correct, 0);
  const translated = state.passages.reduce((n, p) => n + p.verses.filter((v) => v.translation?.trim()).length, 0);
  const verses = state.passages.reduce((n, p) => n + p.verses.length, 0);
  return { parsed, correct, cells, cellsCorrect, translated, verses };
}
