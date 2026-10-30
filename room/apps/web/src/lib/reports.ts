import {
  reportGenerationSchema,
  reportListSchema,
  reportSelectionSchema,
  reportSourcesSchema,
  type ReportGeneration,
  type ReportRequest,
  type ReportSelection,
  type ReportSources,
} from '@lilbits/reporting';
import type { RunChoice } from './run-workflow';

export const reportPath = (runId: string) => `/api/runs/${encodeURIComponent(runId)}/reports`;

const pad = (n: number) => String(n).padStart(2, '0');
function midnight(value: string, nextDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose valid start and end dates.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    throw new Error('Choose valid start and end dates.');
  if (nextDay) date.setDate(date.getDate() + 1);
  const offset = -date.getTimezoneOffset();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function localDateRange(
  from: string,
  through: string,
  excludeRunIds: string[],
): Extract<ReportSelection, { kind: 'date-range' }> {
  const result = reportSelectionSchema.safeParse({
    kind: 'date-range',
    fromInclusive: midnight(from, false),
    toExclusive: midnight(through, true),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    excludeRunIds,
  });
  if (!result.success || result.data.kind !== 'date-range')
    throw new Error('Choose an end date on or after the start date.');
  return result.data;
}

export function filterReportRuns({
  runs,
  sources,
  modelQuery,
  from,
  through,
  selectedRunIds,
}: {
  runs: RunChoice[];
  sources: ReportSources;
  modelQuery: string;
  from: string;
  through: string;
  selectedRunIds: string[];
}) {
  let interval: { start: number; end: number } | undefined;
  let dateError = '';
  if (from || through) {
    if (!from || !through) dateError = 'Set both dates to filter the run chooser.';
    else {
      try {
        const range = localDateRange(from, through, []);
        interval = { start: Date.parse(range.fromInclusive), end: Date.parse(range.toExclusive) };
      } catch (cause) {
        dateError = cause instanceof Error ? cause.message : 'Check the chooser dates.';
      }
    }
  }
  const query = modelQuery.trim().toLowerCase();
  const models = new Map(sources.map((source) => [source.runId, source.models]));
  const visible = runs.filter(
    (run) =>
      (!interval || (run.createdAt >= interval.start && run.createdAt < interval.end)) &&
      (!query ||
        models
          .get(run.id)
          ?.some((identity) =>
            `${identity.provider}/${identity.model}`.toLowerCase().includes(query),
          )),
  );
  const visibleIds = new Set(visible.map((run) => run.id));
  return {
    runs: visible,
    selectedCount: selectedRunIds.length,
    hiddenSelectedCount: selectedRunIds.filter((id) => !visibleIds.has(id)).length,
    dateError,
  };
}

export async function reportSources(runId: string, signal?: AbortSignal): Promise<ReportSources> {
  const response = await fetch(`${reportPath(runId)}/sources`, { signal });
  if (!response.ok) throw new Error(`Historical models could not be loaded (${response.status}).`);
  const parsed = reportSourcesSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Historical models could not be read.');
  return parsed.data;
}

export async function reportRequest(
  runId: string,
  request: ReportRequest,
): Promise<ReportGeneration> {
  const response = await fetch(reportPath(runId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    let message = `Report request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.message === 'string') message = body.message;
    } catch {}
    throw new Error(message);
  }
  const generation = reportGenerationSchema.parse(await response.json());
  if (generation.anchorRunId !== runId || generation.requestId !== request.requestId)
    throw new Error('The report response did not match this request.');
  return generation;
}

export async function reportHistory(runId: string, before?: string, signal?: AbortSignal) {
  const response = await fetch(
    `${reportPath(runId)}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Report history could not be loaded (${response.status}).`);
  const parsed = reportListSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Report history could not be read.');
  if (parsed.data.generations.some((item) => item.anchorRunId !== runId))
    throw new Error('Report history belongs to another run.');
  return parsed.data;
}
