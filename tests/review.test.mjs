import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, grade, isDue, dueCards, deckSummary, describeNext, BOX_INTERVALS, LAST_BOX } from '../js/review.js';

const DAY = 86400000;

test('a new card is due immediately', () => {
  const card = newCard(1000);
  assert.equal(card.box, 0);
  assert.ok(isDue(card, 1000));
});

test('recall moves the card up a box and pushes the next review out', () => {
  let card = grade(newCard(0), true, 0);
  assert.equal(card.box, 1);
  assert.equal(card.due, BOX_INTERVALS[1] * DAY);
  assert.equal(card.right, 1);
  card = grade(card, true, 0);
  assert.equal(card.box, 2);
  assert.equal(card.due, BOX_INTERVALS[2] * DAY);
  assert.ok(!isDue(card, DAY));
});

test('a miss sends the card back to the first box', () => {
  let card = newCard(0);
  for (let i = 0; i < 5; i++) card = grade(card, true, 0);
  assert.equal(card.box, LAST_BOX);
  card = grade(card, false, 0);
  assert.equal(card.box, 0);
  assert.ok(isDue(card, 0));
  assert.equal(card.seen, 6);
  assert.equal(card.right, 5);
});

test('due cards come back most overdue first', () => {
  const deck = {
    soon: { box: 1, due: 5 * DAY },
    overdue: { box: 0, due: 1 * DAY },
    middle: { box: 0, due: 2 * DAY },
  };
  assert.deepEqual(dueCards(deck, 3 * DAY).map((c) => c.lemma), ['overdue', 'middle']);
  const summary = deckSummary(deck, 3 * DAY);
  assert.equal(summary.total, 3);
  assert.equal(summary.due, 2);
  assert.equal(summary.next, 5 * DAY);
});

test('describeNext reads as plain English', () => {
  assert.equal(describeNext(DAY, 0), 'tomorrow');
  assert.equal(describeNext(3 * DAY, 0), 'in 3 days');
  assert.equal(describeNext(3600000, 0), 'later today');
  assert.equal(describeNext(null), null);
});
