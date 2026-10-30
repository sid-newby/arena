import { performance } from 'node:perf_hooks';
import { currentSnapshotFixture } from '../dist/fixtures.js';
import { deriveReportData } from '../dist/metrics.js';
import { renderReport, reportAssets } from '../dist/render.js';
import { writeFileSync } from 'node:fs';
const template = currentSnapshotFixture();
for (const count of [10, 100, 1000]) {
  const snapshot = {
    ...template,
    generationId: `scale-${count}`,
    selection: { kind: 'manual', runIds: [] },
    runs: [],
    resolvedRunIds: [],
  };
  for (let i = 0; i < count; i++) {
    const id = `scale-run-${i}`;
    const source = template.runs[0];
    const attempts = Array.from({ length: 50 }, (_, index) => {
      const original = source.attempts[index % 2];
      return {
        ...original,
        id: `${id}-attempt-${index}`,
        turnId: `${id}-turn-${index}`,
        bindingId: `${id}-binding-${index % 2}`,
      };
    });
    const outcome = {
      ...source.outcomes[0],
      candidates: {
        a: {
          ...source.outcomes[0].candidates.a,
          turnId: attempts[0].turnId,
          bindingId: attempts[0].bindingId,
        },
        b: {
          ...source.outcomes[0].candidates.b,
          turnId: attempts[1].turnId,
          bindingId: attempts[1].bindingId,
        },
      },
    };
    snapshot.runs.push({ ...source, id, attempts, outcomes: [outcome] });
    snapshot.resolvedRunIds.push(id);
    snapshot.selection.runIds.push(id);
  }
  const metricStart = performance.now();
  const data = deriveReportData(snapshot, {
    version: '1.0.0',
    sourceFactsHash: 'synthetic-scale-facts',
  });
  const metricMs = performance.now() - metricStart;
  const renderStart = performance.now();
  const { html } = renderReport(data, reportAssets);
  const renderMs = performance.now() - renderStart;
  const bytes = Buffer.byteLength(html);
  if (bytes > 5 * 1024 * 1024) throw new Error('Scale output exceeds 5 MiB');
  const result = {
    runs: count,
    attempts: count * 50,
    timelineRows: data.timeline.attempts.length,
    omittedTimelineAttempts: data.timeline.omittedAttempts,
    bytes,
    metricMs: Math.round(metricMs),
    renderMs: Math.round(renderMs),
    rssBytes: process.memoryUsage().rss,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  if (count === 1000) writeFileSync('/private/tmp/lilbits-renderer-scale.html', html);
}
