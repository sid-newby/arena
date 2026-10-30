import { describe, expect, it } from 'vitest';
import { reportRequestSchema, reportSnapshotSchema } from '../src/contracts.js';
import {
  currentSnapshotFixture,
  currentReportFixture,
  aggregateReportFixture,
} from '../src/fixtures.js';
describe('report boundary', () => {
  it('validates deterministic current and aggregate fixtures', () => {
    expect(currentReportFixture().summary.completeTokens).toBe(300);
    expect(aggregateReportFixture().summary.runs).toBe(2);
    expect(currentSnapshotFixture()).toEqual(currentSnapshotFixture());
  });
  it('rejects private fields in captured source facts', () => {
    const snapshot = currentSnapshotFixture();
    expect(() => reportSnapshotSchema.parse({ ...snapshot, continuationId: 'private' })).toThrow();
    expect(() =>
      reportSnapshotSchema.parse({
        ...snapshot,
        runs: [{ ...snapshot.runs[0], prompt: 'private' }],
      }),
    ).toThrow();
  });
  it('rejects ambiguous dates and unknown time zones', () => {
    expect(
      reportRequestSchema.safeParse({
        requestId: 'request-one',
        selection: {
          kind: 'date-range',
          fromInclusive: '2026-11-01',
          toExclusive: '2026-11-02',
          timeZone: 'America/Chicago',
          excludeRunIds: [],
        },
      }).success,
    ).toBe(false);
  });
});
