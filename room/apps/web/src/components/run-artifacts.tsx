import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  parseArtifactView,
  runPath,
  workflowRequest,
  type ArtifactMetadata,
  type ArtifactView,
} from '@/lib/run-workflow';

type Preview =
  | { status: 'loading'; runId: string; id: string }
  | { status: 'ready'; runId: string; id: string; view: ArtifactView }
  | { status: 'error'; runId: string; id: string; error: string };

export function RunArtifacts({
  runId,
  artifacts,
  disabled,
  canSaveAnalysis,
  onSaveAnalysis,
  onDraftQuestion,
}: {
  runId: string;
  artifacts: ArtifactMetadata[];
  disabled: boolean;
  canSaveAnalysis: boolean;
  onSaveAnalysis: () => void;
  onDraftQuestion: (text: string) => void;
}) {
  const [preview, setPreview] = useState<Preview>();
  const [renderHtml, setRenderHtml] = useState(false);
  const request = useRef<{ runId: string; controller: AbortController } | undefined>(undefined);
  useEffect(
    () => () => {
      if (request.current?.runId === runId) request.current.controller.abort();
    },
    [runId],
  );
  async function inspect(artifact: ArtifactMetadata) {
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { runId, controller };
    setRenderHtml(false);
    setPreview({ status: 'loading', runId, id: artifact.id });
    try {
      const view = await workflowRequest(
        runId,
        `/artifacts/${encodeURIComponent(artifact.id)}`,
        (value) => parseArtifactView(value, runId, artifact.id),
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted && request.current?.controller === controller)
        setPreview({ status: 'ready', runId, id: artifact.id, view });
    } catch (cause) {
      if (!controller.signal.aborted && request.current?.controller === controller)
        setPreview({
          status: 'error',
          runId,
          id: artifact.id,
          error: cause instanceof Error ? cause.message : 'The artifact could not be loaded.',
        });
    }
  }
  const current = preview?.runId === runId ? preview : undefined;
  const view = current?.status === 'ready' ? current.view : undefined;
  const html = view?.artifact.mimeType.startsWith('text/html');
  return (
    <section className="run-artifacts" aria-label="Retained outputs">
      <div className="run-section-heading">
        <h4>Retained outputs</h4>
        <span>
          {artifacts.length} published {artifacts.length === 1 ? 'file' : 'files'}
        </span>
      </div>
      {artifacts.length ? (
        <ul className="run-artifact-list">
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                aria-pressed={current?.id === artifact.id}
                onClick={() => void inspect(artifact)}
              >
                <FileText aria-hidden="true" />
                <span>
                  <strong>{artifact.title || artifact.path}</strong>
                  <small>
                    {artifact.seat === 'maestro'
                      ? 'Maestro analysis'
                      : `Seat ${artifact.seat.toUpperCase()}`}{' '}
                    · {artifact.bytes.toLocaleString()} bytes
                  </small>
                </span>
              </button>
              <a
                href={`${runPath(runId)}/artifacts/${encodeURIComponent(artifact.id)}/download`}
                download
                aria-label={`Download ${artifact.title || artifact.path}`}
              >
                <Download aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="run-muted">No files published yet. A/B replies remain in their panels.</p>
      )}
      {current?.status === 'loading' && <output>Loading artifact…</output>}
      {current?.status === 'error' && (
        <p className="run-error" role="alert">
          {current.error}
        </p>
      )}
      {view && (
        <section
          className="run-artifact-preview"
          aria-label={`${view.artifact.title || view.artifact.path} preview`}
        >
          <div className="run-section-heading">
            <h5>{view.artifact.title || view.artifact.path}</h5>
            <a href={view.downloadUrl} download>
              <Download aria-hidden="true" />
              Download
            </a>
          </div>
          <dl className="run-artifact-provenance">
            <div>
              <dt>Produced by</dt>
              <dd>
                {view.artifact.seat === 'maestro'
                  ? 'Maestro · saved analysis'
                  : `Seat ${view.artifact.seat.toUpperCase()}`}
              </dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd>
                <code>{view.artifact.sha256}</code>
              </dd>
            </div>
            {view.artifact.sourceRevision && (
              <div>
                <dt>Source commit</dt>
                <dd>
                  <code>{view.artifact.sourceRevision}</code>
                </dd>
              </div>
            )}
            <div>
              <dt>Producing turn</dt>
              <dd>
                <code>{view.artifact.turnId}</code>
              </dd>
            </div>
          </dl>
          {html && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRenderHtml((previous) => !previous)}
            >
              <ExternalLink aria-hidden="true" />
              {renderHtml ? 'Show source text' : 'Preview HTML in isolation'}
            </Button>
          )}
          {html && renderHtml ? (
            <iframe
              title={`Isolated preview of ${view.artifact.title || view.artifact.path}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              src={`${runPath(runId)}/artifacts/${encodeURIComponent(view.artifact.id)}/preview`}
            />
          ) : view.text !== null ? (
            <pre>{view.text}</pre>
          ) : (
            <p className="run-muted">This binary file is available as a download.</p>
          )}
          {view.truncated && (
            <p className="run-muted">
              The preview is shortened. Download the complete published file.
            </p>
          )}
        </section>
      )}
      <div className="run-buttons">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            onDraftQuestion(
              `Compare the current A and B outputs for this run. Cite the messages and published artifacts you use, explain the strongest agreement and disagreement, and suggest the next useful experiment. Preserve uncertainty where the evidence does not decide.`,
            )
          }
        >
          Draft a comparison question
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !canSaveAnalysis}
          onClick={onSaveAnalysis}
        >
          <Save aria-hidden="true" />
          Save Maestro analysis
        </Button>
      </div>
      <p className="run-muted">
        Saved analysis is a separate Markdown output. Original candidates remain intact, and nothing
        is merged automatically.
      </p>
    </section>
  );
}
