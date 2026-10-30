import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  criterionResults,
  goalStatuses,
  outcomeRequest,
  selections,
  type Decision,
  type OutcomeRevision,
  type OutcomeSnapshot,
} from '@/lib/outcomes';

type Draft = { proposal: OutcomeRevision; decision: Decision };
const label = (value: string) =>
  ({
    a: 'A',
    b: 'B',
    tie: 'Tie',
    combined: 'Combined',
    neither: 'Neither',
    inconclusive: 'Inconclusive',
    solved: 'Solved',
    partial: 'Partial',
    unresolved: 'Unresolved',
    'awaiting-validation': 'Awaiting validation',
    met: 'Met',
    'partially-met': 'Partially met',
    'not-met': 'Not met',
    unknown: 'Unknown',
  })[value] ?? value;

export function OutcomeReview({
  runId,
  active,
  onDraftQuestion,
}: {
  runId: string;
  active: boolean;
  onDraftQuestion: (text: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<OutcomeSnapshot>();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [pending, setPending] = useState(false);
  const serial = useRef(0);
  const current = useRef(true);
  const submitting = useRef(false);
  const retry = useRef<{ body: string; requestId: string } | undefined>(undefined);
  const snapshotRef = useRef<OutcomeSnapshot | undefined>(undefined);
  const apply = useCallback((next: OutcomeSnapshot) => {
    if (snapshotRef.current && next.revision < snapshotRef.current.revision) return;
    snapshotRef.current = next;
    setSnapshot(next);
    setDraft(
      (previous) =>
        previous ??
        (next.latestProposal
          ? {
              proposal: next.latestProposal,
              decision: structuredClone(next.latestProposal.decision),
            }
          : undefined),
    );
  }, []);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function refresh() {
      const request = ++serial.current;
      try {
        const next = await outcomeRequest(runId, '', { signal: controller.signal });
        if (!controller.signal.aborted && request === serial.current) {
          apply(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted && request === serial.current)
          setError(cause instanceof Error ? cause.message : 'Could not load the outcome.');
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (!submitting.current) void refresh();
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [active, runId, apply]);
  async function confirm() {
    if (
      !snapshot ||
      !draft ||
      submitting.current ||
      !snapshot.canConfirm ||
      snapshot.latestProposal?.revision !== draft.proposal.revision
    )
      return;
    submitting.current = true;
    setPending(true);
    setConfirmError(undefined);
    ++serial.current;
    const payload = JSON.stringify({
      expectedRevision: snapshot.revision,
      decision: draft.decision,
    });
    if (retry.current?.body !== payload)
      retry.current = { body: payload, requestId: crypto.randomUUID() };
    try {
      const next = await outcomeRequest(runId, `/${draft.proposal.revision}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: retry.current.requestId,
          expectedRevision: snapshot.revision,
          decision: draft.decision,
        }),
      });
      if (current.current) {
        apply(next);
        retry.current = undefined;
      }
    } catch (cause) {
      if (current.current) {
        setConfirmError(cause instanceof Error ? cause.message : 'Could not confirm the outcome.');
        try {
          const next = await outcomeRequest(runId);
          if (current.current) apply(next);
        } catch {}
      }
    } finally {
      submitting.current = false;
      if (current.current) setPending(false);
    }
  }
  const proposal = snapshot?.latestProposal;
  const stale = Boolean(draft && proposal?.revision !== draft.proposal.revision);
  const confirmed = snapshot?.latestConfirmed;
  const alreadyConfirmed = Boolean(
    draft && confirmed?.proposalRevision === draft.proposal.revision,
  );
  const reason = stale
    ? 'A newer proposal is available. Load it to confirm.'
    : alreadyConfirmed
      ? 'This proposal has already been confirmed.'
      : !snapshot?.canConfirm
        ? 'Confirmation is unavailable while Maestro is working or the task or proposal is out of date. Refresh or ask Maestro for a new proposal.'
        : undefined;
  function change(update: (decision: Decision) => Decision) {
    setDraft((previous) => previous && { ...previous, decision: update(previous.decision) });
  }
  return (
    <section className="run-outcome" aria-label="Outcome review">
      <div className="run-section-heading">
        <h4>Outcome review</h4>
        {snapshot && <span>Revision {snapshot.revision}</span>}
      </div>
      {!snapshot && !error && <output>Loading outcome…</output>}
      {(confirmError || error) && (
        <p className="run-error" role="alert">
          {confirmError || error}
        </p>
      )}
      {snapshot && !proposal && (
        <>
          <p className="run-muted">
            After both outputs finish, ask Maestro to propose an outcome for your review.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onDraftQuestion(
                'Review both completed outputs against the task criteria and propose an outcome for my review. Cite the evidence for each criterion.',
              )
            }
          >
            Ask Maestro to propose
          </Button>
        </>
      )}
      {confirmed && (
        <p className="run-muted">
          Confirmed revision {confirmed.revision} · {label(confirmed.decision.selection)} ·{' '}
          {label(confirmed.decision.goalStatus)}. {confirmed.decision.summary}
        </p>
      )}
      {draft && (
        <div className="run-outcome-draft">
          <p className="run-muted">
            Maestro proposal {draft.proposal.revision} · A: {draft.proposal.candidates.a.provider} /{' '}
            {draft.proposal.candidates.a.model} · B: {draft.proposal.candidates.b.provider} /{' '}
            {draft.proposal.candidates.b.model}
          </p>
          {stale && proposal && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setDraft({ proposal, decision: structuredClone(proposal.decision) })}
            >
              Load latest proposal
            </Button>
          )}
          <label>
            Selection
            <select
              disabled={pending}
              value={draft.decision.selection}
              onChange={(event) => {
                const value = selections.find((item) => item === event.target.value);
                if (value) change((decision) => ({ ...decision, selection: value }));
              }}
            >
              {selections.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal status
            <select
              disabled={pending}
              value={draft.decision.goalStatus}
              onChange={(event) => {
                const value = goalStatuses.find((item) => item === event.target.value);
                if (value) change((decision) => ({ ...decision, goalStatus: value }));
              }}
            >
              {goalStatuses.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Summary
            <textarea
              className="resize-none"
              disabled={pending}
              rows={3}
              value={draft.decision.summary}
              onChange={(event) =>
                change((decision) => ({ ...decision, summary: event.target.value }))
              }
            />
          </label>
          {draft.decision.criteria.map((criterion) => (
            <fieldset key={criterion.index}>
              <legend>
                {snapshot?.task?.revision === draft.proposal.taskRevision
                  ? (snapshot.task.criteria[criterion.index] ?? `Criterion ${criterion.index + 1}`)
                  : `Criterion ${criterion.index + 1}`}
              </legend>
              <label>
                Assessment
                <select
                  disabled={pending}
                  value={criterion.result}
                  onChange={(event) => {
                    const value = criterionResults.find((item) => item === event.target.value);
                    if (value)
                      change((decision) => ({
                        ...decision,
                        criteria: decision.criteria.map((item) =>
                          item.index === criterion.index ? { ...item, result: value } : item,
                        ),
                      }));
                  }}
                >
                  {criterionResults.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Evidence
                <textarea
                  className="resize-none"
                  disabled={pending}
                  rows={2}
                  value={criterion.evidence}
                  onChange={(event) =>
                    change((decision) => ({
                      ...decision,
                      criteria: decision.criteria.map((item) =>
                        item.index === criterion.index
                          ? { ...item, evidence: event.target.value }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
            </fieldset>
          ))}
          {reason && <p className="run-muted">{reason}</p>}
          <Button
            type="button"
            size="sm"
            disabled={pending || Boolean(reason)}
            aria-busy={pending}
            onClick={() => void confirm()}
          >
            {pending ? 'Confirming…' : 'Confirm outcome'}
          </Button>
        </div>
      )}
      {snapshot && snapshot.history.length > 0 && (
        <details>
          <summary>Outcome history ({snapshot.history.length})</summary>
          <ul>
            {snapshot.history.map((item) => (
              <li key={item.revision}>
                Revision {item.revision} · {item.kind} · {label(item.decision.selection)} ·{' '}
                {label(item.decision.goalStatus)} · {item.decision.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
