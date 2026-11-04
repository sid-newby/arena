import type { AgentId } from './agents.ts';

export const LISTEN_RATE = 16000;
export const CHUNK_MS = 100;
export const LISTEN_PATH = '/api/speech/listen';
export type VoiceTarget = 'room' | AgentId;

export type ListenEvent =
  | { type: 'ready' }
  | { type: 'turn.start' }
  | { type: 'turn.update'; transcript: string }
  | { type: 'turn.end'; transcript: string }
  | { type: 'closed' }
  | { type: 'error'; message: string };

export function parseListenEvent(raw: unknown): ListenEvent | undefined {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object' || !('type' in value)) return undefined;
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case 'ready':
    case 'turn.start':
    case 'closed':
      return { type: event.type };
    case 'turn.update':
    case 'turn.end':
      return typeof event.transcript === 'string'
        ? { type: event.type, transcript: event.transcript }
        : undefined;
    case 'error':
      return {
        type: 'error',
        message: typeof event.message === 'string' ? event.message : 'Listening failed.',
      };
    default:
      return undefined;
  }
}

export function listenSocketUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${LISTEN_PATH}`;
}

export function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    output[i] = input[index] * (1 - fraction) + input[next] * fraction;
  }
  return output;
}

export function toPcm16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

export class PcmChunker {
  private readonly size: number;
  private buffer: Int16Array<ArrayBuffer>;
  private filled = 0;
  constructor(rate = LISTEN_RATE, chunkMs = CHUNK_MS) {
    this.size = Math.round((rate * chunkMs) / 1000);
    this.buffer = new Int16Array(this.size);
  }
  push(samples: Int16Array): Int16Array<ArrayBuffer>[] {
    const chunks: Int16Array<ArrayBuffer>[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(this.size - this.filled, samples.length - offset);
      this.buffer.set(samples.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.size) {
        chunks.push(this.buffer);
        this.buffer = new Int16Array(this.size);
        this.filled = 0;
      }
    }
    return chunks;
  }
}

export function transcriptReady(transcript: string): string | undefined {
  const text = transcript.trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : undefined;
}

export function wordCount(transcript: string): number {
  return transcript.trim().split(/\s+/).filter(Boolean).length;
}

export const PCM_CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;
