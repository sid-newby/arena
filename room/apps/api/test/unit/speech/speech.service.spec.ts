import {
  SpeechService,
  SPEECH_VOICES,
  type SpeechContext,
  type SpeechEvent,
  type SpeechSocket,
} from '../../../src/speech/speech.service.js';

type ProviderEvent = { type: string; audio?: Uint8Array };
class FakeContext implements SpeechContext {
  readonly inputs: unknown[] = [];
  cancelled = false;
  private queue: ProviderEvent[] = [];
  private wake?: () => void;
  constructor(
    readonly contextId: string,
    readonly voice: string,
  ) {}
  push(input: unknown) {
    this.inputs.push(input);
    return Promise.resolve();
  }
  no_more_inputs() {
    return Promise.resolve();
  }
  add(event: ProviderEvent) {
    if (!this.cancelled) this.queue.push(event);
    this.wake?.();
  }
  async *receive() {
    while (!this.cancelled) {
      const event = this.queue.shift();
      if (event) {
        yield event;
        if (event.type === 'done' || event.type === 'error') return;
      } else
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
    }
  }
  cancel() {
    this.cancelled = true;
    this.queue = [];
    this.wake?.();
    return Promise.resolve();
  }
}
class FakeSocket implements SpeechSocket {
  readonly contexts: FakeContext[] = [];
  closed = false;
  context(options: Parameters<SpeechSocket['context']>[0]) {
    const context = new FakeContext(options.contextId, options.voice);
    this.contexts.push(context);
    return context;
  }
  close() {
    this.closed = true;
    this.contexts.forEach((context) => void context.cancel());
  }
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const request = (agent: 'a' | 'b', id: string) => ({
  agent,
  kind: 'test',
  requestId: id,
});

describe('Cartesia speech boundary', () => {
  let socket: FakeSocket;
  let service: SpeechService;
  beforeEach(() => {
    socket = new FakeSocket();
    service = SpeechService.forTest(async () => socket);
  });
  afterEach(() => service.onModuleDestroy());

  it('rejects caller text including attempts to override the fixed voice test', () => {
    expect(() =>
      service.prepare({ ...request('a', 'source-code'), text: 'print("hello")' }),
    ).toThrow(/saved narration reference/);
    expect(() =>
      service.prepare({ ...request('a', 'extra-field'), transcript: 'Caller phrase' }),
    ).toThrow(/fixed server phrase/);
    expect(socket.contexts).toHaveLength(0);
  });

  it('sends only the resolved saved segment to Cartesia', async () => {
    const reference = {
      agent: 'a' as const,
      runId: 'run',
      replyId: 'reply',
      revision: 'revision',
      segment: 0,
    };
    const resolve = vi.fn<() => string>(
      () => 'Migration is required before enabling this feature.',
    );
    const input = service.prepare(
      { ...reference, kind: 'reply', requestId: 'saved-reply' },
      resolve,
    );
    expect(resolve).toHaveBeenCalledWith(reference);
    const done = service.stream(input, new AbortController().signal, () => {});
    await settle();
    expect(socket.contexts[0].inputs).toEqual([
      {
        transcript: 'Migration is required before enabling this feature.',
        generation_config: { speed: 1, volume: 1, emotion: 'neutral' },
      },
    ]);
    socket.contexts[0].add({ type: 'done' });
    await done;
  });

  it('isolates interleaved Luna and Opus audio on one shared connection', async () => {
    const open = vi.fn<() => Promise<FakeSocket>>(async () => socket);
    service = SpeechService.forTest(open);
    const luna: SpeechEvent[] = [];
    const opus: SpeechEvent[] = [];
    const a = service.stream(
      service.prepare(request('a', 'request-luna')),
      new AbortController().signal,
      (event) => luna.push(event),
    );
    const b = service.stream(
      service.prepare(request('b', 'request-opus')),
      new AbortController().signal,
      (event) => opus.push(event),
    );
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(socket.contexts.map((context) => context.voice)).toEqual([
      SPEECH_VOICES.a,
      SPEECH_VOICES.b,
    ]);
    socket.contexts[1].add({ type: 'chunk', audio: Uint8Array.of(9, 8, 7, 6) });
    socket.contexts[0].add({ type: 'chunk', audio: Uint8Array.of(1, 2, 3, 4) });
    socket.contexts[1].add({ type: 'done' });
    socket.contexts[0].add({ type: 'done' });
    await Promise.all([a, b]);
    expect(luna).toEqual([
      {
        type: 'audio',
        audio: 'AQIDBA==',
        sampleRate: 44100,
        contextId: socket.contexts[0].contextId,
      },
      { type: 'done' },
    ]);
    expect(opus).toEqual([
      {
        type: 'audio',
        audio: 'CQgHBg==',
        sampleRate: 44100,
        contextId: socket.contexts[1].contextId,
      },
      { type: 'done' },
    ]);
  });

  it('cancels only the aborted context and drops its late/queued audio', async () => {
    const abort = new AbortController();
    const luna: SpeechEvent[] = [];
    const opus: SpeechEvent[] = [];
    const a = service.stream(service.prepare(request('a', 'cancel-luna')), abort.signal, (event) =>
      luna.push(event),
    );
    const b = service.stream(
      service.prepare(request('b', 'continue-opus')),
      new AbortController().signal,
      (event) => opus.push(event),
    );
    await settle();
    socket.contexts[0].add({ type: 'chunk', audio: Uint8Array.of(1, 2, 3, 4) });
    abort.abort();
    socket.contexts[0].add({ type: 'chunk', audio: Uint8Array.of(5, 6, 7, 8) });
    socket.contexts[1].add({ type: 'chunk', audio: Uint8Array.of(9, 8, 7, 6) });
    socket.contexts[1].add({ type: 'done' });
    await Promise.all([a, b]);
    expect(luna).toEqual([]);
    expect(socket.contexts[0].cancelled).toBe(true);
    expect(socket.closed).toBe(false);
    expect(opus.at(-1)).toEqual({ type: 'done' });
  });

  it('rejects duplicate synthesis and oversized input before opening a provider connection', () => {
    service.prepare(request('a', 'duplicate-request'));
    expect(() => service.prepare(request('a', 'duplicate-request'))).toThrow(/already requested/);
    expect(() =>
      service.prepare({ ...request('a', 'oversize-request'), text: 'a'.repeat(2001) }),
    ).toThrow(/saved narration reference/);
    expect(socket.contexts).toHaveLength(0);
  });

  it('validates optional generation settings and defaults to neutral without inference', async () => {
    expect(() =>
      service.prepare({ ...request('a', 'invalid-speed'), generation_config: { speed: 4 } }),
    ).toThrow(/speed/);
    expect(() =>
      service.prepare({
        ...request('a', 'invalid-emotion'),
        generation_config: { emotion: 'invented' },
      }),
    ).toThrow(/emotion/);
    const plain = service.prepare(request('a', 'plain-request'));
    expect(plain.generation_config).toEqual({ speed: 1, volume: 1, emotion: 'neutral' });
    const input = service.prepare({
      ...request('b', 'configured-request'),
      generation_config: { speed: 0.8, volume: 1.2, emotion: 'calm' },
    });
    const done = service.stream(input, new AbortController().signal, () => {});
    await settle();
    expect(socket.contexts[0].inputs).toEqual([
      {
        transcript: 'Hello, this is B speaking.',
        generation_config: { speed: 0.8, volume: 1.2, emotion: 'calm' },
      },
    ]);
    socket.contexts[0].add({ type: 'done' });
    await done;
  });

  it('keeps credentials and provider diagnostics out of status/errors', async () => {
    service = SpeechService.forTest(async () => {
      throw new Error('secret-provider-detail');
    });
    expect(JSON.stringify(service.status())).not.toContain('offline-test-key');
    const events: SpeechEvent[] = [];
    await service.stream(
      service.prepare(request('a', 'failed-request')),
      new AbortController().signal,
      (event) => events.push(event),
    );
    expect(events).toEqual([
      {
        type: 'error',
        message: 'Cartesia speech failed. Check voice access, server credentials and connection.',
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret-provider-detail');
  });
});
