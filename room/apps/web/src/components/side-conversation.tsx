import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, MessageSquare, Square, X } from 'lucide-react';
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
import { useSideConversation } from '@/hooks/use-side-conversation';
import type { AgentId } from '@/lib/agents';
import type { SideConversationSnapshot } from '@/lib/messaging';
import './side-conversation.css';

export function SideConversation({
  runId,
  seat,
  name,
  hangout,
  away,
  snapshot,
  connection,
  disabled,
  error,
  transfer,
  reconnect,
}: {
  runId?: string;
  seat: AgentId;
  name: string;
  hangout: boolean;
  away: boolean;
  snapshot?: SideConversationSnapshot;
  connection: string;
  disabled: boolean;
  error?: string;
  transfer: (text: string) => void;
  reconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const side = useSideConversation(runId, seat, snapshot);
  const input = useRef<HTMLTextAreaElement>(null);
  const working =
    snapshot?.status === 'working' ||
    snapshot?.messages.some((message) => message.status === 'queued');
  const available = !disabled && !away && Boolean(runId && snapshot) && connection === 'connected';
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || !runId}
          aria-label={hangout ? `Whisper to ${name}` : `Side conversation with ${name}`}
        >
          <MessageSquare />
          {hangout ? `Whisper to ${name}` : 'Side conversation'}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="theme-overlay" />
        <Dialog.Content
          className="side-dialog"
          onOpenAutoFocus={(event) => {
            if (input.current && !input.current.disabled) {
              event.preventDefault();
              input.current.focus();
            }
          }}
        >
          <header className="side-heading">
            <div>
              <Dialog.Title>
                {hangout ? `Sid + ${name}` : `Side conversation · ${name}`}
              </Dialog.Title>
              <Dialog.Description>
                {hangout
                  ? `Only you and ${name} share these whispers. The room won’t play them aloud.`
                  : 'Private to this seat. The main task keeps running. Side replies do not edit files or become task outputs.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Close side conversation">
                <X />
              </Button>
            </Dialog.Close>
          </header>
          <output className="side-state">
            {connection !== 'connected' || !snapshot
              ? 'Waiting for connection'
              : away
                ? `${name} is away. Invite them back to send a whisper.`
                : working
                  ? 'Working · another message will queue'
                  : 'Ready'}
          </output>
          {(connection !== 'connected' || !snapshot || error) && (
            <Button type="button" variant="ghost" size="sm" onClick={reconnect}>
              Reconnect side conversation
            </Button>
          )}
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="side-thread">
              <MessageScrollerViewport aria-label={`${name} side conversation replies`}>
                <MessageScrollerContent
                  className="side-messages"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                >
                  {!snapshot?.messages.length && (
                    <p className="side-empty">
                      {hangout
                        ? `Start a whisper with ${name}.`
                        : 'Ask a separate question without interrupting the main task.'}
                    </p>
                  )}
                  {snapshot?.messages.map((message) => (
                    <MessageScrollerItem key={message.id} messageId={message.id}>
                      <article className="side-message">
                        <p className="side-prompt">
                          <span>{hangout ? 'Sid' : 'You'}</span>
                          {message.prompt}
                        </p>
                        <div className="side-reply">
                          <span>
                            {name} · {message.status === 'streaming' ? 'Writing' : message.status}
                          </span>
                          {message.text ? (
                            <ReplyMarkdown text={message.text} />
                          ) : (
                            <p>
                              {message.status === 'queued'
                                ? 'Waiting for the previous side reply.'
                                : message.status === 'streaming'
                                  ? 'Thinking…'
                                  : 'No reply text.'}
                            </p>
                          )}
                          {message.error && (
                            <p role="alert" className="side-error">
                              {message.error}
                            </p>
                          )}
                          {message.status === 'completed' && message.text && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={disabled}
                              onClick={() => {
                                transfer(message.text);
                                setOpen(false);
                              }}
                            >
                              {hangout ? 'Copy to room draft' : 'Use in main draft'}
                            </Button>
                          )}
                        </div>
                      </article>
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="Scroll to latest side reply" />
            </MessageScroller>
          </MessageScrollerProvider>
          <form
            className="side-composer"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (available) void side.send();
            }}
          >
            {(side.error || error || snapshot?.error) && (
              <p id={`side-error-${seat}`} role="alert" className="side-error">
                {side.error || error || snapshot?.error}
              </p>
            )}
            <label htmlFor={`side-draft-${seat}`} className="sr-only">
              Side message to {name}
            </label>
            <Textarea
              className="resize-none"
              id={`side-draft-${seat}`}
              ref={input}
              value={side.draft}
              onChange={(event) => side.setDraft(event.target.value)}
              disabled={!available}
              maxLength={16000}
              aria-describedby={
                side.error || error || snapshot?.error ? `side-error-${seat}` : undefined
              }
              placeholder={hangout ? `Whisper to ${name}…` : 'Ask this seat privately…'}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  if (available) void side.send();
                }
              }}
            />
            <div className="side-actions">
              <span>
                {hangout
                  ? 'This message stays in your one-on-one conversation.'
                  : 'Only an explicit main send changes the task.'}
              </span>
              {working && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={side.stopping}
                  onClick={() => void side.stop()}
                >
                  <Square />
                  {side.stopping ? 'Stopping…' : 'Stop side conversation'}
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={!available || side.pending || !side.draft.trim()}
              >
                <ArrowUpRight />
                {side.pending
                  ? 'Saving…'
                  : working
                    ? 'Queue side message'
                    : hangout
                      ? 'Send whisper'
                      : 'Send side message'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
