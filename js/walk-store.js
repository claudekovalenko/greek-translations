// Saved walk-throughs, shared by the walk-through page (walk.html) and the
// game (quest.html): both read and write the same sessions, so a passage
// started in one carries on in the other.

import { parseReference } from './refs.js';
import { loadBook } from './datasource.js';
import { groupVerses, selectVerses } from './morphgnt.js';
import { newSession } from './walk-core.js';

const STORE_KEY = 'anagnosis-walk-v1';

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (data && Array.isArray(data.sessions)) {
      data.opts = { askClass: true, parseArticles: false, sound: false, ...data.opts };
      return data;
    }
  } catch { /* fall through */ }
  return { current: null, sessions: [], opts: { askClass: true, parseArticles: false, sound: false } };
}

export const store = loadStore();

let saveTimer = null;
export function save({ soon = false } = {}) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
  };
  if (soon) saveTimer = setTimeout(write, 300);
  else write();
}

export const current = () => store.sessions.find((s) => s.id === store.current) ?? null;

export function touch(session) {
  session.updated = Date.now();
  save();
}

/** Make a saved session the current one. */
export function select(id) {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return null;
  store.current = id;
  save();
  return s;
}

/**
 * Open a passage by reference: the unfinished session for it if there is
 * one, otherwise a new one with the text loaded. Throws a user-facing Error.
 * @returns {Promise<{ session: object, resumed: boolean }>}
 */
export async function openPassage(text, { onStatus = () => {} } = {}) {
  const range = parseReference(text);
  const existing = store.sessions.find((s) => s.label === range.label && !s.finished);
  if (existing) {
    select(existing.id);
    return { session: existing, resumed: true };
  }
  onStatus(`Loading ${range.label}…`);
  const { words } = await loadBook(range.book.id, { onStatus });
  const verses = selectVerses(groupVerses(words), range);
  if (!verses.length) throw new Error(`No verses found for ${range.label}.`);
  const session = newSession({ label: range.label, verses });
  session.opts = { askClass: store.opts.askClass, parseArticles: store.opts.parseArticles };
  store.sessions.unshift(session);
  store.current = session.id;
  save();
  return { session, resumed: false };
}
