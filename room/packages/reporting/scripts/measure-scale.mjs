import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  currentSnapshotFixture,
  fixtureAttempt,
  currentReportFixture,
  aggregateReportFixture,
} from '../dist/fixtures.js';
import { deriveReportData } from '../dist/metrics.js';
const output = process.argv[2] ?? '/private/tmp/lilbits-report-scale';
await mkdir(output, { recursive: true });
await writeFile(join(output, 'current-report-data.json'), JSON.stringify(currentReportFixture()));
await writeFile(
  join(output, 'aggregate-report-data.json'),
  JSON.stringify(aggregateReportFixture()),
);
const results = [];
for (const runCount of [10, 100, 1000]) {
  const base = currentSnapshotFixture();
  base.selection = { kind: 'manual', runIds: [] };
  base.runs = [];
  base.resolvedRunIds = [];
  for (let r = 0; r < runCount; r++) {
    const id = `scale-run-${r}`;
    const source = currentSnapshotFixture().runs[0];
    const attempts = Array.from({ length: 50 }, (_, i) => ({
      ...fixtureAttempt(i % 2 ? 'b' : 'a', id),
      id: `${id}-attempt-${i}`,
      turnId: `${id}-attempt-${i}`,
    }));
    base.runs.push({ ...source, id, attempts, outcomes: [] });
    base.resolvedRunIds.push(id);
  }
  base.selection.runIds = base.resolvedRunIds;
  const started = performance.now();
  const data = deriveReportData(base);
  const elapsedMs = performance.now() - started;
  const snapshot = JSON.stringify(base),
    json = JSON.stringify(data);
  await writeFile(join(output, `${runCount}-snapshot.json`), snapshot);
  await writeFile(join(output, `${runCount}-report-data.json`), json);
  results.push({
    runs: runCount,
    attempts: runCount * 50,
    metricMs: elapsedMs,
    snapshotBytes: Buffer.byteLength(snapshot),
    reportDataBytes: Buffer.byteLength(json),
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    timelineRows: data.timeline.attempts.length,
    omittedTimelineRows: data.timeline.omittedAttempts,
  });
}
await writeFile(join(output, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
process.stdout.write(JSON.stringify({ output, results }, null, 2) + '\n');
