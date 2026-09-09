// Spaced repetition for vocabulary, using Leitner boxes.
//
// A card moves up a box when you recall it and back to the first box when you
// do not. Each box is reviewed after a fixed interval, so words you keep
// missing come back tomorrow and words you know drift out to a month.

export const BOX_INTERVALS = [0, 1, 3, 7, 16, 35]; // days before the next review
export const LAST_BOX = BOX_INTERVALS.length - 1;
const DAY = 86400000;

export function newCard(now = Date.now()) {
  return { box: 0, due: now, seen: 0, right: 0, added: now };
}

/** Schedule a card after an answer. Returns a new card record. */
export function grade(card, remembered, now = Date.now()) {
  const box = remembered ? Math.min(card.box + 1, LAST_BOX) : 0;
  return {
    ...card,
    box,
    seen: (card.seen ?? 0) + 1,
    right: (card.right ?? 0) + (remembered ? 1 : 0),
    due: now + BOX_INTERVALS[box] * DAY,
    last: now,
  };
}

export function isDue(card, now = Date.now()) {
  return !card || (card.due ?? 0) <= now;
}

/** Cards ready for review, most overdue first. */
export function dueCards(deck, now = Date.now()) {
  return Object.entries(deck ?? {})
    .filter(([, card]) => isDue(card, now))
    .sort((a, b) => (a[1].due ?? 0) - (b[1].due ?? 0))
    .map(([lemma, card]) => ({ lemma, card }));
}

/** When the next card falls due, or null when the deck is empty. */
export function nextDue(deck, now = Date.now()) {
  const times = Object.values(deck ?? {}).map((c) => c.due ?? 0).filter((t) => t > now);
  return times.length ? Math.min(...times) : null;
}

export function deckSummary(deck, now = Date.now()) {
  const cards = Object.values(deck ?? {});
  return {
    total: cards.length,
    due: cards.filter((c) => isDue(c, now)).length,
    learned: cards.filter((c) => c.box >= LAST_BOX).length,
    next: nextDue(deck, now),
  };
}

/** "in 3 days", "tomorrow", "later today" — for the empty review screen. */
export function describeNext(timestamp, now = Date.now()) {
  if (!timestamp) return null;
  const days = Math.round((timestamp - now) / DAY);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
