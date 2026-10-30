import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ExpressionTimeline,
  ExpressionClock,
  parseExpression,
  expressionMoods,
} from '../apps/web/src/lib/panel-expression.ts';

const expression = (id = 'one', mood = 'annoyed') => ({
  id,
  mood,
  intensity: 0.35,
  duration: 900,
  startedAt: 500000,
  expiresAt: 500900,
});
const snapshot = (value, serverNow = 500000, receivedAt = 10) => ({
  expression: value,
  serverNow,
  receivedAt,
});

test('every callable emote survives parsing, replacement and expiry', () => {
  const timeline = new ExpressionTimeline();
  for (const [index, mood] of expressionMoods.entries()) {
    const cue = expression(`emote-${index}`, mood);
    assert.equal(parseExpression(cue).mood, mood);
    assert.equal(timeline.observe(snapshot(cue), 10, true).mood, mood);
  }
  assert.equal(timeline.at(910), null);
});

test('calibrated server clock rejects an expired first SSE delivery after a stall', () => {
  const clock = new ExpressionClock();
  clock.calibrate(500000, 0, 20);
  const now = 2000;
  const delayed = snapshot(expression(), clock.estimate(500050, now), now);
  assert.equal(new ExpressionTimeline().observe(delayed, now, true), null);
});

test('delayed initial HTTP response and fresh heartbeat cannot move the clock backwards', () => {
  const clock = new ExpressionClock();
  clock.calibrate(500000, 0, 2000);
  assert.equal(clock.estimate(500000, 2000), 502000);
  assert.equal(clock.estimate(500100, 2050), 502050);
  assert.equal(
    new ExpressionTimeline().observe(snapshot(expression(), 502050, 2050), 2050, true),
    null,
  );
});

test('server-relative elapsed time is independent of client wall clock and includes time waiting to render', () => {
  const timeline = new ExpressionTimeline();
  const active = timeline.observe(snapshot(expression(), 500300, 10), 60, true);
  assert.equal(active.elapsed, 350);
  assert.equal(active.deadline, 610);
});

test('heartbeats preserve animation identity and never extend its original expiry', () => {
  const timeline = new ExpressionTimeline();
  const active = timeline.observe(snapshot(expression()), 10, true);
  assert.equal(timeline.observe(snapshot(expression(), 500400, 410), 410, true), active);
  assert.equal(timeline.at(910), null);
  assert.equal(timeline.observe(snapshot(expression(), 500500, 920), 920, true), null);
});

test('replacement survives the earlier deadline and clear cannot replay the same ID', () => {
  const timeline = new ExpressionTimeline();
  timeline.observe(snapshot(expression()), 10, true);
  const replacement = timeline.observe(
    snapshot({ ...expression('two', 'grumpy'), startedAt: 500800, expiresAt: 501700 }, 500800, 810),
    810,
    true,
  );
  assert.equal(timeline.at(910), replacement);
  assert.equal(timeline.observe(snapshot(null), 1000, true), null);
  assert.equal(timeline.observe(snapshot(replacement, 500850, 1000), 1000, true), null);
});

test('an expired reconnect stays clear; an active reconnect resumes partway through', () => {
  assert.equal(new ExpressionTimeline().observe(snapshot(expression(), 500901), 10, true), null);
  const active = new ExpressionTimeline().observe(snapshot(expression(), 500600), 10, true);
  assert.equal(active.elapsed, 600);
  assert.equal(active.deadline, 310);
});

test('effects off, reduced motion, and hidden-tab suppression consume the expression without replay', () => {
  const timeline = new ExpressionTimeline();
  assert.equal(timeline.observe(snapshot(expression()), 10, false), null);
  assert.equal(timeline.observe(snapshot(expression()), 20, true), null);
  assert.ok(timeline.observe(snapshot(expression('two')), 30, true));
  assert.equal(timeline.observe(snapshot(expression('two')), 40, false), null);
  assert.equal(timeline.observe(snapshot(expression('two')), 50, true), null);
});

test('expression parsing rejects unknown moods and malformed timing or intensity', () => {
  assert.deepEqual(parseExpression(expression()), expression());
  assert.equal(parseExpression(undefined), null);
  for (const invalid of [
    { ...expression(), mood: 'angry' },
    { ...expression(), intensity: Number.NaN },
    { ...expression(), intensity: 1.1 },
    { ...expression(), duration: 2000 },
    { ...expression(), expiresAt: 500700 },
    { ...expression(), startedAt: Number.POSITIVE_INFINITY },
  ])
    assert.throws(() => parseExpression(invalid), /unreadable expression/);
});

test('a clean clock retry restores future expressions after a stalled initial response', () => {
  const clock = new ExpressionClock();
  clock.calibrate(1002000, 0, 2000);
  clock.calibrate(1002020, 2010, 2030);
  const serverNow = clock.estimate(1003000, 3000);
  const cue = { ...expression(), startedAt: 1003000, expiresAt: 1004500, duration: 1500 };
  assert.ok(new ExpressionTimeline().observe(snapshot(cue, serverNow, 3000), 3000, true));
  clock.calibrate(1003100, 3000, 3500);
  assert.ok(clock.estimate(1003100, 3500) < 1004000);
});
