import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/agents';

type MemoryQuote = {
  author: string;
  createdAt: string;
  quote: string;
  messageId: string;
  truncated: boolean;
};

function readQuotes(value: unknown): MemoryQuote[] {
  if (!value || typeof value !== 'object' || !('records' in value) || !Array.isArray(value.records))
    throw new Error('The room returned an unreadable memory result.');
  return value.records.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('author' in item) ||
      typeof item.author !== 'string' ||
      !('createdAt' in item) ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      !('quote' in item) ||
      typeof item.quote !== 'string' ||
      !('messageId' in item) ||
      typeof item.messageId !== 'string'
    )
      throw new Error('The room returned an unreadable memory result.');
    return {
      author: item.author,
      createdAt: item.createdAt,
      quote: item.quote,
      messageId: item.messageId,
      truncated: 'truncated' in item && item.truncated === true,
    };
  });
}

function MemorySearch() {
  const [conversation, setConversation] = useState('room');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [records, setRecords] = useState<MemoryQuote[]>();
  const [error, setError] = useState('');
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  function reset() {
    request.current?.abort();
    setPending(false);
    setRecords(undefined);
    setError('');
  }
  async function search() {
    const text = query.trim();
    if (!text || pending) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setRecords(undefined);
    setError('');
    try {
      const found = await api('/api/runs/hangout/memory/search', readQuotes, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, conversation }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setRecords(found);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not search room memory.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <>
      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label className="theme-search">
          Conversation
          <select
            value={conversation}
            onChange={(event) => {
              reset();
              setConversation(event.target.value);
            }}
          >
            <option value="room">Everyone</option>
            <option value="a">Sid + Astra</option>
            <option value="b">Sid + Fable</option>
          </select>
        </label>
        <label className="theme-search">
          What do you remember?
          <input
            value={query}
            maxLength={500}
            placeholder="What did we decide about…"
            onChange={(event) => {
              reset();
              setQuery(event.target.value);
            }}
          />
        </label>
        <Button type="submit" variant="outline" disabled={pending || !query.trim()}>
          {pending ? 'Searching…' : 'Search memory'}
        </Button>
      </form>
      <div aria-live="polite" aria-busy={pending} className="mt-5">
        {error && <p role="alert">{error}</p>}
        {records?.length === 0 && <p>No matching messages in this conversation.</p>}
        {records && records.length > 0 && (
          <ol className="grid gap-4">
            {records.map((item) => (
              <li key={item.messageId} className="border-t border-border pt-3">
                <p>
                  <strong className="capitalize">{item.author}</strong>
                  {' · '}
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                </p>
                <blockquote className="mt-2 whitespace-pre-wrap wrap-anywhere">
                  {item.quote}
                  {item.truncated && '…'}
                </blockquote>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

export function HangoutMemory() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm">
          Memory
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="theme-overlay" />
        <Dialog.Content className="theme-drawer">
          <div className="theme-heading">
            <Dialog.Title>Room memory</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close memory">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="theme-description">
            Find earlier messages by meaning. Choose which conversation to search.
          </Dialog.Description>
          <MemorySearch />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
