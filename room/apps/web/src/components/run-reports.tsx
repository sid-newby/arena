import { useCallback, useEffect, useRef, useState } from 'react';
import {
  reportRequestSchema,
  type ReportGeneration,
  type ReportRequest,
  type ReportSelection,
  type ReportSources,
} from '@lilbits/reporting';
import { Button } from '@/components/ui/button';
import {
  filterReportRuns,
  localDateRange,
  reportHistory,
  reportPath,
  reportRequest,
  reportSources,
} from '@/lib/reports';
import type { RunChoice } from '@/lib/run-workflow';
import './run-reports.css';

function readPending(runId: string): ReportRequest | null {
  try {
    const saved = sessionStorage.getItem(`lilbits-report-request:${runId}`);
    return saved ? reportRequestSchema.parse(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function toggle(id: string, values: string[], update: (value: string[]) => void) {
  update(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
}

export function RunReports({
  runId,
  active,
  runs,
  runsError,
}: {
  runId: string;
  active: boolean;
  runs: RunChoice[];
  runsError?: string;
}) {
  const [mode, setMode] = useState<ReportSelection['kind']>('current');
  const [selected, setSelected] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [chooserFrom, setChooserFrom] = useState('');
  const [chooserThrough, setChooserThrough] = useState('');
  const [sourceIndex, setSourceIndex] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ready'; sources: ReportSources }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const sourceController = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<ReportGeneration[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingState, setPendingState] = useState<ReportRequest | null>(() => readPending(runId));
  const [error, setError] = useState(() =>
    pendingState ? 'A previous report request was not confirmed. Retry it or discard it.' : '',
  );
  const [historyError, setHistoryError] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [preview, setPreview] = useState<string>();
  const pending = useRef<ReportRequest | null>(pendingState);
  const storageKey = `lilbits-report-request:${runId}`;
  const alive = useRef(false);
  const inFlight = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const paged = useRef(false);
  const refreshSerial = useRef(0);

  const load = useCallback(
    async (before?: string, signal?: AbortSignal) => {
      const serial = before ? 0 : ++refreshSerial.current;
      try {
        const result = await reportHistory(runId, before, signal);
        if (signal?.aborted || !alive.current || (!before && serial !== refreshSerial.current))
          return;
        setHistory((previous) =>
          before
            ? [
                ...previous,
                ...result.generations.filter((item) => !previous.some((old) => old.id === item.id)),
              ]
            : [
                ...result.generations,
                ...previous.filter(
                  (item) => !result.generations.some((next) => next.id === item.id),
                ),
              ],
        );
        if (before) paged.current = true;
        if (before || !paged.current) {
          cursorRef.current = result.nextBefore;
          setCursor(result.nextBefore);
        }
        setHistoryLoaded(true);
        setHistoryError('');
      } catch (cause) {
        if (!signal?.aborted && alive.current && (before || serial === refreshSerial.current))
          setHistoryError(
            cause instanceof Error ? cause.message : 'Report history could not be loaded.',
          );
      }
    },
    [runId],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    queueMicrotask(() => void load(undefined, controller.signal));
    const timer = window.setInterval(() => void load(undefined, controller.signal), 4000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [active, load]);
  const loadSources = useCallback(
    async (signal: AbortSignal) => {
      if (signal.aborted) return;
      setSourceIndex({ status: 'loading' });
      try {
        const sources = await reportSources(runId, signal);
        if (!signal.aborted) setSourceIndex({ status: 'ready', sources });
      } catch (cause) {
        if (!signal.aborted)
          setSourceIndex({
            status: 'error',
            message:
              cause instanceof Error ? cause.message : 'Historical models could not be loaded.',
          });
      }
    },
    [runId],
  );
  useEffect(() => {
    if (!active || mode !== 'manual') return;
    const controller = new AbortController();
    sourceController.current = controller;
    queueMicrotask(() => void loadSources(controller.signal));
    return () => controller.abort();
  }, [active, mode, loadSources]);

  async function generate(selection?: ReportSelection) {
    if (inFlight.current) return;
    let request = pending.current;
    if (!request) {
      try {
        const chosen =
          selection ??
          (mode === 'current'
            ? { kind: 'current' }
            : mode === 'manual'
              ? { kind: 'manual', runIds: selected }
              : localDateRange(from, through, excluded));
        if (chosen.kind === 'manual' && !chosen.runIds.length)
          throw new Error('Select at least one run.');
        request = { requestId: crypto.randomUUID(), selection: chosen };
        pending.current = request;
        setPendingState(request);
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Check the report selection.');
        return;
      }
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await reportRequest(runId, request);
      if (!alive.current) return;
      pending.current = null;
      setPendingState(null);
      sessionStorage.removeItem(storageKey);
      setHistory((previous) => [result, ...previous.filter((item) => item.id !== result.id)]);
      void load();
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : 'The report request could not be confirmed.',
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const currentPreview = history.find((item) => item.id === preview && item.status === 'ready');
  const chooser = filterReportRuns({
    runs,
    sources: sourceIndex.status === 'ready' ? sourceIndex.sources : [],
    modelQuery: sourceIndex.status === 'ready' ? modelQuery : '',
    from: chooserFrom,
    through: chooserThrough,
    selectedRunIds: selected,
  });
  return (
    <section className="run-artifacts run-reports" aria-label="Reports">
      <div className="run-section-heading">
        <h4>Reports</h4>
        <span>Saved comparisons</span>
      </div>
      <p className="run-muted">
        Compare recorded outcomes, tokens and time. Each generation preserves its captured runs and
        source facts.
      </p>
      <label className="report-field">
        Report scope
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as ReportSelection['kind'])}
          disabled={busy || Boolean(pendingState)}
        >
          <option value="current">Current run</option>
          <option value="manual">Selected runs</option>
          <option value="date-range">Date range</option>
        </select>
      </label>
      {mode === 'date-range' && (
        <div className="run-field-grid">
          <label className="report-field">
            From{' '}
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="report-field">
            Through{' '}
            <input
              type="date"
              value={through}
              onChange={(event) => setThrough(event.target.value)}
            />
          </label>
          <p className="run-muted">
            Inclusive calendar dates in {new Intl.DateTimeFormat().resolvedOptions().timeZone}. All
            runs created in this interval are included except those checked below.
          </p>
        </div>
      )}
      {mode === 'manual' && (
        <div className="report-chooser">
          <p className="run-muted">
            Filters narrow this chooser only. Selected runs stay selected, including hidden runs.
            Date range scope includes all runs in its interval regardless of these filters.
          </p>
          <label className="report-field">
            Recorded provider or model
            <input
              type="search"
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              disabled={sourceIndex.status !== 'ready'}
              placeholder="Search historical models"
            />
          </label>
          {sourceIndex.status === 'loading' && (
            <output className="run-muted">Loading historical models…</output>
          )}
          {sourceIndex.status === 'error' && (
            <p className="run-error" role="alert">
              {sourceIndex.message} Model filtering is unavailable. You can still select runs below.{' '}
              <button
                type="button"
                className="run-text-button"
                onClick={() => {
                  const signal = sourceController.current?.signal;
                  if (signal) void loadSources(signal);
                }}
              >
                Retry models
              </button>
            </p>
          )}
          <div className="run-field-grid">
            <label className="report-field">
              Created from
              <input
                type="date"
                value={chooserFrom}
                onChange={(event) => setChooserFrom(event.target.value)}
              />
            </label>
            <label className="report-field">
              Created through
              <input
                type="date"
                value={chooserThrough}
                onChange={(event) => setChooserThrough(event.target.value)}
              />
            </label>
          </div>
          <p className="run-muted">
            Inclusive calendar dates in {new Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
          {chooser.dateError && <output className="run-error">{chooser.dateError}</output>}
          <output className="run-muted">
            {chooser.selectedCount} selected · {chooser.hiddenSelectedCount} selected hidden by
            filters · {chooser.runs.length} runs shown
          </output>
          <div className="run-buttons">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setModelQuery('');
                setChooserFrom('');
                setChooserThrough('');
              }}
            >
              Clear chooser filters
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}
      {mode !== 'current' && (
        <fieldset className="report-runs">
          <legend>{mode === 'manual' ? 'Select runs' : 'Exclude runs'}</legend>
          {runsError && (
            <p className="run-error" role="alert">
              {runsError}
            </p>
          )}
          {!runs.length && !runsError && <p className="run-muted">No runs available.</p>}
          {mode === 'manual' && runs.length > 0 && !chooser.runs.length && (
            <p className="run-muted">No runs match these chooser filters.</p>
          )}
          {(mode === 'manual' ? chooser.runs : runs).map((run) => (
            <label key={run.id}>
              <input
                type="checkbox"
                checked={(mode === 'manual' ? selected : excluded).includes(run.id)}
                onChange={() =>
                  mode === 'manual'
                    ? toggle(run.id, selected, setSelected)
                    : toggle(run.id, excluded, setExcluded)
                }
              />{' '}
              <span>
                <code>{run.id}</code> · {new Date(run.createdAt).toLocaleString()} · {run.state}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="run-buttons">
        <Button type="button" size="sm" disabled={busy} onClick={() => void generate()}>
          {busy ? 'Requesting…' : pendingState ? 'Retry same request' : 'Generate report'}
        </Button>
        {pendingState && !busy && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              pending.current = null;
              setPendingState(null);
              sessionStorage.removeItem(storageKey);
              setError('');
            }}
          >
            Discard request
          </Button>
        )}
      </div>
      {error && (
        <p className="run-error" role="alert">
          {error}{' '}
          {pendingState &&
            'Retry sends the same request ID and selection. Discard it to start a new generation.'}
        </p>
      )}
      <div className="run-section-heading report-history-heading">
        <h4>Saved reports</h4>
      </div>
      {historyError && (
        <p className="run-error" role="alert">
          {historyError}{' '}
          <button type="button" className="run-text-button" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {!history.length && !historyError && (
        <p className="run-muted">
          {historyLoaded ? 'No saved reports yet.' : 'Loading report history…'}
        </p>
      )}
      <ul className="report-history">
        {history.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{new Date(item.createdAt).toLocaleString()}</strong> · {item.status} ·{' '}
              {item.selection.kind} · {item.resolvedRunIds.length} runs
            </div>
            {item.status === 'failed' && (
              <p className="run-error">Generation failed: {item.errorCode}</p>
            )}
            {(item.status === 'queued' || item.status === 'building') && (
              <output className="run-muted">
                {item.status === 'queued' ? 'Waiting to build.' : 'Building report.'}
              </output>
            )}
            {item.status === 'ready' && (
              <div className="run-buttons">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreview(preview === item.id ? undefined : item.id)}
                >
                  {preview === item.id ? 'Close preview' : 'Preview'}
                </Button>
                <a href={item.downloadUrl} download>
                  Download HTML
                </a>
                {['snapshot.json', 'report-data.json', 'manifest.json'].map((name) => (
                  <a
                    key={name}
                    href={`${reportPath(runId)}/${encodeURIComponent(item.id)}/files/${name}`}
                    download
                  >
                    {name}
                  </a>
                ))}
              </div>
            )}
            <div className="run-buttons">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || Boolean(pendingState) || !item.resolvedRunIds.length}
                onClick={() => void generate({ kind: 'manual', runIds: item.resolvedRunIds })}
              >
                Generate with exact run IDs
              </Button>
              {item.selection.kind === 'date-range' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || Boolean(pendingState)}
                  onClick={() => void generate(item.selection)}
                >
                  Refresh saved date filter
                </Button>
              )}
            </div>
            <details>
              <summary>Captured selection</summary>
              <p className="run-muted">
                {item.resolvedRunIds.length
                  ? item.resolvedRunIds.join(', ')
                  : 'Run membership has not been resolved.'}
              </p>
              {item.selection.kind === 'date-range' && (
                <p className="run-muted">
                  {item.selection.fromInclusive} to {item.selection.toExclusive} (exclusive),{' '}
                  {item.selection.timeZone}. Excluded:{' '}
                  {item.selection.excludeRunIds.join(', ') || 'none'}.
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load(cursor).finally(() => setLoading(false));
          }}
        >
          {loading ? 'Loading…' : 'Load older reports'}
        </Button>
      )}
      {currentPreview?.status === 'ready' && (
        <section className="run-artifact-preview" aria-label="Report preview">
          <div className="run-section-heading">
            <h5>Isolated report preview</h5>
            <a href={currentPreview.downloadUrl} download>
              Download HTML
            </a>
          </div>
          <iframe
            title="Isolated report preview"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            src={currentPreview.previewUrl}
          />
        </section>
      )}
    </section>
  );
}
