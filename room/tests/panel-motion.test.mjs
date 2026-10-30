import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ActivityTimeline,
  activityMotion,
  expressionMotion,
} from '../apps/web/src/lib/panel-motion.ts';

const frame = (phase = 'idle', status = 'completed', id = 'turn-one', connected = true) => ({
  phase,
  connected,
  reply: { id, status },
});

test('historical replies and heartbeats stay still; a live turn attends, speaks and settles once', () => {
  const timeline = new ActivityTimeline();
  assert.equal(timeline.observe(frame(), true, false), null);
  assert.equal(timeline.observe(frame(), true, false), null);
  assert.equal(timeline.observe(frame('thinking', 'streaming', 'new'), true, false), 'attend');
  assert.equal(timeline.observe(frame('thinking', 'streaming', 'new'), true, false), null);
  assert.equal(timeline.observe(frame('writing', 'streaming', 'new'), true, false), 'speak');
  assert.equal(timeline.observe(frame('writing', 'streaming', 'new'), true, false), null);
  assert.equal(timeline.observe(frame('idle', 'completed', 'new'), true, false), 'settle');
  assert.equal(timeline.observe(frame('idle', 'completed', 'new'), true, false), null);
});

test('failed and interrupted replies never receive a successful completion nod', () => {
  for (const status of ['failed', 'stopped']) {
    const timeline = new ActivityTimeline();
    timeline.observe(frame(), true, false);
    timeline.observe(frame('writing', 'streaming'), true, false);
    assert.equal(timeline.observe(frame('idle', status), true, false), null);
  }
});

test('a pending request ending before its streaming snapshot does not nod at the old reply', () => {
  const timeline = new ActivityTimeline();
  timeline.observe(frame(), true, false);
  timeline.observe(frame('thinking', 'completed'), true, false);
  assert.equal(timeline.observe(frame(), true, false), null);
});

test('reconnection, first mount and reenabling effects do not replay activity', () => {
  const timeline = new ActivityTimeline();
  assert.equal(timeline.observe(frame('writing', 'streaming'), true, false), null);
  assert.equal(
    timeline.observe(frame('writing', 'streaming', 'turn-one', false), true, false),
    null,
  );
  assert.equal(timeline.observe(frame('idle', 'completed'), true, false), null);
  assert.equal(timeline.observe(frame('thinking', 'streaming'), false, false), null);
  assert.equal(timeline.observe(frame('writing', 'streaming'), true, false), null);
});

test('explicit emotes consume competing activity without queuing a late gesture', () => {
  const timeline = new ActivityTimeline();
  timeline.observe(frame(), true, false);
  assert.equal(timeline.observe(frame('thinking', 'streaming'), true, true), null);
  assert.equal(timeline.observe(frame('writing', 'streaming'), true, true), null);
  assert.equal(timeline.observe(frame(), true, true), null);
  assert.equal(timeline.observe(frame(), true, false), null);
});

test('all emotes settle at neutral and zero intensity produces neutral transforms', () => {
  for (const agent of ['luna', 'opus']) {
    for (const mood of ['annoyed', 'grumpy', 'amused', 'skeptical', 'startled']) {
      const keyframes = expressionMotion(mood, 1, agent);
      assert.deepEqual(keyframes.at(-1), { transform: keyframes[0].transform, offset: 1 });
      for (const keyframe of expressionMotion(mood, 0, agent)) {
        assert.doesNotMatch(keyframe.transform, /(?:\(|\s)-?[1-9]/);
      }
    }
  }
  assert.ok(activityMotion('settle', 'opus').duration > activityMotion('settle', 'luna').duration);
});
