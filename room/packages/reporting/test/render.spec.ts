import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { currentReportFixture, aggregateReportFixture } from '../src/fixtures.js';
import { reportDataSchema, type AttemptMetric, type ReportData } from '../src/contracts.js';
import { renderReport } from '../src/render.js';
import { reportAssets } from '../src/render-assets.js';

function comparisonFixture(): ReportData {
  const data = currentReportFixture();
  const a: AttemptMetric = {
    id: 'fixture-a',
    runId: 'fixture-run',
    role: 'a',
    modelKey: 'codex/model-alpha',
    configurationKey: 'alpha-high',
    model: 'model-alpha',
    provider: 'codex',
    effort: 'high',
    toolProfile: 'analysis',
    phase: 'independent',
    taskRevision: 1,
    status: 'completed',
    usage: {
      input: 100,
      output: 50,
      cachedInput: 20,
      cacheWriteInput: 0,
      reasoningOutput: 10,
      total: 150,
      source: 'codex.thread.total',
      coverage: 'all-model-calls',
      completeness: 'complete',
      actualModel: null,
    },
    elapsedMs: 1000,
    queueMs: 10,
    firstTextMs: 10,
    startedAt: 1793318400010,
    finishedAt: 1793318401010,
  };
  const b: AttemptMetric = {
    ...a,
    id: 'fixture-b',
    role: 'b',
    modelKey: 'codex/model-beta',
    configurationKey: 'beta-high',
    model: 'model-beta',
    elapsedMs: 2000,
    finishedAt: 1793318402010,
  };
  data.pairs = [
    {
      runId: 'fixture-run',
      confirmed: true,
      currentTask: true,
      a,
      b,
      selection: 'a',
      tokenDelta: 0,
      durationDelta: 1,
      exclusions: [],
    },
  ];
  data.models = [
    {
      key: 'alpha',
      modelKey: a.modelKey ?? '',
      configurationKey: 'alpha-high',
      provider: 'codex',
      model: 'model-alpha',
      effort: 'high',
      toolProfile: 'analysis',
      phase: 'independent',
      coverage: 'all-model-calls',
      role: 'candidate',
      attempts: 1,
      completeTokens: 150,
      observedPartialTokens: 0,
      unknownUsageCount: 0,
      tokens: { count: 1, unknown: 0, sum: 150, median: 150, min: 150, max: 150, p95: null },
      duration: { count: 1, unknown: 0, sum: 1000, median: 1000, min: 1000, max: 1000, p95: null },
      selected: 1,
      losing: 0,
      preferenceDenominator: 1,
      preferenceRate: 1,
      involvement: 0,
      opponents: [
        {
          modelKey: 'codex/model-beta',
          configurationKey: 'beta-high',
          phase: 'independent',
          selected: 1,
          losing: 0,
          denominator: 1,
          rate: 1,
          runIds: ['fixture-run'],
        },
      ],
      runIds: ['fixture-run'],
      taskHashes: ['fixture-task-hash'],
    },
  ];
  return reportDataSchema.parse(data);
}
function embedded(html: string): unknown {
  const source = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!source) throw new Error('Missing embedded report data');
  return JSON.parse(source);
}

describe('standalone report renderer', () => {
  it('renders identical frozen metric data for charts and static semantic tables', () => {
    const data = comparisonFixture();
    const { html } = renderReport(data, reportAssets);
    expect(embedded(html)).toMatchObject({
      summary: { selection: data.summary.selection },
      pairs: [
        {
          runId: data.pairs[0].runId,
          tokenDelta: data.pairs[0].tokenDelta,
          durationDelta: data.pairs[0].durationDelta,
          a: {
            usage: { input: data.pairs[0].a.usage.input, output: data.pairs[0].a.usage.output },
          },
        },
      ],
    });
    const staticDocument = html.slice(0, html.indexOf('<script id="report-data"'));
    expect(staticDocument).toContain('id="candidate-tokens"');
    expect(staticDocument).toContain(
      '<td>100</td><td>50</td><td>150</td><td>20</td><td>0</td><td>10</td>',
    );
    expect(staticDocument).toContain('<td>0%</td><td>+100%</td>');
    expect(staticDocument).toContain('Current-goal confirmation');
    expect(staticDocument).toContain('Summed execution time is not run wall time');
    expect(staticDocument).toContain('id="criteria-fixture-run"');
    expect(staticDocument).toContain('id="opponent-cohorts"');
    expect(staticDocument).toContain('beta-high');
    expect(html).not.toMatch(/fetch\(|WebSocket|localStorage|eval\(|new Function|innerHTML\s*=/);
    expect(Buffer.byteLength(html)).toBeLessThan(5 * 1024 * 1024);
    expect(renderReport(data, reportAssets).html).toBe(html);
  });

  it('preserves null versus zero and metric-specific exclusions', () => {
    const data = comparisonFixture();
    data.pairs[0].a.usage.input = null;
    data.pairs[0].tokenDelta = null;
    data.pairs[0].exclusions = ['usage-coverage-mismatch'];
    data.exclusions = [{ code: 'usage-coverage-mismatch', count: 1 }];
    const { html } = renderReport(data, reportAssets);
    expect(html).toContain('<td>Unknown</td><td>50</td><td>150</td>');
    expect(html).toContain('<td>Not comparable</td><td>+100%</td>');
    expect(html).toContain('usage-coverage-mismatch');
  });

  it('escapes user text and closing-script payloads without changing data', () => {
    const data = comparisonFixture();
    const payload =
      '</script><script>window.reportInjected=true</script><img src=x onerror=alert(1)>\u2028\u2029';
    if (!data.runs[0].task) throw new Error('Fixture goal required');
    data.runs[0].task.question = payload;
    data.pairs[0].a.model = payload;
    const { html } = renderReport(data, reportAssets);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(embedded(html)).not.toHaveProperty('runs');
  });

  it('rejects extra private fields instead of serializing arbitrary source objects', () => {
    const data = comparisonFixture();
    expect(() =>
      renderReport(
        {
          ...data,
          privateMaestroMessages: ['PRIVATE_SENTINEL'],
          continuationId: 'secret',
          workspace: '/Users/private',
        },
        reportAssets,
      ),
    ).toThrow();
  });

  it('labels aggregate selection, explicit membership and an anchor outside the cohort', () => {
    const data = aggregateReportFixture();
    data.anchorRunId = 'outside-anchor';
    data.selection = {
      kind: 'date-range',
      fromInclusive: '2026-10-29T00:00:00Z',
      toExclusive: '2026-10-30T00:00:00Z',
      timeZone: 'America/Chicago',
      excludeRunIds: ['excluded-run'],
    };
    const { html } = renderReport(data, reportAssets);
    expect(html).toContain('outside the selected cohort');
    expect(html).toContain('(inclusive)');
    expect(html).toContain('(exclusive)');
    expect(html).toContain('excluded-run');
    expect(html).toContain('fixture-unjudged');
    expect(html).toContain('Incomplete');
  });

  it('fails explicitly for oversized standalone documents without truncating source text', () => {
    const data = comparisonFixture();
    if (!data.runs[0].task) throw new Error('Fixture goal required');
    data.runs[0].task.question = 'x'.repeat(3 * 1024 * 1024);
    expect(() => renderReport(data, reportAssets)).toThrow('html-size-limit');
  });

  it('pins approved dependencies and blocks document connections', () => {
    const html = renderReport(currentReportFixture(), reportAssets).html;
    for (const dependency of reportAssets.dependencies) {
      expect(html).toContain(
        `src="${dependency.url}" integrity="${dependency.integrity}" crossorigin="anonymous"`,
      );
    }
    expect(reportAssets.dependencies).toHaveLength(4);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain('data:font/ttf;base64,');
    expect(html).not.toContain('url(/fonts/');
    expect(html).not.toContain('babel');
  });

  it('records actual Basecoat provenance and canonical theme values', () => {
    const provenance = JSON.parse(
      readFileSync(new URL('../assets/provenance.json', import.meta.url), 'utf8'),
    );
    expect(provenance.basecoat.version).toBe('1.1.0');
    expect(reportAssets.cssHash).toBe(createHash('sha256').update(reportAssets.css).digest('hex'));
    expect(reportAssets.themeAdapterHash).toBe(provenance.themeAdapterHash);
    const canonical = readFileSync(
      new URL('../../../apps/web/src/index.css', import.meta.url),
      'utf8',
    );
    const variables = canonical.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    for (const key of ['background', 'foreground', 'card', 'primary', 'chart-2', 'radius']) {
      const value = variables.match(new RegExp(`--${key}:\\s*([^;]+);`))?.[1];
      expect(value).toBeTruthy();
      expect(reportAssets.css).toContain(`--${key}:${value};`);
    }
  });
});
