import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, FileText, FolderOpen, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, parseRunReference } from '@/lib/agents';
import {
  defaultTask,
  cleanTask,
  canEditWorkflow,
  parseProviderCatalog,
  parseProvider,
  parseRunChoices,
  type RunChoice,
  parseWorkflow,
  workflowLabel,
  workflowRequest,
  type ProviderCatalog,
  type ProviderConfig,
  type SeatId,
  type TaskDraft,
  type WorkflowSnapshot,
} from '@/lib/run-workflow';
import { runPresentation } from '@/lib/run-presentation';
import { RunArtifacts } from '@/components/run-artifacts';
import { ScaffoldPicker } from '@/components/scaffold-picker';
import { RunReports } from '@/components/run-reports';
import { OutcomeReview } from '@/components/outcome-review';
import { RetainedWorkspaces } from '@/components/retained-workspaces';
import { RepositoryBrowser, RunSeatModel } from '@/components/run-setup';
import '@/components/run-setup.css';

type Editor = {
  runId: string;
  baseRevision: number;
  task: TaskDraft;
  seats: Record<SeatId, ProviderConfig>;
  dirty: boolean;
};
type Lease = { runId: string; controller: AbortController; pending: boolean; serial: number };
type Recovery = { revision: number; runId: string; failed: SeatId[]; selected: SeatId[] };
type PreflightCheck = {
  ok: boolean;
  detail: string;
  path?: string;
  repository?: string;
  revision?: string;
};
type Preflight = {
  seats: Record<SeatId, PreflightCheck>;
  source: PreflightCheck;
  destination: PreflightCheck;
};
function checkPreflightResult(item: unknown): PreflightCheck {
  if (
    !item ||
    typeof item !== 'object' ||
    !('ok' in item) ||
    typeof item.ok !== 'boolean' ||
    !('detail' in item) ||
    typeof item.detail !== 'string'
  )
    throw new Error('Unreadable preflight result.');
  return {
    ok: item.ok,
    detail: item.detail,
    path: 'path' in item && typeof item.path === 'string' ? item.path : undefined,
    repository:
      'repository' in item && typeof item.repository === 'string' ? item.repository : undefined,
    revision: 'revision' in item && typeof item.revision === 'string' ? item.revision : undefined,
  };
}
function parsePreflight(value: unknown): Preflight {
  if (
    !value ||
    typeof value !== 'object' ||
    !('seats' in value) ||
    !value.seats ||
    typeof value.seats !== 'object' ||
    !('a' in value.seats) ||
    !('b' in value.seats) ||
    !('source' in value) ||
    !('destination' in value)
  )
    throw new Error('Unreadable preflight result.');
  return {
    seats: { a: checkPreflightResult(value.seats.a), b: checkPreflightResult(value.seats.b) },
    source: checkPreflightResult(value.source),
    destination: checkPreflightResult(value.destination),
  };
}
const activePhases = ['preparing', 'independent', 'comparison', 'discussion'];
const steps = ['Question', 'Success', 'Project', 'Models', 'Review'] as const;

function renderPreflightDetails(result: Preflight) {
  return (
    <div aria-live="polite">
      {(
        [
          ['A', result.seats.a],
          ['B', result.seats.b],
          ['Source', result.source],
          ['Destination', result.destination],
        ] as const
      ).map(([label, item]) => (
        <p key={label} className={item.ok ? 'run-muted' : 'run-error'}>
          {label}: {item.detail} {item.path && <code>{item.path} </code>}
          {item.repository && <code>{item.repository} </code>}
          {item.revision && <code>{item.revision}</code>}
        </p>
      ))}
    </div>
  );
}

function storageKey(runId: string) {
  return `lilbits-run-draft:${runId}`;
}

function savedSeat(value: unknown, fallback: ProviderConfig) {
  try {
    return parseProvider(value);
  } catch {
    return fallback;
  }
}

function readDraft(snapshot: WorkflowSnapshot): Editor | undefined {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(snapshot.runId)) ?? 'null');
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('task' in raw) ||
      !('seats' in raw) ||
      !('baseRevision' in raw)
    )
      return;
    if (
      !raw.task ||
      typeof raw.task !== 'object' ||
      !('question' in raw.task) ||
      typeof raw.task.question !== 'string'
    )
      return;
    if (!raw.seats || typeof raw.seats !== 'object' || !('a' in raw.seats) || !('b' in raw.seats))
      return;
    if (
      typeof raw.baseRevision !== 'number' ||
      !Number.isSafeInteger(raw.baseRevision) ||
      raw.baseRevision < 0
    )
      return;
    const task = raw.task;
    const question = raw.task.question;
    if (
      !('mode' in task) ||
      (task.mode !== 'reasoning' && task.mode !== 'prototype') ||
      !('expectedArtifact' in task) ||
      typeof task.expectedArtifact !== 'string' ||
      !('criteria' in task) ||
      !Array.isArray(task.criteria) ||
      !task.criteria.every((item) => typeof item === 'string') ||
      !('grounding' in task) ||
      !Array.isArray(task.grounding) ||
      !task.grounding.every((item) => typeof item === 'string') ||
      !('source' in task) ||
      !(
        task.source === null ||
        (typeof task.source === 'object' &&
          task.source !== null &&
          'repository' in task.source &&
          typeof task.source.repository === 'string' &&
          'revision' in task.source &&
          typeof task.source.revision === 'string')
      ) ||
      !('profile' in task) ||
      (task.profile !== 'analysis' && task.profile !== 'build') ||
      !('maxHandoffs' in task) ||
      typeof task.maxHandoffs !== 'number' ||
      !Number.isFinite(task.maxHandoffs) ||
      !('timeLimitSeconds' in task) ||
      typeof task.timeLimitSeconds !== 'number' ||
      !Number.isFinite(task.timeLimitSeconds)
    )
      return;
    return {
      runId: snapshot.runId,
      baseRevision: raw.baseRevision,
      task: {
        question,
        mode: task.mode,
        expectedArtifact: task.expectedArtifact,
        criteria: task.criteria,
        grounding: task.grounding,
        ...('scaffold' in task &&
        typeof task.scaffold === 'object' &&
        task.scaffold !== null &&
        'id' in task.scaffold &&
        typeof task.scaffold.id === 'string' &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.scaffold.id)
          ? {
              scaffold: {
                id: task.scaffold.id,
                ...('digest' in task.scaffold && typeof task.scaffold.digest === 'string'
                  ? { digest: task.scaffold.digest }
                  : {}),
              },
            }
          : {}),
        source:
          task.source === null
            ? null
            : {
                repository:
                  typeof task.source.repository === 'string' ? task.source.repository : '',
                revision: typeof task.source.revision === 'string' ? task.source.revision : '',
              },
        ...('projectDirectory' in task && typeof task.projectDirectory === 'string'
          ? { projectDirectory: task.projectDirectory }
          : {}),
        profile: task.profile,
        maxHandoffs: task.maxHandoffs,
        timeLimitSeconds: task.timeLimitSeconds,
      },
      seats: {
        a: savedSeat(raw.seats.a, snapshot.seats.a),
        b: savedSeat(raw.seats.b, snapshot.seats.b),
      },
      dirty: true,
    };
  } catch {
    return;
  }
}

function clearDraft(runId: string) {
  try {
    localStorage.removeItem(storageKey(runId));
  } catch {
    /* Storage can be unavailable. */
  }
}

function cloneEditor(snapshot: WorkflowSnapshot): Editor {
  return {
    runId: snapshot.runId,
    baseRevision: snapshot.revision,
    task: snapshot.task ? structuredClone(snapshot.task) : defaultTask(),
    seats: structuredClone(snapshot.seats),
    dirty: false,
  };
}
export function useRunSetup({
  runId,
  active,
  synthesisTurnId,
  canSaveAnalysis,
  onDraftQuestion,
}: {
  runId?: string;
  active: boolean;
  synthesisTurnId?: string;
  canSaveAnalysis: boolean;
  onDraftQuestion: (text: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>();
  const [editor, setEditor] = useState<Editor>();
  const [failure, setFailure] = useState<{ runId?: string; text: string }>();
  const [feedback, setFeedback] = useState<{ runId?: string; text: string }>();
  const [pendingOperation, setOperation] = useState<{ scope: Lease; label: string }>();
  const [stoppingScope, setStoppingScope] = useState<Lease>();
  const [draftOpen, setDraftOpen] = useState(true);
  const [reuseSelection, setReuseSelection] = useState<{
    runId: string | undefined;
    value: '' | 'recorded' | 'head';
  }>({ runId, value: '' });
  const reuseRevision = reuseSelection.runId === runId ? reuseSelection.value : '';
  const [copyNotice, setCopyNotice] = useState<{ runId: string; text: string }>();
  const [browsingRepository, setBrowsingRepository] = useState(false);
  const [browsingProject, setBrowsingProject] = useState(false);
  const [criteriaSuggestion, setCriteriaSuggestion] = useState<{
    runId: string;
    task: string;
    revision: number;
    criteria: string[];
  }>();
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [preflight, setPreflight] = useState<{ key: string; result: Preflight }>();
  const [checkingPreflight, setCheckingPreflight] = useState(false);
  const currentEditor = useRef<Editor>(undefined);
  currentEditor.current = editor;
  const [step, setStep] = useState(0);
  if (reuseSelection.runId !== runId) {
    setReuseSelection({ runId, value: '' });
    setDraftOpen(true);
    setStep(0);
  }
  const [catalogs, setCatalogs] = useState<Partial<Record<'codex' | 'anthropic', ProviderCatalog>>>(
    {},
  );
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [runs, setRuns] = useState<RunChoice[]>([]);
  const [runsError, setRunsError] = useState<string>();
  const [recovery, setRecovery] = useState<Recovery>();
  const lease = useRef<Lease | undefined>(undefined);
  const identities = useRef(new Map<string, string>());
  const fieldPrefix = useId();
  const question = useRef<HTMLTextAreaElement>(null);
  const workbench = useRef<HTMLDivElement>(null);
  const error = failure?.runId === runId ? failure?.text : undefined;
  const notice = feedback?.runId === runId ? feedback?.text : undefined;
  const setError = useCallback(
    (text?: string) => setFailure(text ? { runId: lease.current?.runId, text } : undefined),
    [],
  );
  const setNotice = useCallback(
    (text?: string) => setFeedback(text ? { runId: lease.current?.runId, text } : undefined),
    [],
  );
  const visible = snapshot?.runId === runId ? snapshot : undefined;
  const draft = editor?.runId === runId ? editor : undefined;
  const operation = pendingOperation?.scope === lease.current ? pendingOperation?.label : undefined;
  const stopping = stoppingScope === lease.current && Boolean(stoppingScope);
  const busy = Boolean(operation || visible?.busy || visible?.phase === 'preparing');
  const editable = Boolean(visible && canEditWorkflow(visible) && !operation);
  const recoveryReady = Boolean(
    recovery && recovery.runId === runId && recovery.revision === visible?.revision,
  );
  const changedElsewhere = Boolean(
    draft?.dirty && visible && draft.baseRevision !== visible.revision,
  );
  const preflightKey = draft && runId ? JSON.stringify([runId, draft.task, draft.seats]) : '';
  const currentPreflight = preflight?.key === preflightKey ? preflight.result : undefined;
  const preflightPassed = Boolean(
    currentPreflight &&
    currentPreflight.seats.a.ok &&
    currentPreflight.seats.b.ok &&
    currentPreflight.source.ok &&
    currentPreflight.destination.ok,
  );

  async function checkPreflight() {
    const scope = lease.current;
    if (!draft || !scope || scope.runId !== runId || checkingPreflight) return;
    const key = preflightKey;
    setCheckingPreflight(true);
    setPreflight(undefined);
    setError(undefined);
    try {
      const task = cleanTask(draft.task);
      const result = await workflowRequest(
        scope.runId,
        '/preflight',
        parsePreflight,
        { task, seats: draft.seats },
        scope.controller.signal,
      );
      if (lease.current === scope && !scope.controller.signal.aborted)
        setPreflight({ key, result });
    } catch (cause) {
      if (lease.current === scope && !scope.controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Preflight failed. Try again.');
    } finally {
      setCheckingPreflight(false);
    }
  }

  const refresh = useCallback(
    async (scope: Lease) => {
      if (scope.pending || scope.controller.signal.aborted) return;
      const serial = ++scope.serial;
      try {
        const next = await workflowRequest(
          scope.runId,
          '/workflow',
          (value) => parseWorkflow(value, scope.runId),
          undefined,
          scope.controller.signal,
        );
        if (lease.current !== scope || scope.controller.signal.aborted || serial !== scope.serial)
          return;
        setSnapshot(next);
        setEditor((previous) =>
          previous?.runId === scope.runId && previous.dirty
            ? previous
            : (readDraft(next) ?? cloneEditor(next)),
        );
        if (['paused', 'interrupted', 'failed'].includes(next.phase) && !next.busy) {
          const failed = next.retrySeats;
          setRecovery((previous) => ({
            runId: scope.runId,
            revision: next.revision,
            failed,
            selected:
              previous?.runId === scope.runId && previous.revision === next.revision
                ? previous.selected.filter((seat) => failed.includes(seat))
                : [],
          }));
        }
      } catch (cause) {
        if (lease.current === scope && !scope.controller.signal.aborted && serial === scope.serial)
          setError(cause instanceof Error ? cause.message : 'The run could not be refreshed.');
      }
    },
    [setError],
  );

  useEffect(() => {
    if (!runId) return;
    const scope: Lease = { runId, controller: new AbortController(), pending: false, serial: 0 };
    lease.current = scope;
    return () => {
      scope.controller.abort();
      if (lease.current === scope) lease.current = undefined;
    };
  }, [runId]);

  useEffect(() => {
    if (!editor?.dirty) return;
    try {
      localStorage.setItem(storageKey(editor.runId), JSON.stringify(editor));
    } catch {
      // The in-memory draft remains available for this session.
    }
  }, [editor]);

  useEffect(() => {
    const scope = lease.current;
    if (!scope || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(scope);
      if (!cancelled && !scope.controller.signal.aborted)
        timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, active, refresh]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void Promise.all(
      (['codex', 'anthropic'] as const).map(async (provider) => {
        try {
          const catalog = await api(`/api/providers/${provider}/models`, parseProviderCatalog, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
          });
          if (!controller.signal.aborted && catalog.provider === provider)
            setCatalogs((previous) => ({ ...previous, [provider]: catalog }));
        } catch (cause) {
          if (!controller.signal.aborted)
            setCatalogError(cause instanceof Error ? cause.message : 'Model discovery failed.');
        }
      }),
    );
    return () => controller.abort();
  }, [active, catalogVersion]);

  useEffect(() => {
    if (!active || !runId) return;
    const controller = new AbortController();
    void api('/api/runs', parseRunChoices, { signal: controller.signal })
      .then((choices) => {
        if (!controller.signal.aborted) {
          setRuns(choices);
          setRunsError(undefined);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setRunsError(cause instanceof Error ? cause.message : 'Retained runs could not be read.');
      });
    return () => controller.abort();
  }, [active, runId]);

  function selectRun(id: string) {
    if (id === runId) return;
    void mutate('Selecting run', async (scope) => {
      await workflowRequest(id, '/select', parseRunReference, {}, scope.controller.signal);
      if (lease.current === scope && !scope.controller.signal.aborted)
        window.dispatchEvent(new Event('lilbits-run-changed'));
    });
  }
  function edit(change: (previous: Editor) => Editor) {
    setEditor((previous) =>
      previous && previous.runId === runId ? { ...change(previous), dirty: true } : previous,
    );
    setNotice(undefined);
  }
  function taskField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    edit((previous) => ({ ...previous, task: { ...previous.task, [key]: value } }));
  }
  function identity(action: string, revision: number, target = '') {
    const key = JSON.stringify([runId, action, revision, target]);
    let value = identities.current.get(key);
    if (!value) {
      value = crypto.randomUUID();
      identities.current.set(key, value);
    }
    return value;
  }
  async function mutate(label: string, apply: (scope: Lease) => Promise<void>) {
    const scope = lease.current;
    if (!scope || scope.pending || scope.runId !== runId || scope.controller.signal.aborted) return;
    scope.pending = true;
    scope.serial++;
    setOperation({ scope, label });
    setError(undefined);
    setNotice(undefined);
    try {
      await apply(scope);
    } catch (cause) {
      if (lease.current === scope && !scope.controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'The operation did not confirm. Review the saved run before retrying.',
        );
    } finally {
      scope.pending = false;
      if (lease.current === scope && !scope.controller.signal.aborted) {
        setOperation(undefined);
        await refresh(scope);
        if (label === 'Preparing workspaces')
          requestAnimationFrame(() => workbench.current?.scrollTo({ top: 0 }));
      }
    }
  }
  async function generateCriteria() {
    if (!draft || !runId || generatingCriteria || !draft.task.question.trim()) return;
    const scope = lease.current;
    if (!scope || scope.runId !== runId) return;
    const captured = JSON.stringify(draft.task);
    const input = {
      draftRevision: draft.baseRevision,
      question: draft.task.question,
      mode: draft.task.mode,
      expectedArtifact: draft.task.expectedArtifact,
      criteria: draft.task.criteria.filter((item) => item.trim()),
      grounding: draft.task.grounding.filter((item) => item.trim()),
      source: draft.task.source,
      scaffold: draft.task.scaffold
        ? `${draft.task.scaffold.id}${draft.task.scaffold.digest ? ` at ${draft.task.scaffold.digest}` : ''}`
        : null,
    };
    setGeneratingCriteria(true);
    setCriteriaSuggestion(undefined);
    setError(undefined);
    try {
      const prefix = `/api/runs/${encodeURIComponent(runId)}/maestro/criteria`;
      const created = await api(
        prefix,
        (value) => {
          if (
            !value ||
            typeof value !== 'object' ||
            !('turnId' in value) ||
            typeof value.turnId !== 'string'
          )
            throw new Error('Maestro returned an invalid request.');
          return value.turnId;
        },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: crypto.randomUUID(), draft: input }),
          signal: scope.controller.signal,
        },
      );
      for (let attempt = 0; attempt < 180; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (scope.controller.signal.aborted || lease.current !== scope) return;
        const result = await api(
          `${prefix}/${encodeURIComponent(created)}`,
          (value) => {
            if (!value || typeof value !== 'object' || !('status' in value))
              throw new Error('Unreadable criteria result.');
            return value;
          },
          { signal: scope.controller.signal },
        );
        if (result.status === 'working') continue;
        if (result.status === 'failed')
          throw new Error(
            'error' in result && typeof result.error === 'string'
              ? result.error
              : 'Criteria generation failed.',
          );
        if (
          result.status !== 'completed' ||
          !('criteria' in result) ||
          !Array.isArray(result.criteria) ||
          !result.criteria.every((item: unknown) => typeof item === 'string')
        )
          throw new Error('Unreadable criteria result.');
        if (
          currentEditor.current?.runId !== runId ||
          JSON.stringify(currentEditor.current.task) !== captured ||
          currentEditor.current.baseRevision !== draft.baseRevision
        ) {
          setError('The setup changed while Maestro was working. Generate criteria again.');
          return;
        }
        setCriteriaSuggestion({
          runId,
          task: captured,
          revision: draft.baseRevision,
          criteria: result.criteria,
        });
        return;
      }
      throw new Error('Maestro is still working. Check the private chat for its response.');
    } catch (cause) {
      if (lease.current === scope && !scope.controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not generate criteria.');
    } finally {
      setGeneratingCriteria(false);
    }
  }
  function save() {
    if (!draft || !visible) return;
    let task: TaskDraft;
    try {
      task = cleanTask(draft.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Review the task fields.');
      question.current?.form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const captured = draft;
    void mutate('Saving draft', async (scope) => {
      let revision = captured.baseRevision;
      if (JSON.stringify(captured.seats) !== JSON.stringify(visible.seats)) {
        const configured = await workflowRequest(
          scope.runId,
          '/configurations',
          parseRunReference,
          { expectedRevision: revision, seats: captured.seats },
          scope.controller.signal,
        );
        revision = configured.revision;
        if (lease.current === scope)
          setEditor((previous) =>
            previous?.runId === scope.runId ? { ...previous, baseRevision: revision } : previous,
          );
      }
      const saved = await workflowRequest(
        scope.runId,
        '/task',
        (value) => parseWorkflow(value, scope.runId),
        { expectedRevision: revision, task },
        scope.controller.signal,
      );
      if (lease.current !== scope || scope.controller.signal.aborted) return;
      setSnapshot(saved);
      clearDraft(scope.runId);
      setEditor(cloneEditor(saved));
      setDraftOpen(false);
      requestAnimationFrame(() => workbench.current?.scrollTo({ top: 0 }));
      setNotice('Draft saved. Prepare the workspaces before starting.');
    });
  }
  function command(
    action: 'prepare' | 'start' | 'compare' | 'discuss' | 'pause' | 'resume' | 'complete' | 'stop',
  ) {
    if (!visible) return;
    if ((action === 'prepare' || action === 'start') && (!preflightPassed || draft?.dirty)) {
      setError('Save the setup and pass preflight before continuing.');
      return;
    }
    const revision = visible.revision;
    const retrySeats = recoveryReady && recovery ? recovery.selected : [];
    void mutate(
      action === 'prepare'
        ? 'Preparing workspaces'
        : action === 'stop'
          ? 'Stopping A/B'
          : 'Updating run',
      async (scope) => {
        await workflowRequest(
          scope.runId,
          `/${action}`,
          () => null,
          {
            expectedRevision: revision,
            requestId: identity(action, revision, retrySeats.join(',')),
            ...(action === 'resume' && retrySeats.length ? { retrySeats } : {}),
          },
          scope.controller.signal,
        );
        if (lease.current === scope)
          setNotice(
            action === 'start'
              ? 'Independent work started in A and B.'
              : action === 'stop'
                ? 'A/B work stopped. Maestro chat remains separate.'
                : 'Run updated.',
          );
      },
    );
  }
  function stopWork() {
    const scope = lease.current;
    if (!scope || !visible || scope.controller.signal.aborted || stopping) return;
    if (!scope.pending) {
      command('stop');
      return;
    }
    if (operation !== 'Preparing workspaces') return;
    setStoppingScope(scope);
    setError(undefined);
    void workflowRequest(
      scope.runId,
      '/stop',
      () => null,
      { requestId: identity('stop', visible.revision) },
      scope.controller.signal,
    )
      .then(() => {
        if (lease.current === scope)
          setNotice('Stop requested. Waiting for workspace preparation to settle.');
      })
      .catch((cause) => {
        if (lease.current === scope && !scope.controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Stopping did not confirm. Refresh the saved state.',
          );
      })
      .finally(() => {
        if (lease.current === scope && !scope.controller.signal.aborted)
          setStoppingScope(undefined);
      });
  }
  function createRun() {
    void mutate('Creating run', async (scope) => {
      const created = await api('/api/runs', parseRunReference, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.any([scope.controller.signal, AbortSignal.timeout(15000)]),
      });
      await workflowRequest(created.id, '/select', parseRunReference, {}, scope.controller.signal);
      if (lease.current === scope && !scope.controller.signal.aborted)
        window.dispatchEvent(new Event('lilbits-run-changed'));
    });
  }
  function reuseSetup() {
    if (!visible?.task || (visible.task.source && !reuseRevision)) return;
    const choice = reuseRevision === 'head' ? 'head' : 'saved';
    const pendingKey = `lilbits-clone:${runId}:${visible.revision}:${choice}`;
    let requestId = identity('clone', visible.revision, choice);
    try {
      requestId = localStorage.getItem(pendingKey) || requestId;
      localStorage.setItem(pendingKey, requestId);
    } catch {
      // The in-memory request ID still makes retries safe in this session.
    }
    void mutate('Copying setup', async (scope) => {
      const created = await workflowRequest(
        scope.runId,
        '/clone',
        parseRunReference,
        { requestId, expectedRevision: visible.revision, sourceChoice: choice },
        scope.controller.signal,
      );
      await workflowRequest(created.id, '/select', parseRunReference, {}, scope.controller.signal);
      if (lease.current === scope && !scope.controller.signal.aborted) {
        identities.current.delete(JSON.stringify([runId, 'clone', visible.revision, choice]));
        try {
          localStorage.removeItem(pendingKey);
        } catch {
          // The completed receipt remains safe to retry.
        }
        setReuseSelection({ runId, value: '' });
        setStep(0);
        setDraftOpen(true);
        window.dispatchEvent(new Event('lilbits-run-changed'));
      }
    });
  }
  function saveAnalysis() {
    if (!visible) return;
    void mutate('Saving Maestro analysis', async (scope) => {
      await workflowRequest(
        scope.runId,
        '/synthesis',
        () => null,
        {
          expectedRevision: visible.revision,
          requestId: identity('synthesis', visible.revision, synthesisTurnId),
          ...(synthesisTurnId ? { turnId: synthesisTurnId } : {}),
        },
        scope.controller.signal,
      );
      if (lease.current === scope)
        setNotice('Maestro analysis retained separately. Original candidates are unchanged.');
    });
  }
  function applyProposal() {
    if (!visible?.proposal || visible.proposal.status !== 'proposed') return;
    const proposal = visible.proposal;
    void mutate('Applying requested action', async (scope) => {
      await workflowRequest(
        scope.runId,
        `/actions/${encodeURIComponent(proposal.id)}/apply`,
        () => null,
        {
          expectedRevision: visible.revision,
          requestId: identity('apply', visible.revision, proposal.id),
        },
        scope.controller.signal,
      );
      if (lease.current === scope) setNotice('Requested action applied.');
    });
  }

  const presentation = runPresentation(visible);
  const present = (content: React.ReactNode) => ({
    description: presentation.description,
    content,
  });
  if (!runId)
    return present(
      <div className="run-workbench">
        <p className="run-muted">Connect to the room to configure a run.</p>
      </div>,
    );
  if (!visible || !draft)
    return present(
      <div className="run-workbench">
        <output>{error || 'Opening run setup…'}</output>
        {error && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => lease.current && void refresh(lease.current)}
          >
            <RefreshCw />
            Retry
          </Button>
        )}
      </div>,
    );

  return present(
    <div ref={workbench} className="run-workbench" aria-busy={Boolean(operation)}>
      <div className="run-heading">
        <div>
          <span className="run-eyebrow">Run {runId.slice(0, 8)}</span>
          <h3>
            {visible.phase === 'draft' && !visible.task ? 'New run' : workflowLabel(visible.phase)}
          </h3>
        </div>
        <Button variant="ghost" size="sm" disabled={busy || draft.dirty} onClick={createRun}>
          New run
        </Button>
      </div>
      {runs.length > 1 && (
        <label className="run-history">
          Saved runs
          <select
            value={runId}
            disabled={busy || draft.dirty}
            onChange={(event) => selectRun(event.target.value)}
          >
            {!runs.some((run) => run.id === runId) && (
              <option value={runId}>{runId.slice(0, 8)} · current</option>
            )}
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.id.slice(0, 8)} · {new Date(run.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {runsError && <p className="run-error">{runsError}</p>}
      {visible.task && (
        <div className="run-reuse">
          {visible.task.source && (
            <label>
              Source revision for the new run
              <select
                value={reuseRevision}
                disabled={busy || draft.dirty}
                onChange={(event) => {
                  const value = event.target.value;
                  setReuseSelection({
                    runId,
                    value: value === 'recorded' || value === 'head' ? value : '',
                  });
                }}
              >
                <option value="">Choose a revision</option>
                <option value="recorded">Saved revision: {visible.task.source.revision}</option>
                <option value="head">Current HEAD at preparation</option>
              </select>
            </label>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || draft.dirty || Boolean(visible.task.source && !reuseRevision)}
            onClick={reuseSetup}
          >
            Use this setup again
          </Button>
          <p className="run-muted">Creates a new run with fresh workspaces when prepared.</p>
        </div>
      )}
      <p className="run-muted">
        Save or discard setup edits before changing runs. Changing runs clears unsent A/B drafts;
        replies and files remain in history.
      </p>
      {error && (
        <div className="run-error" role="alert">
          <p>{error}</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={Boolean(operation)}
            onClick={() => lease.current && void refresh(lease.current)}
          >
            Refresh saved state
          </Button>
        </div>
      )}
      {notice && <output className="run-notice">{notice}</output>}
      {operation && <output className="run-notice">{operation}…</output>}
      {visible.error && <p className="run-error">{visible.error}</p>}
      {changedElsewhere && (
        <p className="run-error">
          The saved run changed while you were editing. Your draft is preserved.{' '}
          <button
            type="button"
            className="run-text-button"
            onClick={() => {
              clearDraft(visible.runId);
              setEditor(cloneEditor(visible));
              setError(undefined);
            }}
          >
            Load saved settings
          </button>
        </p>
      )}
      {visible.task && (
        <section className="run-review" aria-label="Reviewed task">
          <p className="run-question">{visible.task.question}</p>
          <dl>
            <div>
              <dt>A</dt>
              <dd>
                {visible.seats.a.model} · {visible.seats.a.effort}
              </dd>
            </div>
            <div>
              <dt>B</dt>
              <dd>
                {visible.seats.b.model} · {visible.seats.b.effort}
              </dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>
                {visible.task.profile === 'build'
                  ? 'Create files and run code'
                  : 'Read and search files'}{' '}
                · network available
              </dd>
            </div>
            <div>
              <dt>Limits</dt>
              <dd>
                {visible.task.maxHandoffs} handoffs ·{' '}
                {Math.round((visible.task.timeLimitSeconds / 60) * 10) / 10} minutes
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {visible.workspaces?.source ? (
                  <>
                    <span>{visible.workspaces.source.repository}</span>
                    <code>{visible.workspaces.source.revision}</code>
                  </>
                ) : visible.task.source ? (
                  `${visible.task.source.repository} at ${visible.task.source.revision}`
                ) : visible.task.scaffold ? (
                  `Scaffold ${visible.task.scaffold.id}`
                ) : (
                  'Independent scratch directories'
                )}
              </dd>
            </div>
          </dl>
          {visible.task.expectedArtifact && (
            <p className="run-muted">Expected result: {visible.task.expectedArtifact}</p>
          )}
          {visible.workspaces && (
            <p className="run-muted">
              Workspaces {visible.workspaces.state}. A and B have separate working directories.
            </p>
          )}
        </section>
      )}
      {visible.proposedSeats && (
        <section className="run-proposal">
          <h4>Maestro’s proposed models</h4>
          <p>
            A: {visible.proposedSeats.a.provider} · {visible.proposedSeats.a.model} ·{' '}
            {visible.proposedSeats.a.effort}
            <br />
            B: {visible.proposedSeats.b.provider} · {visible.proposedSeats.b.model} ·{' '}
            {visible.proposedSeats.b.effort}
          </p>
          <p className="run-muted">
            Copy these choices into your draft to review them. Your task text stays intact; Save
            draft applies the configuration.
          </p>
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => {
              const seats = visible.proposedSeats;
              if (seats) {
                edit((previous) => ({ ...previous, seats: structuredClone(seats) }));
                setDraftOpen(true);
              }
            }}
          >
            {draft.dirty ? 'Replace draft model choices' : 'Use proposed models'}
          </Button>
        </section>
      )}
      {visible.task && ['draft', 'ready', 'failed'].includes(visible.phase) && (
        <section className="run-review" aria-label="Preflight checks">
          <h4>Preflight checks</h4>
          <p className="run-muted">
            Checks model availability, the source commit, and destination permissions. Preparation
            checks again and verifies sandbox tools.
          </p>
          <p className="run-muted">
            {visible.phase === 'ready'
              ? 'Workspaces are prepared. Check the setup, then start the run.'
              : 'Check the setup, then prepare workspaces. The start button appears after preparation.'}
          </p>
          {draft.dirty && (
            <p className="run-muted">Save your edits before preparing or starting.</p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || checkingPreflight || !draft.task.question.trim()}
            onClick={() => void checkPreflight()}
          >
            {checkingPreflight ? 'Checking…' : currentPreflight ? 'Check again' : 'Check setup'}
          </Button>
          {currentPreflight && (
            <div aria-live="polite">
              {(
                [
                  ['A', currentPreflight.seats.a],
                  ['B', currentPreflight.seats.b],
                  ['Source', currentPreflight.source],
                  ['Destination', currentPreflight.destination],
                ] as const
              ).map(([label, item]) => (
                <p key={label} className={item.ok ? 'run-muted' : 'run-error'}>
                  {label}: {item.detail}
                  {item.path && (
                    <>
                      {' '}
                      <code>{item.path}</code>
                    </>
                  )}
                  {item.repository && (
                    <>
                      {' '}
                      <code>{item.repository}</code>
                    </>
                  )}
                  {item.revision && (
                    <>
                      {' '}
                      <code>{item.revision}</code>
                    </>
                  )}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="run-phase-controls">
        {visible.task && ['draft', 'ready', 'failed'].includes(visible.phase) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || draft.dirty || checkingPreflight || !preflightPassed}
            onClick={() => command('prepare')}
          >
            <FolderOpen />
            {visible.phase === 'ready' ? 'Prepare again' : 'Prepare workspaces'}
          </Button>
        )}
        {visible.phase === 'ready' && (
          <Button
            size="sm"
            disabled={busy || draft.dirty || checkingPreflight || !preflightPassed}
            onClick={() => command('start')}
          >
            <Play />
            Start run
          </Button>
        )}
        {visible.phase === 'awaiting-comparison' && (
          <Button size="sm" disabled={busy} onClick={() => command('compare')}>
            <ChevronRight />
            Compare outputs
          </Button>
        )}
        {visible.phase === 'comparison' && !visible.busy && (
          <Button size="sm" disabled={busy} onClick={() => command('discuss')}>
            Open bounded discussion
          </Button>
        )}
        {activePhases.includes(visible.phase) && visible.phase !== 'preparing' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(operation)}
            onClick={() => command('pause')}
          >
            Pause at boundary
          </Button>
        )}
        {['paused', 'interrupted', 'failed'].includes(visible.phase) && !visible.busy && (
          <div className="run-recovery">
            {recovery?.runId === runId && recovery.failed.length > 0 && (
              <fieldset>
                <legend>Choose failed or stopped seats to retry</legend>
                {recovery.failed.map((seat) => (
                  <label key={seat}>
                    <input
                      type="checkbox"
                      checked={recovery.selected.includes(seat)}
                      onChange={(event) =>
                        setRecovery((previous) =>
                          previous?.runId === runId
                            ? {
                                ...previous,
                                selected: event.target.checked
                                  ? [...previous.selected, seat]
                                  : previous.selected.filter((value) => value !== seat),
                              }
                            : previous,
                        )
                      }
                    />
                    Retry {seat.toUpperCase()}
                  </label>
                ))}
              </fieldset>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={
                Boolean(operation) ||
                draft.dirty ||
                !recoveryReady ||
                Boolean(
                  recovery?.runId === runId && recovery.failed.length && !recovery.selected.length,
                )
              }
              onClick={() => command('resume')}
            >
              {recovery?.runId === runId && recovery.failed.length
                ? 'Retry selected seats'
                : 'Resume at boundary'}
            </Button>
          </div>
        )}
        {['awaiting-comparison', 'comparison', 'discussion', 'paused'].includes(visible.phase) &&
          !visible.busy && (
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(operation)}
              onClick={() => command('complete')}
            >
              Complete run
            </Button>
          )}
        {(operation === 'Preparing workspaces' ||
          visible.busy ||
          activePhases.includes(visible.phase) ||
          visible.phase === 'paused') && (
          <Button
            size="sm"
            variant="ghost"
            disabled={stopping || Boolean(operation && operation !== 'Preparing workspaces')}
            onClick={stopWork}
          >
            <Square />
            Stop A/B
          </Button>
        )}
      </div>
      {editable && (
        <details
          className="run-editor"
          open={draftOpen}
          onToggle={(event) => setDraftOpen(event.currentTarget.open)}
        >
          <summary>{visible.task ? 'Edit task and models' : 'Set up the task'}</summary>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <nav className="run-steps" aria-label="Setup steps">
              {steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  aria-current={step === index ? 'step' : undefined}
                  onClick={() => setStep(index)}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </nav>
            <div hidden={step !== 0}>
              <label htmlFor={`${fieldPrefix}-question`}>Question or task</label>
              <Textarea
                id={`${fieldPrefix}-question`}
                ref={question}
                className="resize-none"
                rows={4}
                maxLength={6000}
                value={draft.task.question}
                aria-invalid={Boolean(error && !draft.task.question.trim())}
                onChange={(event) => taskField('question', event.target.value)}
                placeholder="What should A and B work out independently?"
              />
              <div className="run-field-grid">
                <label>
                  Task mode
                  <select
                    value={draft.task.mode}
                    onChange={(event) =>
                      edit((previous) => ({
                        ...previous,
                        task: {
                          ...previous.task,
                          mode: event.target.value === 'prototype' ? 'prototype' : 'reasoning',
                          profile:
                            event.target.value === 'prototype' ? 'build' : previous.task.profile,
                        },
                      }))
                    }
                  >
                    <option value="reasoning">Reasoning and analysis</option>
                    <option value="prototype">Competing prototypes</option>
                  </select>
                </label>
                <label>
                  Tool access
                  <select
                    value={draft.task.profile}
                    disabled={draft.task.mode === 'prototype'}
                    onChange={(event) =>
                      taskField('profile', event.target.value === 'build' ? 'build' : 'analysis')
                    }
                  >
                    <option value="analysis">Read and search local files</option>
                    <option value="build">Create files and run code</option>
                  </select>
                </label>
              </div>
            </div>
            <div hidden={step !== 1}>
              <label htmlFor={`${fieldPrefix}-artifact`}>Intended result</label>
              <Input
                id={`${fieldPrefix}-artifact`}
                maxLength={1000}
                value={draft.task.expectedArtifact}
                onChange={(event) => taskField('expectedArtifact', event.target.value)}
                placeholder="An answer, analysis, report, or working prototype"
              />
              <Button
                type="button"
                size="sm"
                disabled={generatingCriteria || !draft.task.question.trim()}
                onClick={() => void generateCriteria()}
              >
                {generatingCriteria ? 'Generating criteria…' : 'Auto-generate criteria'}
              </Button>
              {criteriaSuggestion?.runId === runId && (
                <section aria-label="Suggested acceptance criteria">
                  <p>Maestro suggested:</p>
                  <ul>
                    {criteriaSuggestion.criteria.map((criterion, index) => (
                      <li key={`${index}-${criterion}`}>{criterion}</li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      criteriaSuggestion.task !== JSON.stringify(draft.task) ||
                      criteriaSuggestion.revision !== draft.baseRevision
                    }
                    onClick={() => {
                      taskField('criteria', criteriaSuggestion.criteria);
                      setCriteriaSuggestion(undefined);
                    }}
                  >
                    Use suggested criteria
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCriteriaSuggestion(undefined)}
                  >
                    Discard suggestion
                  </Button>
                  {(criteriaSuggestion.task !== JSON.stringify(draft.task) ||
                    criteriaSuggestion.revision !== draft.baseRevision) && (
                    <p>The setup changed. Generate a new suggestion.</p>
                  )}
                </section>
              )}
              <div className="run-field-grid">
                <label htmlFor={`${fieldPrefix}-criteria`}>
                  Success criteria, one per line
                  <Textarea
                    id={`${fieldPrefix}-criteria`}
                    className="resize-none"
                    rows={3}
                    maxLength={3000}
                    value={draft.task.criteria.join('\n')}
                    onChange={(event) => taskField('criteria', event.target.value.split('\n'))}
                  />
                </label>
                <label htmlFor={`${fieldPrefix}-grounding`}>
                  Shared notes and references
                  <Textarea
                    id={`${fieldPrefix}-grounding`}
                    className="resize-none"
                    rows={3}
                    maxLength={4000}
                    value={draft.task.grounding.join('\n')}
                    onChange={(event) => taskField('grounding', event.target.value.split('\n'))}
                  />
                </label>
              </div>
            </div>
            <div hidden={step !== 3}>
              <div className="run-model-grid">
                {(['a', 'b'] as const).map((seat) => (
                  <RunSeatModel
                    key={seat}
                    seat={seat}
                    value={draft.seats[seat]}
                    catalogs={catalogs}
                    onChange={(value) =>
                      edit((previous) => ({
                        ...previous,
                        seats: { ...previous.seats, [seat]: value },
                      }))
                    }
                  />
                ))}
              </div>
              {catalogError && <p className="run-error">{catalogError}</p>}
              {(['codex', 'anthropic'] as const).map(
                (provider) =>
                  catalogs[provider]?.status === 'unavailable' && (
                    <p className="run-error" key={provider}>
                      {provider === 'codex' ? 'Codex' : 'Anthropic'}:{' '}
                      {catalogs[provider]?.reason || 'Unavailable'}
                    </p>
                  ),
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCatalogError(undefined);
                  setCatalogVersion((value) => value + 1);
                }}
              >
                <RefreshCw />
                Refresh subscribed models
              </Button>
            </div>
            <div hidden={step !== 2}>
              <ScaffoldPicker
                value={draft.task.scaffold?.id ?? ''}
                onChange={(id) =>
                  edit((previous) => ({
                    ...previous,
                    task: {
                      ...previous.task,
                      scaffold: id ? { id } : undefined,
                      source: id ? null : previous.task.source,
                    },
                  }))
                }
              />
              {draft.task.scaffold && (
                <p className="run-muted">
                  The selected template is pinned during preparation. Each seat receives its own
                  project worktree.
                </p>
              )}
              <label htmlFor={`${fieldPrefix}-project-directory`}>
                Project destination, optional
              </label>
              <Input
                id={`${fieldPrefix}-project-directory`}
                value={draft.task.projectDirectory ?? ''}
                onChange={(event) => taskField('projectDirectory', event.target.value || undefined)}
                placeholder="Choose a project folder"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBrowsingProject(true)}
              >
                <FolderOpen aria-hidden="true" /> Browse project folders
              </Button>
              {browsingProject && (
                <RepositoryBrowser
                  key={`project:${runId}`}
                  onClose={() => setBrowsingProject(false)}
                  onSelect={(path) => {
                    taskField('projectDirectory', path);
                    setBrowsingProject(false);
                  }}
                />
              )}
              <p className="run-muted">
                Preparation initializes an empty folder as a Git project. Choose an existing Git
                repository or an empty folder. Completed results are saved separately in its managed
                folder.
              </p>
              <fieldset disabled={Boolean(draft.task.scaffold)}>
                <label htmlFor={`${fieldPrefix}-repository`}>Repository folder, optional</label>
                <Input
                  id={`${fieldPrefix}-repository`}
                  value={draft.task.source?.repository ?? ''}
                  onChange={(event) =>
                    taskField(
                      'source',
                      event.target.value
                        ? {
                            repository: event.target.value,
                            revision: draft.task.source?.revision || 'HEAD',
                          }
                        : null,
                    )
                  }
                  placeholder="Leave blank for separate scratch workspaces"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBrowsingRepository(true)}
                >
                  <FolderOpen aria-hidden="true" /> Browse folders
                </Button>
                {browsingRepository && (
                  <RepositoryBrowser
                    key={runId}
                    onClose={() => setBrowsingRepository(false)}
                    onSelect={(path) => {
                      taskField('source', {
                        repository: path,
                        revision: draft.task.source?.revision || 'HEAD',
                      });
                      setBrowsingRepository(false);
                    }}
                  />
                )}
                {draft.task.source && (
                  <label htmlFor={`${fieldPrefix}-revision`}>
                    Source revision
                    <Input
                      id={`${fieldPrefix}-revision`}
                      value={draft.task.source.revision}
                      onChange={(event) =>
                        taskField('source', {
                          repository: draft.task.source?.repository ?? '',
                          revision: event.target.value,
                        })
                      }
                      placeholder="HEAD or an immutable commit"
                    />
                  </label>
                )}
                <p className="run-muted">
                  Preparation records the exact commit. Uncommitted source changes are excluded.
                </p>
              </fieldset>
              <div className="run-field-grid">
                <label htmlFor={`${fieldPrefix}-handoffs`}>
                  Automatic handoffs, 0–8
                  <Input
                    id={`${fieldPrefix}-handoffs`}
                    type="number"
                    min={0}
                    max={8}
                    value={draft.task.maxHandoffs}
                    aria-invalid={draft.task.maxHandoffs < 0 || draft.task.maxHandoffs > 8}
                    onChange={(event) => taskField('maxHandoffs', Number(event.target.value))}
                  />
                </label>
                <label htmlFor={`${fieldPrefix}-seconds`}>
                  Time limit in seconds, 30–3600
                  <Input
                    id={`${fieldPrefix}-seconds`}
                    type="number"
                    min={30}
                    max={3600}
                    value={draft.task.timeLimitSeconds}
                    aria-invalid={
                      draft.task.timeLimitSeconds < 30 || draft.task.timeLimitSeconds > 3600
                    }
                    onChange={(event) => taskField('timeLimitSeconds', Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
            {step === 4 && (
              <section className="run-review" aria-label="Review setup">
                <h4>Review setup</h4>
                <p className="run-question">
                  {draft.task.question || 'Add a question to continue.'}
                </p>
                <p>Result: {draft.task.expectedArtifact || 'Not specified'}</p>
                <p>
                  Criteria:{' '}
                  {draft.task.criteria.filter((item) => item.trim()).join('; ') || 'None yet'}
                </p>
                <p>
                  Project destination: {draft.task.projectDirectory || 'Managed workspace storage'}
                </p>
                <p>
                  Source:{' '}
                  {draft.task.source
                    ? `${draft.task.source.repository} at ${draft.task.source.revision}`
                    : draft.task.scaffold
                      ? `Scaffold ${draft.task.scaffold.id}`
                      : 'Independent scratch directories'}
                </p>
                <p>
                  A: {draft.seats.a.model} · {draft.seats.a.effort}
                  <br />
                  B: {draft.seats.b.model} · {draft.seats.b.effort}
                </p>
                {visible.workspaces && (
                  <p>
                    A: {visible.workspaces.seats.a.root}
                    <br />
                    B: {visible.workspaces.seats.b.root}
                  </p>
                )}
                <p className="run-muted">
                  Preflight checks model availability, source or scaffold selection, and destination
                  permissions. Preparation also verifies sandbox tools.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy || checkingPreflight || !draft.task.question.trim()}
                  onClick={() => void checkPreflight()}
                >
                  {checkingPreflight ? 'Checking…' : 'Check setup'}
                </Button>
                {currentPreflight && (
                  <p className="run-muted">
                    {preflightPassed ? 'Checks passed.' : 'Some checks need attention.'}
                  </p>
                )}
                {currentPreflight && renderPreflightDetails(currentPreflight)}
              </section>
            )}
            <div className="run-buttons">
              {step > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < steps.length - 1 && (
                <Button
                  type="button"
                  size="sm"
                  disabled={step === 0 && !draft.task.question.trim()}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={step !== 4 || busy || changedElsewhere || !draft.task.question.trim()}
              >
                Save draft
              </Button>
              {draft.dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    clearDraft(visible.runId);
                    setEditor(cloneEditor(visible));
                    setError(undefined);
                  }}
                >
                  Discard edits
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
      {visible.phase === 'independent' && (
        <p className="run-muted">
          A and B work independently. Peer messages and peer artifacts stay closed until you open
          comparison.
        </p>
      )}
      {visible.phase === 'awaiting-comparison' && (
        <p className="run-muted">
          Both initial outputs are ready. Compare them, or complete the run with the disagreement
          intact.
        </p>
      )}
      {visible.proposal && (
        <section className="run-proposal">
          <h4>
            {visible.proposal.kind === 'pause'
              ? 'Proposed pause for A and B'
              : `Proposed instruction to ${visible.proposal.target === 'both' ? 'A and B' : visible.proposal.target.toUpperCase()}`}
          </h4>
          {visible.proposal.text && <p>{visible.proposal.text}</p>}
          <p className="run-muted">
            Private analysis has not been sent to the seats. Apply this action only when you want it
            published or performed.
          </p>
          <Button
            size="sm"
            disabled={
              Boolean(operation) ||
              visible.proposal.status === 'applied' ||
              visible.proposal.revision !== visible.revision
            }
            onClick={applyProposal}
          >
            {visible.proposal.status === 'applied' ? 'Applied' : 'Apply requested action'}
          </Button>
        </section>
      )}
      {presentation.configured && (
        <OutcomeReview
          key={runId}
          runId={runId}
          active={active}
          onDraftQuestion={onDraftQuestion}
        />
      )}
      {visible.workspaces && (
        <section className="run-workspace-cards" aria-label="Participant workspaces">
          <h4>Participant workspaces</h4>
          <p className="run-muted">
            These are live working directories. Their contents may change as the run continues.
          </p>
          <div className="run-workspace-grid">
            {(['a', 'b'] as const).map((seat) => {
              const path = visible.workspaces?.seats[seat].root ?? '';
              return (
                <article className="run-workspace-card" key={seat}>
                  <h5>Seat {seat.toUpperCase()}</h5>
                  <p className="run-muted">Workspace {visible.workspaces?.state}</p>
                  <code>{path}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(path);
                        setCopyNotice({
                          runId,
                          text: `Copied seat ${seat.toUpperCase()} workspace path.`,
                        });
                      } catch {
                        setCopyNotice({
                          runId,
                          text: `Could not copy seat ${seat.toUpperCase()} path. Select the path to copy it.`,
                        });
                      }
                    }}
                  >
                    Copy path
                  </Button>
                </article>
              );
            })}
          </div>
          <output aria-live="polite">{copyNotice?.runId === runId ? copyNotice.text : ''}</output>
        </section>
      )}
      <RunReports
        key={`reports:${runId}`}
        runId={runId}
        active={active}
        runs={runs}
        runsError={runsError}
      />
      {presentation.configured && (
        <RunArtifacts
          runId={runId}
          artifacts={visible.artifacts}
          disabled={Boolean(operation)}
          canSaveAnalysis={canSaveAnalysis}
          onSaveAnalysis={saveAnalysis}
          onDraftQuestion={onDraftQuestion}
        />
      )}
      {presentation.configured && <RetainedWorkspaces runId={runId} active={active} />}
      <p className="run-muted run-separate">
        <FileText />
        Maestro stays text-only. Task controls affect A/B only when you choose an action.
      </p>
    </div>,
  );
}
