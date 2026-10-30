import type { AgentId } from './agents.ts';

export type Speaker = AgentId;
export type Narration =
  | { status: 'ready'; revision: string; segments: string[] }
  | { status: 'unavailable'; reason: string };
export type SpeechReply = {
  id: string;
  text: string;
  status: string;
  speechSummary?: string;
  narration?: Narration;
};

export type SpeechSegment = {
  agent: Speaker;
  text: string;
  requestId: string;
  test?: boolean;
  replyId?: string;
  revision?: string;
  segment?: number;
  runId?: string;
};

export class SpeechInterruptions {
  private previous: Record<Speaker, Map<string, string>> = {
    a: new Map(),
    b: new Map(),
  };
  clear() {
    this.previous.a.clear();
    this.previous.b.clear();
  }
  observe(agent: Speaker, replies: SpeechReply[]) {
    const previous = this.previous[agent];
    const previousReplyIds = new Set(previous.keys());
    let interrupted = false;
    for (const reply of replies) {
      if (
        previous.get(reply.id) === 'streaming' &&
        (reply.status === 'stopped' || reply.status === 'failed')
      )
        interrupted = true;
      previous.set(reply.id, reply.status);
    }
    return { interrupted, previousReplyIds };
  }
}

export class SpeechTracker {
  private seen = new Map<string, { text: string; blocked: boolean }>();
  private notice?: string;
  takeNotice() {
    const notice = this.notice;
    this.notice = undefined;
    return notice;
  }
  baseline(agent: Speaker, replies: SpeechReply[]) {
    for (const reply of replies)
      this.seen.set(`${agent}:${reply.id}`, { text: reply.text, blocked: true });
  }
  collect(agent: Speaker, replies: SpeechReply[]): SpeechSegment[] {
    const segments: SpeechSegment[] = [];
    for (const reply of replies) {
      const key = `${agent}:${reply.id}`;
      const state = this.seen.get(key) ?? { text: '', blocked: false };
      this.seen.set(key, state);
      if (state.blocked) continue;
      if (!reply.text.startsWith(state.text) || ['stopped', 'failed'].includes(reply.status)) {
        state.blocked = true;
        continue;
      }
      state.text = reply.text;
      if (reply.status !== 'completed') continue;
      state.blocked = true;
      if (!reply.narration || reply.narration.status !== 'ready') {
        this.notice = `Agent ${agent.toUpperCase()}: ${reply.narration?.reason ?? 'No spoken summary was provided.'} Reply was not spoken.`;
        continue;
      }
      const narration = reply.narration;
      narration.segments.forEach((text, segment) =>
        segments.push({
          agent,
          text,
          requestId: crypto.randomUUID(),
          replyId: reply.id,
          revision: narration.revision,
          segment,
        }),
      );
    }
    return segments;
  }
}

export class SpeechQueue {
  private queue: SpeechSegment[] = [];
  private controller?: AbortController;
  private sources = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private running = false;
  private nextTime = 0;
  private readonly context: AudioContext;
  private readonly state: (text: string, busy: boolean) => void;
  private readonly error: (text: string) => void;
  constructor(state: (text: string, busy: boolean) => void, error: (text: string) => void) {
    this.state = state;
    this.error = error;
    this.context = new AudioContext();
  }
  get isBusy() {
    return this.running || this.queue.length > 0;
  }
  async resume() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Audio playback did not unlock. Enable speech again.')),
            5000,
          );
        }),
      ]);
      if (this.context.state !== 'running')
        throw new Error('Audio playback is suspended. Enable speech again.');
    } finally {
      clearTimeout(timer);
    }
  }
  enqueue(segments: SpeechSegment[]) {
    if (this.queue.length + segments.length > 256)
      throw new Error('Speech backlog is full. Stop audio and enable speech again when ready.');
    this.queue.push(...segments);
    void this.pump();
  }
  stop() {
    this.generation++;
    this.queue = [];
    this.controller?.abort();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }
  close() {
    this.stop();
    void this.context.close();
  }
  private async pump() {
    if (this.running || !this.queue.length) return;
    this.running = true;
    const generation = this.generation;
    let completedTest = false,
      chunks = 0;
    try {
      while (this.queue.length && generation === this.generation) {
        const segment = this.queue.shift()!;
        this.state(`Speaking ${segment.agent === 'a' ? 'A' : 'B'}`, true);
        if (this.context.state !== 'running')
          throw new Error('Audio playback was suspended. Enable speech again.');
        this.controller = new AbortController();
        const deadline = setTimeout(() => {
          if (generation !== this.generation) return;
          this.stop();
          this.error('Speech timed out after 45 seconds. Audio and queued speech were stopped.');
        }, 45_000);
        try {
          const response = await fetch('/api/speech/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent: segment.agent,
              kind: segment.test ? 'test' : 'reply',
              ...(segment.test
                ? {}
                : {
                    runId: segment.runId,
                    replyId: segment.replyId,
                    revision: segment.revision,
                    segment: segment.segment,
                  }),
              requestId: segment.requestId,
            }),
            signal: this.controller.signal,
          });
          if (!response.ok || !response.body)
            throw new Error('Cartesia speech is unavailable. Check the server speech status.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = '',
            done = false,
            bytes = 0;
          const playback: Promise<void>[] = [];
          const consume = (line: string) => {
            if (!line.trim() || generation !== this.generation) return;
            const event: unknown = JSON.parse(line);
            if (!event || typeof event !== 'object' || !('type' in event))
              throw new Error('Unreadable speech event.');
            if (event.type === 'done') {
              done = true;
              return;
            }
            if (event.type === 'error')
              throw new Error(
                'Cartesia could not synthesize this phrase. Speech has been stopped.',
              );
            if (
              event.type !== 'audio' ||
              !('audio' in event) ||
              typeof event.audio !== 'string' ||
              !('sampleRate' in event) ||
              event.sampleRate !== 44100
            )
              throw new Error('Unsupported speech audio format.');
            if (this.context.state !== 'running')
              throw new Error('Audio playback was suspended. Enable speech again.');
            const binary = atob(event.audio);
            bytes += binary.length;
            if (bytes > 12_000_000 || binary.length % 4)
              throw new Error('Speech audio exceeded the supported size or format.');
            const data = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            const view = new DataView(data.buffer);
            const buffer = this.context.createBuffer(1, data.length / 4, 44100);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < channel.length; i++) channel[i] = view.getFloat32(i * 4, true);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.context.destination);
            this.sources.add(source);
            chunks++;
            playback.push(
              new Promise((resolve) => {
                source.addEventListener(
                  'ended',
                  () => {
                    source.disconnect();
                    this.sources.delete(source);
                    resolve();
                  },
                  { once: true },
                );
              }),
            );
            const when = Math.max(this.context.currentTime + 0.025, this.nextTime);
            source.start(when);
            this.nextTime = when + buffer.duration;
          };
          try {
            for (;;) {
              const chunk = await reader.read();
              if (generation !== this.generation) return;
              pending += decoder.decode(chunk.value, { stream: !chunk.done });
              if (pending.length > 2_000_000)
                throw new Error('Speech event exceeded the supported size.');
              let newline: number;
              while ((newline = pending.indexOf('\n')) !== -1) {
                consume(pending.slice(0, newline));
                pending = pending.slice(newline + 1);
              }
              if (chunk.done) break;
            }
            if (pending.trim()) consume(pending);
            if (!done || !playback.length)
              throw new Error(
                'Speech disconnected or returned no audio. Enable speech again to retry new replies.',
              );
            await Promise.all(playback);
            completedTest = Boolean(segment.test);
          } finally {
            await reader.cancel().catch(() => {});
          }
        } finally {
          clearTimeout(deadline);
        }
      }
      if (generation === this.generation)
        this.state(
          completedTest
            ? `Voice test complete · ${chunks} audio chunks played`
            : 'Waiting for new replies',
          false,
        );
    } catch (cause) {
      if (generation === this.generation) {
        this.stop();
        this.error(cause instanceof Error ? cause.message : 'Speech failed.');
      }
    } finally {
      this.running = false;
      if (this.queue.length) void this.pump();
    }
  }
}
