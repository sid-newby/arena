import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { ArrowUp, MessageSquare, RefreshCw, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ReplyMarkdown } from '@/components/reply-markdown';
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from '@/components/ui/message-scroller';
import { useMaestro } from '@/hooks/use-maestro';
import { useRunSetup } from '@/hooks/use-run-setup';
import type { MaestroMessage } from '@/lib/maestro';
import './maestro-dialog.css';

function FeedbackMessage({
  message,
  active,
  update,
}: {
  message: MaestroMessage;
  active: boolean;
  update: (turnId: string, action: 'read' | 'resolve') => Promise<void>;
}) {
  const ref = useRef<HTMLElement>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const turnId = message.turnId;
  const unread = message.feedback && !message.feedback.read && message.status === 'completed';
  useEffect(() => {
    const node = ref.current;
    if (
      !active ||
      !unread ||
      !turnId ||
      !node ||
      error ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver((entries) => {
      if (!document.hidden && entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void update(turnId, 'read').catch(() => setError('Could not mark feedback as read.'));
      }
    });
    observer.observe(node);
    const onVisibility = () => {
      if (!document.hidden) {
        observer.unobserve(node);
        observer.observe(node);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, unread, turnId, update, error]);

  async function act(action: 'read' | 'resolve') {
    if (!turnId || pending) return;
    setPending(true);
    setError('');
    try {
      await update(turnId, action);
    } catch {
      setError('Could not update feedback. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <article ref={ref} className="maestro-message" data-author={message.role}>
      <header>
        <span>{message.role === 'user' ? 'You' : 'Maestro'}</span>
        {message.role === 'assistant' && message.throughSeq !== undefined && (
          <span>Through update #{message.throughSeq}</span>
        )}
        {(message.status === 'stopped' || message.status === 'failed') && (
          <span>{message.status === 'stopped' ? 'Stopped' : 'Failed'}</span>
        )}
        {message.feedback?.question === 'unresolved' && <span>Question needs an answer</span>}
      </header>
      {message.role === 'assistant' && message.text ? (
        <ReplyMarkdown text={message.text} />
      ) : (
        <p>
          {message.text ||
            (message.status === 'streaming'
              ? 'Thinking…'
              : message.status === 'stopped'
                ? 'Response stopped.'
                : message.status === 'failed'
                  ? 'Response failed.'
                  : 'No response text.')}
        </p>
      )}
      {message.feedback?.question === 'unresolved' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void act('resolve')}
        >
          Mark question resolved
        </Button>
      )}
      {error && (
        <p className="maestro-error" role="alert">
          {error}{' '}
          {unread && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void act('read')}
            >
              Retry
            </Button>
          )}
        </p>
      )}
    </article>
  );
}

export function MaestroDialog({ runId, disabled = false }: { runId?: string; disabled?: boolean }) {
  const maestro = useMaestro(runId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('run');
  const [delivery, setDelivery] = useState<{ runId: string; failed: number }>();
  const [retryingDelivery, setRetryingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const fieldId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();
  const errorId = useId();
  const snapshot = maestro.snapshot;
  const unread = snapshot?.messages.some(
    (message) => message.feedback && !message.feedback.read && message.status === 'completed',
  );
  const unresolved = snapshot?.messages.some(
    (message) => message.feedback?.question === 'unresolved',
  );
  const failedDelivery = delivery && delivery.runId === maestro.runId ? delivery.failed : 0;
  useEffect(() => {
    if (!maestro.runId) return;
    const id = maestro.runId;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(id)}/feedback-delivery`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (
          !controller.signal.aborted &&
          body &&
          typeof body === 'object' &&
          'failed' in body &&
          typeof body.failed === 'number' &&
          Number.isSafeInteger(body.failed) &&
          body.failed >= 0
        )
          setDelivery({ runId: id, failed: body.failed });
      } catch {
        // The normal connection indicator reports connection failures.
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [maestro.runId]);
  async function retryDelivery() {
    const id = maestro.runId;
    if (!id || retryingDelivery) return;
    setRetryingDelivery(true);
    setDeliveryError('');
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}/feedback-delivery/retry`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Retry failed');
      setDelivery({ runId: id, failed: 0 });
    } catch {
      setDeliveryError('Could not retry Maestro feedback. Try again.');
    } finally {
      setRetryingDelivery(false);
    }
  }
  const updateFeedback = useCallback(
    async (turnId: string, action: 'read' | 'resolve') => {
      if (!maestro.runId) throw new Error('No active run.');
      const response = await fetch(
        `/api/runs/${encodeURIComponent(maestro.runId)}/maestro/feedback/${encodeURIComponent(turnId)}/${action}`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Could not update feedback.');
    },
    [maestro.runId],
  );
  const working = maestro.pending || snapshot?.status === 'working';
  const error = maestro.error || snapshot?.error;
  const connected = maestro.connection === 'connected';
  const canSend =
    !disabled &&
    connected &&
    snapshot?.available &&
    !working &&
    !maestro.stopping &&
    Boolean(maestro.draft.trim());
  const status =
    maestro.connection === 'connecting'
      ? 'Connecting'
      : maestro.connection === 'reconnecting'
        ? 'Reconnecting'
        : maestro.connection === 'disconnected'
          ? 'Disconnected'
          : !snapshot?.available
            ? 'Unavailable'
            : working
              ? 'Working'
              : 'Ready';
  const through = snapshot?.analysisThroughSeq;
  const newer = through !== undefined && snapshot !== undefined && snapshot.latestSeq > through;

  const completedAnalysis = snapshot?.messages.findLast(
    (message) =>
      message.role === 'assistant' &&
      message.status === 'completed' &&
      Boolean(message.text.trim()),
  );
  const runSetup = useRunSetup({
    runId: maestro.runId,
    active: open && tab === 'run',
    synthesisTurnId: completedAnalysis?.turnId,
    canSaveAnalysis: Boolean(completedAnalysis),
    onDraftQuestion: (text) => {
      maestro.setDraft(text);
      setTab('chat');
      requestAnimationFrame(() => input.current?.focus());
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="maestro-trigger"
          data-unread={unread || Boolean(failedDelivery) || undefined}
          aria-label={`Maestro${unread ? ', unread feedback' : ''}${unresolved ? ', unresolved question' : ''}${failedDelivery ? ', feedback delivery failed' : ''}`}
          disabled={disabled}
        >
          <MessageSquare aria-hidden="true" />
          Maestro
          {working && <span className="maestro-trigger-working" aria-label="Working" />}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="theme-overlay maestro-overlay" />
        <Dialog.Content
          className="maestro-dialog"
          onOpenAutoFocus={(event) => {
            if (tab === 'chat' && input.current && !input.current.disabled) {
              event.preventDefault();
              input.current.focus();
            }
          }}
        >
          <div className="maestro-heading">
            <div>
              <Dialog.Title>Maestro</Dialog.Title>
              <p className="maestro-model">
                {snapshot
                  ? `${snapshot.model} · ${snapshot.effort} effort`
                  : 'gpt-6.1-sol · high effort'}
              </p>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close Maestro"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="maestro-description">
            {runSetup.description}
          </Dialog.Description>
          <div className="maestro-state">
            {failedDelivery > 0 && (
              <div role="alert">
                Maestro could not deliver{' '}
                {failedDelivery === 1 ? 'an observation' : `${failedDelivery} observations`} after
                several attempts.
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={retryingDelivery}
                  onClick={() => void retryDelivery()}
                >
                  Retry feedback
                </Button>
                {deliveryError && <span>{deliveryError}</span>}
              </div>
            )}
            <output
              aria-live="polite"
              className="maestro-connection"
              data-connected={connected || undefined}
            >
              <i aria-hidden="true" />
              Maestro {status.toLowerCase()}
            </output>
            {through !== undefined && <span>Analysis through update #{through}</span>}
            {newer && <span className="maestro-newer">New correspondence available</span>}
            {(maestro.connection === 'disconnected' || maestro.connection === 'reconnecting') && (
              <Button variant="ghost" size="sm" onClick={maestro.reconnect}>
                <RefreshCw aria-hidden="true" />
                Reconnect
              </Button>
            )}
          </div>
          <Tabs.Root value={tab} onValueChange={setTab} className="maestro-tabs">
            <Tabs.List aria-label="Maestro workspace" className="maestro-tab-list">
              <Tabs.Trigger value="chat">
                Private chat{unread && <span className="sr-only">, unread feedback</span>}
              </Tabs.Trigger>
              <Tabs.Trigger value="run">Run and outputs</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="chat" forceMount className="maestro-tab-panel">
              <MessageScrollerProvider autoScroll>
                <MessageScroller className="maestro-thread">
                  <MessageScrollerViewport aria-label="Private Maestro conversation">
                    <MessageScrollerContent
                      className="maestro-messages"
                      role="log"
                      aria-live="polite"
                      aria-relevant="additions text"
                    >
                      {snapshot?.messages.length ? (
                        snapshot.messages.map((message) => (
                          <MessageScrollerItem messageId={message.id} key={message.id}>
                            <FeedbackMessage
                              message={message}
                              active={open && tab === 'chat'}
                              update={updateFeedback}
                            />
                          </MessageScrollerItem>
                        ))
                      ) : (
                        <MessageScrollerItem messageId="maestro-empty">
                          <div className="maestro-empty">
                            <h3>A little distance. A clearer view.</h3>
                            <p>
                              {snapshot && !snapshot.available
                                ? snapshot.reason ||
                                  'Maestro is unavailable. Check the configured model and sign-in.'
                                : 'Ask what the two perspectives agree on, where the evidence differs, or what to try next.'}
                            </p>
                          </div>
                        </MessageScrollerItem>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton className="maestro-jump" />
                </MessageScroller>
              </MessageScrollerProvider>
              <footer className="maestro-composer">
                {error && (
                  <p id={errorId} className="maestro-error" role="alert">
                    {error}
                  </p>
                )}
                {snapshot && !snapshot.available && snapshot.messages.length > 0 && (
                  <p className="maestro-error">{snapshot.reason || 'Maestro is unavailable.'}</p>
                )}
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canSend) void maestro.send();
                  }}
                >
                  <label className="sr-only" htmlFor={fieldId}>
                    Message Maestro privately
                  </label>
                  <Textarea
                    className="resize-none"
                    id={fieldId}
                    ref={input}
                    disabled={!maestro.runId}
                    value={maestro.draft}
                    maxLength={16000}
                    rows={3}
                    placeholder="Ask Maestro about the work…"
                    aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
                    onChange={(event) => maestro.setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (canSend) event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="maestro-actions">
                    <p id={helpId}>
                      Only you and Maestro see this chat. Enter sends; Shift+Enter adds a line.
                    </p>
                    {working && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={maestro.stopping || !maestro.canStop}
                        aria-busy={maestro.stopping}
                        onClick={() => void maestro.stop()}
                      >
                        <Square aria-hidden="true" />
                        {maestro.stopping ? 'Stopping…' : 'Stop response'}
                      </Button>
                    )}
                    <Button type="submit" size="sm" disabled={!canSend} aria-busy={maestro.pending}>
                      <ArrowUp aria-hidden="true" />
                      Send
                    </Button>
                  </div>
                </form>
              </footer>
            </Tabs.Content>
            <Tabs.Content value="run" forceMount className="maestro-tab-panel">
              {runSetup.content}
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
