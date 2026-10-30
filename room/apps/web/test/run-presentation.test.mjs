import test from 'node:test';
import assert from 'node:assert/strict';
import { runPresentation } from '../src/lib/run-presentation.ts';
import { defaultTask } from '../src/lib/run-workflow.ts';

test('a fresh run is setup with no outcome panels or claim that participants are running', () => {
  const presentation = runPresentation({ phase: 'draft', task: null });
  assert.equal(presentation.configured, false);
  assert.match(presentation.description, /Start a new debate/);
  assert.match(presentation.description, /what A and B should work out/);
  assert.equal(runPresentation().configured, false);
});

test('saved setup is reviewed before starting and configured work remains reviewable', () => {
  const task = { ...defaultTask(), question: 'Which approach meets our goal?' };
  for (const phase of ['draft', 'ready']) {
    const presentation = runPresentation({ phase, task });
    assert.equal(presentation.configured, true);
    assert.match(presentation.description, /before starting A and B/);
  }
  for (const phase of ['independent', 'paused', 'completed']) {
    const presentation = runPresentation({ phase, task });
    assert.equal(presentation.configured, true);
    assert.match(presentation.description, /recorded work/);
  }
});
