import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/agents';
import {
  parsePreservedResult,
  type PreservedResult,
  parseRetainedInventory,
  parseRetainedWorkspace,
  type RetainedInventory,
  type RetainedWorkspace,
} from '@/lib/retained-workspaces';
import './retained-workspaces.css';

function WorkspaceCloseout({ workspace }: { workspace: RetainedWorkspace }) {
  const [result, setResult] = useState<PreservedResult | null>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    digest: string;
    action: 'cleanup' | 'publish';
  }>();
  const [name, setName] = useState(`maestro-${workspace.runId.slice(0, 40)}-${workspace.seat}`);
  const nameId = useId();
  const prefix = `/api/runs/${encodeURIComponent(workspace.runId)}/retained-workspaces/${workspace.seat}`;
  useEffect(() => {
    const controller = new AbortController();
    void api(`${prefix}/result`, parsePreservedResult, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not read preserved result.');
      });
    return () => controller.abort();
  }, [prefix]);

  async function act(action: 'preserve' | 'cleanup' | 'publish') {
    if (pending) return;
    if (
      action !== 'preserve' &&
      (!result || confirmation?.digest !== result.digest || confirmation.action !== action)
    )
      return;
    setPending(true);
    setError('');
    try {
      const updated = await api(`${prefix}/${action}`, parsePreservedResult, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'preserve'
            ? {}
            : {
                digest: result?.digest,
                confirmation: true,
                ...(action === 'publish' ? { name } : {}),
              },
        ),
      });
      if (!updated || updated.runId !== workspace.runId || updated.seat !== workspace.seat)
        throw new Error('The result could not be confirmed. Refresh and try again.');
      setResult(updated);
      setConfirmation(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The operation failed. Your local files remain available.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="workspace-closeout">
      {!result?.cleanedAt && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void act('preserve')}
        >
          {pending ? 'Working…' : result ? 'Preserve current work' : 'Preserve result locally'}
        </Button>
      )}
      {result && (
        <>
          <p>
            Preserved {new Date(result.preservedAt).toLocaleString()} in an independent local
            repository.
          </p>
          <code>{result.path}</code>
          <details>
            <summary>Excluded files and directories ({result.excluded.length})</summary>
            {result.excluded.length ? (
              <ul>
                {result.excluded.map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No files were excluded.</p>
            )}
          </details>
          <p>
            Review the preserved files and exclusions before publishing or removing the working
            directory.
          </p>
          {result.remote ? (
            <p>
              Saved privately to{' '}
              <a href={result.remote} target="_blank" rel="noreferrer">
                {result.remote}
              </a>
              .
            </p>
          ) : (
            <>
              <label htmlFor={nameId}>Private GitHub repository name</label>
              <Input
                id={nameId}
                value={name}
                maxLength={100}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*"
                disabled={pending}
                onChange={(event) => {
                  setName(event.target.value);
                  setConfirmation(undefined);
                }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={
                    confirmation?.digest === result.digest && confirmation.action === 'publish'
                  }
                  disabled={pending}
                  onChange={(event) =>
                    setConfirmation(
                      event.target.checked
                        ? { digest: result.digest, action: 'publish' }
                        : undefined,
                    )
                  }
                />
                I reviewed the preserved files and want to publish them to this private repository
                using my signed-in GitHub account.
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  pending ||
                  !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(name) ||
                  confirmation?.action !== 'publish'
                }
                onClick={() => void act('publish')}
              >
                Save to private GitHub repository
              </Button>
            </>
          )}
          {result.cleanedAt ? (
            <p>Agent worktree removed. The preserved local result remains available.</p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={
                    confirmation?.digest === result.digest && confirmation.action === 'cleanup'
                  }
                  disabled={pending}
                  onChange={(event) =>
                    setConfirmation(
                      event.target.checked
                        ? { digest: result.digest, action: 'cleanup' }
                        : undefined,
                    )
                  }
                />
                I reviewed the preserved result and exclusions and want to remove this agent
                worktree.
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || confirmation?.action !== 'cleanup'}
                onClick={() => void act('cleanup')}
              >
                Remove agent worktree
              </Button>
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function RetainedWorkspaces({ runId, active = true }: { runId: string; active?: boolean }) {
  const [inventory, setInventory] = useState<RetainedInventory>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [keeping, setKeeping] = useState<string>();
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    api(
      `/api/runs/${encodeURIComponent(runId)}/retained-workspaces?refresh=${version}`,
      parseRetainedInventory,
      {
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) setInventory(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load retained workspaces.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, runId, version]);

  async function keep(workspace: RetainedWorkspace) {
    const key = `${workspace.runId}:${workspace.seat}`;
    setKeeping(key);
    setError(undefined);
    try {
      const updated = await api(
        `/api/runs/${encodeURIComponent(workspace.runId)}/retained-workspaces/${workspace.seat}/keep`,
        parseRetainedWorkspace,
        { method: 'POST' },
      );
      if (
        updated.runId !== workspace.runId ||
        updated.seat !== workspace.seat ||
        updated.keepForNowAt === null
      )
        throw new Error('The keep decision could not be confirmed. Refresh and try again.');
      setInventory(
        (current) =>
          current && {
            ...current,
            workspaces: current.workspaces.map((item) =>
              item.runId === updated.runId && item.seat === updated.seat ? updated : item,
            ),
          },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not keep this workspace.');
    } finally {
      setKeeping(undefined);
    }
  }

  return (
    <section className="retained-workspaces" aria-labelledby="retained-workspaces-heading">
      <div className="retained-workspaces-heading">
        <h3 id="retained-workspaces-heading">Retained workspaces</h3>
        <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          Refresh
        </Button>
      </div>
      <p>
        Keep the live directory for later, or preserve an independent local result before closeout.
      </p>
      {loading && <output>Loading retained workspaces…</output>}
      {error && <p role="alert">{error}</p>}
      {inventory && inventory.unavailableRuns.length > 0 && (
        <output>Some runs could not be read: {inventory.unavailableRuns.join(', ')}.</output>
      )}
      {inventory && inventory.workspaces.length === 0 && !loading && <p>No retained workspaces.</p>}
      {inventory && inventory.workspaces.length > 0 && (
        <ul>
          {inventory.workspaces.map((workspace) => {
            const key = `${workspace.runId}:${workspace.seat}`;
            return (
              <li key={key}>
                <div>
                  <strong>
                    Run {workspace.runId} · {workspace.seat.toUpperCase()}
                  </strong>
                </div>
                <code>{workspace.path}</code>
                <p>Retained around {new Date(workspace.retainedAt).toLocaleString()}.</p>
                {workspace.keepForNowAt !== null ? (
                  <p>Kept for now.</p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(keeping)}
                    onClick={() => void keep(workspace)}
                  >
                    {keeping === key ? 'Saving…' : 'Keep for now'}
                  </Button>
                )}
                <WorkspaceCloseout workspace={workspace} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
