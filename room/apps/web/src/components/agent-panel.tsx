import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Message, MessageContent } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import {
  agentIds,
  panelistName,
  modelPanelName,
  panelistDeliveryLabel,
  previewSnapshots,
  type AgentId,
  type Pose,
  type Reply,
} from '@/lib/agents';
import {
  deliveryMatches,
  prepareDelivery,
  type DeliveryBatch,
  type SendScope,
} from '@/lib/run-scope';
import { ReplyMarkdown } from '@/components/reply-markdown';
import type { AgentState } from '@/hooks/use-agents';
import { usePanelExpression } from '@/hooks/use-panel-expression';
import { usePanelMotion } from '@/hooks/use-panel-motion';
import type { ExpressionSnapshot } from '@/lib/panel-expression';
import type { ActivityFrame } from '@/lib/panel-motion';
import './panel-expression.css';

type Props = {
  id: AgentId;
  runId?: string;
  agents: Record<AgentId, AgentState>;
  preview: boolean;
  pose: Pose | 'lean' | undefined;
  apiError?: string;
  reconnect: () => void;
  send: (id: AgentId, text: string, requestId: string, scope: SendScope) => Promise<void>;
  stop: (id: AgentId) => Promise<void>;
  effectsEnabled: boolean;
  selected: boolean;
  developmentExpression?: ExpressionSnapshot;
  developmentActivity?: ActivityFrame;
};

function AgentReply({ reply, name, preview }: { reply: Reply; name: string; preview: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(reply.text);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <Message className="agent-message">
      <MessageContent>
        <div className="reply-meta">
          <span>{preview ? 'Preview reply' : reply.originalAuthor || name}</span>
          {!preview && reply.model && <span>{reply.model}</span>}
          {reply.addressedTo && <span>To {panelistName(reply.addressedTo)}</span>}
          {reply.fromPanelist && <span>Responding to {panelistName(reply.fromPanelist)}</span>}
          <span>
            {reply.status === 'streaming'
              ? 'Writing'
              : reply.status === 'completed'
                ? 'Reply'
                : reply.status}
          </span>
        </div>
        <Bubble variant="ghost" className="agent-bubble">
          <BubbleContent>
            <div className="reply-text">
              {reply.text ? (
                <ReplyMarkdown text={reply.text} />
              ) : reply.status === 'streaming' ? (
                'Thinking…'
              ) : reply.status === 'stopped' ? (
                'Reply stopped.'
              ) : reply.status === 'failed' ? (
                'Reply failed.'
              ) : (
                'No reply text.'
              )}
            </div>
          </BubbleContent>
        </Bubble>
        {!preview && reply.status === 'completed' && (
          <details className="reply-narration">
            <summary>Spoken summary</summary>
            {reply.narration?.status === 'ready' ? (
              <p>{reply.narration.segments.join(' ')}</p>
            ) : (
              <p>{reply.narration?.reason ?? 'No spoken summary was provided.'}</p>
            )}
          </details>
        )}
        {reply.delivery && (
          <p className="reply-delivery" data-state={reply.delivery.status}>
            {panelistDeliveryLabel(reply.delivery)}
            {reply.delivery.detail &&
              ['failed', 'cancelled', 'limited'].includes(reply.delivery.status) && (
                <span> · {reply.delivery.detail}</span>
              )}
          </p>
        )}
        <div className="reply-tools">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copy()}
            aria-label={`Copy ${name} reply`}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {copyError && <output>Copy unavailable in this browser.</output>}
        </div>
      </MessageContent>
    </Message>
  );
}

export function AgentPanel({
  id,
  runId,
  agents,
  preview,
  pose,
  apiError,
  reconnect,
  send,
  stop,
  effectsEnabled,
  selected,
  developmentExpression,
  developmentActivity,
}: Props) {
  const agent = agents[id];
  const seat = panelistName(id);
  const name = modelPanelName(agent.info?.model, id);
  const accessibleName = `${name}, seat ${seat}`;
  const provider =
    agent.info?.provider ?? (preview ? (id === 'a' ? 'codex' : 'anthropic') : undefined);
  const snapshot = preview ? previewSnapshots[id] : agent.snapshot;
  const { expression, enabled, motionEnabled } = usePanelExpression(
    developmentExpression ?? snapshot,
    effectsEnabled,
    selected,
  );
  const panel = useRef<HTMLElement>(null);
  const gesture = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === panel.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  const expressionStyle: CSSProperties = expression
    ? ({
        '--expression-duration': `${expression.duration}ms`,
        '--expression-delay': `${-expression.elapsed}ms`,
        '--expression-opacity': expression.intensity * 0.36,
        '--expression-brightness': 1 - expression.intensity * 0.12,
      } as CSSProperties)
    : {};
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<'self' | 'both'>('self');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryBatch>();
  const flight = useRef(false);
  const targets = destination === 'both' ? [...agentIds] : [id];
  const scope =
    runId && snapshot.runId === runId && snapshot.revision !== undefined
      ? { runId, revision: snapshot.revision }
      : undefined;
  const waitingTargets =
    scope && deliveryMatches(delivery, scope, draft.trim(), targets)
      ? targets.filter((target) => !delivery?.delivered.has(target))
      : targets;
  const targetAvailable = (target: AgentId) =>
    agents[target].info?.status === 'ready' &&
    agents[target].connection === 'connected' &&
    (agents[target].snapshot.status !== 'working' ||
      agents[target].snapshot.activeSource === 'panelist') &&
    !agents[target].pending;
  const available = Boolean(scope) && waitingTargets.every(targetAvailable);
  const working = !preview && (snapshot.status === 'working' || agent.pending);
  const lastReply = snapshot.messages.at(-1);
  const activity: ActivityFrame = developmentActivity ?? {
    connected: !preview && agent.connection === 'connected',
    phase: working
      ? lastReply?.status === 'streaming' && lastReply.text
        ? 'writing'
        : 'thinking'
      : 'idle',
    reply: lastReply ? { id: lastReply.id, status: lastReply.status } : null,
  };
  usePanelMotion(gesture, id, activity, expression, motionEnabled && !fullscreen);
  const actualPose =
    pose ?? (snapshot.messages.length ? snapshot.pose : id === 'a' ? 'right' : 'left');
  const status = preview
    ? 'Preview'
    : agent.connection !== 'connected'
      ? (
          {
            connecting: 'Connecting',
            reconnecting: 'Reconnecting',
            disconnected: 'Disconnected',
          } as const
        )[agent.connection]
      : agent.info?.status === 'unavailable'
        ? 'Not configured'
        : working
          ? 'Thinking'
          : snapshot.status === 'failed'
            ? 'Failed'
            : 'Ready';

  async function submit() {
    const text = draft.trim();
    if (!text || !scope || !available || preview || flight.current) return;
    flight.current = true;
    setSubmitting(true);
    setError(undefined);
    const batch = prepareDelivery(delivery, scope, text, targets, crypto.randomUUID());
    setDelivery(batch);
    const results = await Promise.allSettled(
      batch.targets
        .filter((target) => !batch.delivered.has(target))
        .map(async (target) => {
          await send(target, text, `${batch.requestId}-${target}`, batch);
          batch.delivered.add(target);
        }),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length) {
      const sent = [...batch.delivered].map((target) => (target === 'a' ? 'A' : 'B')).join(' and ');
      setDelivery({ ...batch, delivered: new Set(batch.delivered) });
      setError(
        `${sent ? `Sent to ${sent}. ` : ''}${failures.map((result) => (result.reason instanceof Error ? result.reason.message : 'Message could not be sent.')).join(' ')} Your draft is saved. Retry sends only the remaining message.`,
      );
    } else {
      setDraft((current) => (current.trim() === text ? '' : current));
      setDelivery(undefined);
    }
    flight.current = false;
    setSubmitting(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === panel.current) {
        await document.exitFullscreen();
      } else {
        await panel.current?.requestFullscreen();
      }
      setFullscreenError(false);
    } catch {
      setFullscreenError(true);
    }
  }

  async function stopTurn() {
    setStopping(true);
    setError(undefined);
    try {
      await stop(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop the reply.');
    } finally {
      setStopping(false);
    }
  }

  return (
    <section
      ref={panel}
      className={`agent-slab agent-${id}`}
      data-provider={provider}
      data-pose={actualPose}
      data-working={working || undefined}
      data-activity={enabled && activity.connected ? activity.phase : 'idle'}
      aria-label={`${accessibleName} conversation`}
    >
      <div className="panel-gesture" ref={gesture} style={expressionStyle}>
        <div className="slab-back" aria-hidden="true" />
        <div className="slab-side slab-side-right" aria-hidden="true" />
        <div className="slab-side slab-side-left" aria-hidden="true" />
        <div className="slab-edge slab-edge-top" aria-hidden="true" />
        <div className="slab-edge slab-edge-bottom" aria-hidden="true" />
        <div className="slab-face">
          <div
            className="panel-screen"
            data-expression={expression?.mood}
            data-expression-id={expression?.id}
            style={expressionStyle}
          >
            <div className="panel-screen-content">
              <header className="agent-header">
                <div className="agent-heading">
                  <h2 title={name}>{name}</h2>
                  <div className="agent-heading-actions">
                    {provider && (
                      <span className={`provider-mark provider-${provider}`} aria-hidden="true" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="panel-fullscreen"
                      onClick={() => void toggleFullscreen()}
                      aria-label={`${fullscreen ? 'Exit fullscreen for' : 'Fullscreen'} ${accessibleName}`}
                      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                      {fullscreen ? <Minimize2 /> : <Maximize2 />}
                    </Button>
                  </div>
                </div>
                <div className="agent-details">
                  <span>
                    {agent.info
                      ? `Seat ${seat} · ${agent.info.model} · ${agent.info.effort} effort`
                      : preview
                        ? `Seat ${seat} · Authored preview`
                        : `Seat ${seat} · Model information unavailable`}
                  </span>
                  {snapshot.pendingPanelistMessages > 0 && (
                    <span className="panelist-pending">
                      {snapshot.pendingPanelistMessages} panelist{' '}
                      {snapshot.pendingPanelistMessages === 1 ? 'message' : 'messages'} queued
                    </span>
                  )}
                  <span className="agent-status">
                    <i aria-hidden="true" />
                    {status}
                  </span>
                </div>
                {fullscreenError && <p role="alert">Fullscreen is unavailable in this browser.</p>}
              </header>
              <MessageScrollerProvider autoScroll>
                <MessageScroller className="agent-thread">
                  <MessageScrollerViewport aria-label={`${accessibleName} replies`}>
                    <MessageScrollerContent
                      className={`thread-content ${snapshot.messages.length ? '' : 'is-empty'}`}
                    >
                      {snapshot.messages.length ? (
                        snapshot.messages.map((reply) => (
                          <MessageScrollerItem key={reply.id} messageId={reply.id}>
                            <AgentReply reply={reply} name={seat} preview={preview} />
                          </MessageScrollerItem>
                        ))
                      ) : (
                        <MessageScrollerItem messageId={`${id}-empty`} className="empty-item">
                          <div className="agent-empty">
                            <div className="empty-title">
                              {id === 'a' ? (
                                <>
                                  A little
                                  <br />
                                  possibility.
                                </>
                              ) : (
                                <>
                                  A different
                                  <br />
                                  perspective.
                                </>
                              )}
                            </div>
                            <div className="empty-description">
                              {apiError ? (
                                <>
                                  <p>The room is offline.</p>
                                  <p>Start the API, then reconnect to reach {name}.</p>
                                </>
                              ) : agent.connection === 'connecting' ? (
                                <p>Connecting to {name}…</p>
                              ) : agent.info?.status === 'unavailable' ? (
                                <>
                                  <p>{name} is not connected yet.</p>
                                  <p>
                                    {agent.info.reason ||
                                      'Configure this agent to start a conversation.'}
                                  </p>
                                </>
                              ) : agent.connection !== 'connected' ? (
                                <>
                                  <p>Connection interrupted.</p>
                                  <p>Your replies and draft stay here while we reconnect.</p>
                                </>
                              ) : (
                                <>
                                  <p>{name} is ready when you are.</p>
                                  <p>Write below. Only agent replies appear here.</p>
                                </>
                              )}
                              {!preview && (apiError || agent.connection === 'disconnected') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={reconnect}
                                  className="inline-reconnect"
                                >
                                  Reconnect <ArrowUpRight />
                                </Button>
                              )}
                            </div>
                          </div>
                        </MessageScrollerItem>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton className="thread-jump" />
                </MessageScroller>
              </MessageScrollerProvider>
            </div>
            {expression && (
              <div
                key={expression.id}
                className={`screen-expression screen-expression-${expression.mood}`}
                aria-hidden="true"
              >
                <div className="interference-band" />
                <div className="expression-shimmer" />
              </div>
            )}
          </div>
          <footer className="agent-composer">
            {!preview && snapshot.sessionNotice && (
              <output className="session-notice">{snapshot.sessionNotice}</output>
            )}
            {(error || (!preview && (agent.error || snapshot.error))) && (
              <p className="composer-error" role="alert">
                {error || agent.error || snapshot.error}
                {!error && agent.error && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="inline-reconnect"
                    onClick={reconnect}
                  >
                    Reconnect
                  </Button>
                )}
              </p>
            )}
            {!preview &&
              !submitting &&
              delivery &&
              scope &&
              delivery.revision !== scope.revision && (
                <p className="preview-notice">
                  Models changed since this message began. Retry keeps its original configuration.
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDelivery(undefined);
                      setError(undefined);
                    }}
                  >
                    Use current models for a new message
                  </Button>
                </p>
              )}
            {preview && (
              <p className="preview-notice">
                Authored preview. Switch Preview off to talk to an agent.
              </p>
            )}
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <InputGroup className="composer-input">
                <InputGroupTextarea
                  aria-label={`Message ${accessibleName}`}
                  placeholder={preview ? 'Preview mode' : `Talk to ${name}…`}
                  value={draft}
                  disabled={preview || !runId}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
                <InputGroupAddon align="block-end" className="composer-actions">
                  <fieldset className="destination" disabled={submitting || preview}>
                    <legend className="sr-only">Send destination for {accessibleName}</legend>
                    <label>
                      <input
                        type="radio"
                        aria-label={accessibleName}
                        name={`${id}-destination`}
                        checked={destination === 'self'}
                        onChange={() => setDestination('self')}
                      />
                      <span>{name}</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`${id}-destination`}
                        checked={destination === 'both'}
                        onChange={() => setDestination('both')}
                      />
                      <span>Both</span>
                    </label>
                  </fieldset>
                  {working && (
                    <InputGroupButton
                      className="send-button stop-button"
                      onClick={() => void stopTurn()}
                      disabled={stopping}
                      aria-label={`Stop ${accessibleName} reply`}
                    >
                      <Square />
                      {stopping ? 'Stopping' : 'Stop'}
                    </InputGroupButton>
                  )}
                  {(!working || snapshot.activeSource === 'panelist') && (
                    <InputGroupButton
                      className="send-button"
                      type="submit"
                      disabled={!draft.trim() || !available || preview || submitting}
                      aria-label={`Send to ${destination === 'both' ? `both agents from seat ${seat}` : accessibleName}`}
                    >
                      {submitting ? <LoaderCircle className="spin" /> : <ArrowUpRight />}
                      <span>{error && delivery ? 'Retry' : 'Send'}</span>
                    </InputGroupButton>
                  )}
                </InputGroupAddon>
              </InputGroup>
            </form>
            <div className="composer-caption">
              <span>
                {waitingTargets.some(
                  (target) => agents[target].snapshot.activeSource === 'panelist',
                )
                  ? 'Send stops the panelist exchange and gives your message priority.'
                  : destination === 'both'
                    ? 'One message. Two independent replies.'
                    : 'Your prompt goes to the selected agent.'}
              </span>
              <span>↵ send</span>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}
