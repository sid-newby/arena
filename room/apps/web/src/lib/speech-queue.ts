import { resumeAudio } from './resume-audio.ts';
import type { AgentId } from './agents.ts';

export type Speaker = AgentId;
export type Narration =
  | { status: 'ready'; revision: string; segments: string[] }
  | { status: 'quiet' }
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
  baseline(agent: Speaker, replies: SpeechReply[], mode: 'all' | 'completed' = 'all') {
    for (const reply of replies) {
      if (mode === 'completed' && reply.status === 'streaming') continue;
      this.seen.set(`${agent}:${reply.id}`, { text: reply.text, blocked: true });
    }
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
      if (reply.narration?.status === 'quiet') continue;
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

const SPEAKERS: Speaker[] = ['a', 'b'];
const label = (agent: Speaker) => (agent === 'a' ? 'A' : 'B');

/**
 * One independent playback lane per speaker. Segments from the same seat play
 * in order on that seat's own timeline; the two seats play at the same time on
 * the shared AudioContext. Sid chose this on 2026-11-04: the room carries the
 * conversation, it does not referee it. Nobody is cut off by the transport;
 * a seat chooses whether to yield, and Stop audio remains explicit.
 */
type Lane = {
  queue: SpeechSegment[];
  controller?: AbortController;
  sources: Set<AudioBufferSourceNode>;
  generation: number;
  running: boolean;
  nextTime: number;
  completedTest: boolean;
  chunks: number;
};

export class SpeechQueue {
  private readonly lanes: Record<Speaker, Lane> = {
    a: SpeechQueue.lane(),
    b: SpeechQueue.lane(),
  };
  private readonly context: AudioContext;
  private readonly state: (text: string, busy: boolean) => void;
  private readonly error: (text: string) => void;
  constructor(state: (text: string, busy: boolean) => void, error: (text: string) => void) {
    this.state = state;
    this.error = error;
    this.context = new AudioContext();
  }
  private static lane(): Lane {
    return {
      queue: [],
      sources: new Set(),
      generation: 0,
      running: false,
      nextTime: 0,
      completedTest: false,
      chunks: 0,
    };
  }
  get isBusy() {
    return SPEAKERS.some((agent) => this.lanes[agent].running || this.lanes[agent].queue.length > 0);
  }
  /** Which seats are currently speaking, in seat order. */
  get speaking(): Speaker[] {
    return SPEAKERS.filter((agent) => this.lanes[agent].running);
  }
  resume(signal = AbortSignal.timeout(5000)) {
    return resumeAudio(this.context, signal);
  }
  enqueue(segments: SpeechSegment[]) {
    const backlog = SPEAKERS.reduce((total, agent) => total + this.lanes[agent].queue.length, 0);
    if (backlog + segments.length > 256)
      throw new Error('Speech backlog is full. Stop audio and enable speech again when ready.');
    for (const segment of segments) this.lanes[segment.agent].queue.push(segment);
    for (const agent of SPEAKERS) void this.pump(agent);
  }
  silence(agent: Speaker) {
    const lane = this.lanes[agent];
    const wasRunning = lane.running;
    this.stopLane(agent);
    if (wasRunning) this.report();
  }
  stop() {
    for (const agent of SPEAKERS) this.stopLane(agent);
  }
  close() {
    this.stop();
    void this.context.close();
  }
  private stopLane(agent: Speaker) {
    const lane = this.lanes[agent];
    lane.generation++;
    lane.queue = [];
    lane.controller?.abort();
    for (const source of lane.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    lane.sources.clear();
    lane.nextTime = 0;
  }
  private report() {
    const speaking = this.speaking;
    if (speaking.length)
      this.state(`Speaking ${speaking.map(label).join(' and ')}`, true);
    else {
      const tested = SPEAKERS.filter((agent) => this.lanes[agent].completedTest);
      if (tested.length) {
        const chunks = tested.reduce((total, agent) => total + this.lanes[agent].chunks, 0);
        for (const agent of tested) {
          this.lanes[agent].completedTest = false;
          this.lanes[agent].chunks = 0;
        }
        this.state(`Voice test complete · ${chunks} audio chunks played`, false);
      } else this.state('Waiting for new replies', false);
    }
  }
  private async pump(agent: Speaker) {
    const lane = this.lanes[agent];
    if (lane.running || !lane.queue.length) return;
    lane.running = true;
    const generation = lane.generation;
    try {
      while (lane.queue.length && generation === lane.generation) {
        const segment = lane.queue.shift()!;
        this.report();
        if (this.context.state !== 'running')
          throw new Error('Audio playback was suspended. Enable speech again.');
        lane.controller = new AbortController();
        const deadline = setTimeout(() => {
          if (generation !== lane.generation) return;
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
                ? segment.runId
                  ? { runId: segment.runId }
                  : {}
                : {
                    runId: segment.runId,
                    replyId: segment.replyId,
                    revision: segment.revision,
                    segment: segment.segment,
                  }),
              requestId: segment.requestId,
            }),
            signal: lane.controller.signal,
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
            if (!line.trim() || generation !== lane.generation) return;
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
            lane.sources.add(source);
            lane.chunks++;
            playback.push(
              new Promise((resolve) => {
                source.addEventListener(
                  'ended',
                  () => {
                    source.disconnect();
                    lane.sources.delete(source);
                    resolve();
                  },
                  { once: true },
                );
              }),
            );
            const when = Math.max(this.context.currentTime + 0.025, lane.nextTime);
            source.start(when);
            lane.nextTime = when + buffer.duration;
          };
          try {
            for (;;) {
              const chunk = await reader.read();
              if (generation !== lane.generation) return;
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
            if (segment.test) lane.completedTest = true;
          } finally {
            await reader.cancel().catch(() => {});
          }
        } finally {
          clearTimeout(deadline);
        }
      }
    } catch (cause) {
      if (generation === lane.generation) {
        // One seat's failure silences that seat only. The other lane keeps playing.
        this.stopLane(agent);
        this.error(
          `${label(agent)}: ${cause instanceof Error ? cause.message : 'Speech failed.'}`,
        );
      }
    } finally {
      lane.running = false;
      if (generation === lane.generation) this.report();
      if (lane.queue.length) void this.pump(agent);
    }
  }
}
