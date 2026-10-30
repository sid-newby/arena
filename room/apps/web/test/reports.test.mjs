import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterReportRuns,
  localDateRange,
  reportHistory,
  reportRequest,
  reportSources,
} from '../src/lib/reports.ts';

test('date scope uses local calendar midnights across daylight saving', () => {
  const old = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  try {
    assert.deepEqual(localDateRange('2026-03-08', '2026-03-08', ['run-2']), {
      kind: 'date-range',
      fromInclusive: '2026-03-08T00:00:00-06:00',
      toExclusive: '2026-03-09T00:00:00-05:00',
      timeZone: 'America/Chicago',
      excludeRunIds: ['run-2'],
    });
    assert.throws(() => localDateRange('2026-03-09', '2026-03-08', []));
  } finally {
    process.env.TZ = old;
  }
});

test('request retries preserve request identity and selection', async () => {
  const previous = globalThis.fetch;
  const bodies = [];
  const request = { requestId: 'request-123', selection: { kind: 'manual', runIds: ['run-1'] } };
  globalThis.fetch = async (_url, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw new Error('Network lost');
    return new Response(
      JSON.stringify({
        id: 'gen-1',
        anchorRunId: 'anchor',
        requestId: request.requestId,
        createdAt: 1,
        selection: request.selection,
        resolvedRunIds: ['run-1'],
        status: 'queued',
      }),
    );
  };
  try {
    await assert.rejects(reportRequest('anchor', request), /Network lost/);
    assert.equal((await reportRequest('anchor', request)).status, 'queued');
    assert.equal(bodies[0], bodies[1]);
  } finally {
    globalThis.fetch = previous;
  }
});

test('history preserves the opaque cursor', async () => {
  const previous = globalThis.fetch;
  let url;
  globalThis.fetch = async (value) => {
    url = value;
    return new Response(JSON.stringify({ generations: [], nextBefore: 'opaque_cursor' }));
  };
  try {
    assert.equal((await reportHistory('anchor', 'abc_123')).nextBefore, 'opaque_cursor');
    assert.match(url, /before=abc_123/);
  } finally {
    globalThis.fetch = previous;
  }
});

const chooserRuns = [
  {
    id: 'early',
    revision: 1,
    state: 'retained',
    createdAt: Date.parse('2026-11-01T00:00:00-05:00'),
  },
  { id: 'late', revision: 1, state: 'draft', createdAt: Date.parse('2026-11-01T23:30:00-06:00') },
  { id: 'next', revision: 1, state: 'draft', createdAt: Date.parse('2026-11-02T00:00:00-06:00') },
];
const chooserSources = [
  {
    runId: 'early',
    models: [
      { provider: 'Codex', model: 'old-exact-model' },
      { provider: 'Anthropic', model: 'opponent' },
    ],
  },
  { runId: 'late', models: [] },
];
const choose = (overrides = {}) =>
  filterReportRuns({
    runs: chooserRuns,
    sources: chooserSources,
    modelQuery: '',
    from: '',
    through: '',
    selectedRunIds: [],
    ...overrides,
  });

test('manual model search matches historical provider or model and preserves hidden selections', () => {
  const selectedRunIds = ['early', 'late'];
  const result = choose({ modelQuery: '  OLD-EXACT  ', selectedRunIds });
  assert.deepEqual(
    result.runs.map((run) => run.id),
    ['early'],
  );
  assert.equal(result.selectedCount, 2);
  assert.equal(result.hiddenSelectedCount, 1);
  assert.deepEqual(selectedRunIds, ['early', 'late']);
  assert.deepEqual(
    choose({ modelQuery: 'anthROPIC' }).runs.map((run) => run.id),
    ['early'],
  );
  assert.deepEqual(choose({ modelQuery: 'unknown' }).runs, []);
  assert.equal(choose().runs.length, 3);
  assert.equal(choose({ modelQuery: '   ' }).runs.length, 3);
});

test('manual chooser dates use local inclusive days through DST and require both bounds', () => {
  const old = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  try {
    const result = choose({ from: '2026-11-01', through: '2026-11-01', selectedRunIds: ['next'] });
    assert.deepEqual(
      result.runs.map((run) => run.id),
      ['early', 'late'],
    );
    assert.equal(result.hiddenSelectedCount, 1);
    assert.equal(result.dateError, '');
    for (const partial of [{ from: '2026-11-01' }, { through: '2026-11-01' }]) {
      assert.equal(choose(partial).runs.length, 3);
      assert.match(choose(partial).dateError, /Set both/);
    }
    const invalid = choose({ from: '2026-11-02', through: '2026-11-01' });
    assert.equal(invalid.runs.length, 3);
    assert.match(invalid.dateError, /end date/);
  } finally {
    process.env.TZ = old;
  }
});

test('manual source fetch parses the allowlisted schema and surfaces unavailable history', async () => {
  const previous = globalThis.fetch;
  let url;
  globalThis.fetch = async (value) => {
    url = value;
    return new Response(JSON.stringify(chooserSources));
  };
  try {
    assert.deepEqual(await reportSources('anchor'), chooserSources);
    assert.equal(url, '/api/runs/anchor/reports/sources');
    globalThis.fetch = async () =>
      new Response(JSON.stringify([{ runId: 'early', models: [], privateText: 'unexpected' }]));
    await assert.rejects(reportSources('anchor'), /could not be read/);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(reportSources('anchor'), /could not be loaded/);
  } finally {
    globalThis.fetch = previous;
  }
});
