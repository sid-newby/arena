import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRetainedInventory, parseRetainedWorkspace } from '../src/lib/retained-workspaces.ts';

const workspace = {
  runId: 'run-1',
  seat: 'a',
  path: '/tmp/one',
  retainedAt: 100,
  keepForNowAt: null,
};
test('reads retained workspaces and explicit keep decisions', () => {
  assert.deepEqual(
    parseRetainedInventory({ workspaces: [workspace], unavailableRuns: ['run-2'] }),
    {
      workspaces: [workspace],
      unavailableRuns: ['run-2'],
    },
  );
  assert.equal(parseRetainedWorkspace({ ...workspace, keepForNowAt: 123 }).keepForNowAt, 123);
});
test('rejects malformed retained records before they can supply paths or actions', () => {
  for (const input of [
    { ...workspace, runId: '../bad' },
    { ...workspace, seat: 'c' },
    { ...workspace, retainedAt: -1 },
    { ...workspace, keepForNowAt: 'yes' },
  ]) {
    assert.throws(() => parseRetainedWorkspace(input), /invalid/);
  }
  assert.throws(
    () => parseRetainedInventory({ workspaces: [], unavailableRuns: ['../bad'] }),
    /invalid/,
  );
});

test('binds preserved results to reviewed contents and rejects unsafe destinations', async () => {
  const { parsePreservedResult } = await import('../src/lib/retained-workspaces.ts');
  const result = {
    runId: 'run-1',
    seat: 'a',
    path: '/tmp/results/a',
    digest: 'a'.repeat(64),
    excluded: ['.env'],
    preservedAt: 100,
  };
  assert.equal(parsePreservedResult(null), null);
  assert.equal(parsePreservedResult(result).digest, result.digest);
  assert.equal(
    parsePreservedResult({ ...result, remote: 'https://github.com/user/prototype', cleanedAt: 200 })
      .cleanedAt,
    200,
  );
  for (const input of [
    { ...result, digest: 'bad' },
    { ...result, excluded: [1] },
    { ...result, remote: 'javascript:alert(1)' },
    { ...result, cleanedAt: -1 },
  ]) {
    assert.throws(() => parsePreservedResult(input), /invalid/);
  }
});
