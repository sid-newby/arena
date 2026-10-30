import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScopedCatalog } from '../src/lib/agents.ts';
import { assertSendScope, CatalogRefresh, prepareDelivery } from '../src/lib/run-scope.ts';

const scope = { runId: 'run-one', revision: 1 };
const targets = ['a', 'b'];
const tick = () => new Promise(setImmediate);

test('a partial Both retry keeps its original request, revision, and completed destination', () => {
  const first = prepareDelivery(undefined, scope, 'question', targets, 'request-one');
  first.delivered.add('a');
  const retry = prepareDelivery(first, { ...scope, revision: 2 }, 'question', targets, 'unused');
  assert.equal(retry.requestId, 'request-one');
  assert.equal(retry.revision, 1);
  assert.deepEqual(
    retry.targets.filter((target) => !retry.delivered.has(target)),
    ['b'],
  );
  assertSendScope('run-one', retry);
});

test('an old pending send cannot move into another run or skip its first destination there', () => {
  const first = prepareDelivery(undefined, scope, 'question', targets, 'request-one');
  first.delivered.add('a');
  assert.throws(() => assertSendScope('run-two', first), /run changed/);
  const next = prepareDelivery(
    first,
    { runId: 'run-two', revision: 1 },
    'question',
    targets,
    'request-two',
  );
  assert.equal(next.requestId, 'request-two');
  assert.deepEqual(
    next.targets.filter((target) => !next.delivered.has(target)),
    ['a', 'b'],
  );
});

test('catalog refresh coalesces tokens, rejects an obsolete response, and applies the latest swap', async () => {
  const pending = [];
  const applied = [];
  const errors = [];
  const refresh = new CatalogRefresh({
    ...scope,
    load: () => new Promise((resolve) => pending.push(resolve)),
    apply: (catalog) => applied.push(catalog),
    fail: (error) => errors.push(error),
  });
  refresh.observe(2);
  refresh.observe(2);
  refresh.observe(3);
  assert.equal(pending.length, 1);
  pending.shift()({ runId: 'run-one', revision: 2, agents: [{ id: 'a', provider: 'codex' }] });
  await tick();
  assert.deepEqual(applied, []);
  assert.equal(pending.length, 1);
  const swapped = { runId: 'run-one', revision: 3, agents: [{ id: 'a', provider: 'anthropic' }] };
  pending.shift()(swapped);
  await tick();
  assert.deepEqual(applied, [swapped]);
  assert.deepEqual(errors, []);
  refresh.observe(3);
  assert.equal(pending.length, 0);
});

test('failed catalog refresh does not retry on every token and closed scopes ignore old replies', async () => {
  let loads = 0;
  const errors = [];
  const refresh = new CatalogRefresh({
    ...scope,
    load: async () => {
      loads++;
      throw new Error('offline');
    },
    apply: () => assert.fail('failed lookup must not apply'),
    fail: (error) => errors.push(error),
  });
  refresh.observe(2);
  await tick();
  refresh.observe(2);
  refresh.observe(2);
  assert.equal(loads, 1);
  assert.equal(errors.length, 1);
  let resolve;
  const closed = new CatalogRefresh({
    ...scope,
    load: () =>
      new Promise((done) => {
        resolve = done;
      }),
    apply: () => assert.fail('closed run must not accept its old catalog'),
    fail: () => assert.fail('closed run must not report late errors'),
  });
  closed.observe(2);
  closed.close();
  resolve({ runId: 'run-one', revision: 2, agents: [] });
  await tick();
});

test('catalog metadata carries the requested run and a validated configuration revision', () => {
  const agents = ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    provider: 'codex',
    model: 'gpt-6-luna',
    effort: 'high',
    runtime: 'Codex',
    status: 'ready',
  }));
  assert.deepEqual(parseScopedCatalog({ runId: 'run-one', revision: 2, agents }, 'run-one'), {
    runId: 'run-one',
    revision: 2,
    agents,
  });
  assert.throws(
    () => parseScopedCatalog({ runId: 'run-two', revision: 2, agents }, 'run-one'),
    /another run/,
  );
  assert.throws(
    () => parseScopedCatalog({ runId: 'run-one', revision: 0, agents }, 'run-one'),
    /could not be read/,
  );
});
