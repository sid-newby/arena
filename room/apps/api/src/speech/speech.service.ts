import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Cartesia from '@cartesia/cartesia-js';
import { createRequire } from 'node:module';

// The SDK ESM build catches undefined require('ws') and falls back to native WS,
// which moves API keys into query parameters. Its public CJS build uses ws headers.
const sdkRequire = createRequire(import.meta.url);
const { TTSWS } = sdkRequire(
  '@cartesia/cartesia-js/resources/tts/index',
) as typeof import('@cartesia/cartesia-js/resources/tts/index');

// Capture once at module load, then remove from env before agent child processes start.
const serverKey = process.env.CARTESIA_API_KEY?.trim();
delete process.env.CARTESIA_API_KEY;

export const SPEECH_MODEL = 'sonic-3.6';
export const SPEECH_RATE = 44100;
export const SPEECH_VOICES = {
  a:
    process.env.MODEL_A_VOICE_ID?.trim() ||
    process.env.LUNA_CARTESIA_VOICE_ID?.trim() ||
    '064b17af-d36b-4bfb-b003-be07dba1b649',
  b:
    process.env.MODEL_B_VOICE_ID?.trim() ||
    process.env.OPUS_CARTESIA_VOICE_ID?.trim() ||
    '365dc2a1-3832-4437-b946-0bad694fc0e6',
} as const;
export type SpeechReference = {
  agent: 'a' | 'b';
  runId: string;
  replyId: string;
  revision: string;
  segment: number;
};
export type SpeechAgent = keyof typeof SPEECH_VOICES;
const emotions = [
  'neutral',
  'happy',
  'excited',
  'enthusiastic',
  'elated',
  'euphoric',
  'triumphant',
  'amazed',
  'surprised',
  'flirtatious',
  'curious',
  'content',
  'peaceful',
  'serene',
  'calm',
  'grateful',
  'affectionate',
  'trust',
  'sympathetic',
  'anticipation',
  'mysterious',
  'angry',
  'mad',
  'outraged',
  'frustrated',
  'agitated',
  'threatened',
  'disgusted',
  'contempt',
  'envious',
  'sarcastic',
  'ironic',
  'sad',
  'dejected',
  'melancholic',
  'disappointed',
  'hurt',
  'guilty',
  'bored',
  'tired',
  'rejected',
  'nostalgic',
  'wistful',
  'apologetic',
  'hesitant',
  'insecure',
  'confused',
  'resigned',
  'anxious',
  'panicked',
  'alarmed',
  'scared',
  'proud',
  'confident',
  'distant',
  'skeptical',
  'contemplative',
  'determined',
] as const satisfies readonly Cartesia.Emotion[];
export type SpeechRequest = {
  agent: SpeechAgent;
  text: string;
  requestId: string;
  generation_config: { speed: number; volume: number; emotion: Cartesia.Emotion };
};
function generationConfig(value: unknown): SpeechRequest['generation_config'] {
  if (value === undefined) return { speed: 1, volume: 1, emotion: 'neutral' };
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadRequestException('generation_config must be an object.');
  const config = value as Record<string, unknown>;
  const speed = config.speed ?? 1;
  const volume = config.volume ?? 1;
  const emotion = config.emotion ?? 'neutral';
  if (
    Object.keys(config).some((name) => !['speed', 'volume', 'emotion'].includes(name)) ||
    typeof speed !== 'number' ||
    !Number.isFinite(speed) ||
    speed < 0.6 ||
    speed > 1.5 ||
    typeof volume !== 'number' ||
    !Number.isFinite(volume) ||
    volume < 0.5 ||
    volume > 2 ||
    typeof emotion !== 'string' ||
    !emotions.includes(emotion as Cartesia.Emotion)
  )
    throw new BadRequestException(
      'Use speed 0.6–1.5, volume 0.5–2.0, and a supported Cartesia emotion.',
    );
  return { speed, volume, emotion: emotion as Cartesia.Emotion };
}
export type SpeechEvent =
  | { type: 'audio'; audio: string; sampleRate: number; contextId: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
type Emit = (event: SpeechEvent) => void;

type ContextOptions = {
  contextId: string;
  model_id: string;
  voice: string;
  output_format: { container: 'raw'; encoding: 'pcm_f32le'; sample_rate: 44100 };
  language: 'en';
  timeout: number;
};
export interface SpeechContext {
  contextId: string;
  push(input: {
    transcript: string;
    generation_config: SpeechRequest['generation_config'];
  }): Promise<void>;
  no_more_inputs(): Promise<void>;
  receive(): AsyncIterable<{ type: string; audio?: Uint8Array }>;
  cancel(): Promise<void>;
}
export interface SpeechSocket {
  context(options: ContextOptions): SpeechContext;
  close(): void;
  isOpen?(): boolean;
}
type OpenSocket = (key: string) => Promise<SpeechSocket>;

export async function openCartesia(key: string): Promise<SpeechSocket> {
  // Explicit endpoint and disabled SDK logs keep credentials and transcript out of logs.
  const client = new Cartesia({
    apiKey: key,
    baseURL: 'https://api.cartesia.ai',
    maxRetries: 0,
    timeout: 15000,
    logLevel: 'off',
  });
  // Use the SDK's public constructor so its error listener exists during the handshake,
  // rather than only after the asynchronous .websocket() helper has connected.
  const socket = new TTSWS(client, {
    handshakeTimeout: 15000,
    headers: { 'Cartesia-Version': '2026-08-14' },
  });
  socket.on('error', () => {
    /* receive() reports sanitized per-context errors. */
  });
  try {
    await socket.connect();
  } catch {
    socket.close();
    throw new Error('Cartesia connection failed.');
  }
  return {
    context: (options) => socket.context(options),
    close: () => socket.close(),
    isOpen: () => socket.socket.readyState === 1,
  };
}

@Injectable()
export class SpeechService implements OnModuleDestroy {
  private openSocket: OpenSocket = openCartesia;
  private key = () => serverKey;
  private connection?: Promise<SpeechSocket>;
  private socket?: SpeechSocket;
  private readonly used = new Map<string, number>();
  private readonly active = new Map<string, () => void>();
  private destroyed = false;

  static forTest(openSocket: OpenSocket, key = 'offline-test-key') {
    const service = new SpeechService();
    service.openSocket = openSocket;
    service.key = () => key;
    return service;
  }

  status() {
    const ready = Boolean(this.key()) && !this.destroyed;
    return {
      ready,
      detail: ready
        ? 'Cartesia key loaded on the server. Voice access is checked on explicit playback.'
        : 'Cartesia needs CARTESIA_API_KEY in the server process. No key belongs in the browser.',
      voices: SPEECH_VOICES,
      model: SPEECH_MODEL,
      sampleRate: SPEECH_RATE,
    };
  }

  prepare(body: unknown, resolve?: (reference: SpeechReference) => string): SpeechRequest {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('agent' in body) ||
      !['a', 'b'].includes(String(body.agent)) ||
      'text' in body ||
      !('kind' in body) ||
      !['test', 'reply'].includes(String(body.kind)) ||
      !('requestId' in body) ||
      typeof body.requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,180}$/.test(body.requestId)
    )
      throw new BadRequestException(
        'Provide a saved narration reference or voice test, an agent, and a unique requestId.',
      );
    let text: string;
    if (body.kind === 'test') {
      if (
        Object.keys(body).some(
          (key) => !['kind', 'agent', 'requestId', 'generation_config'].includes(key),
        )
      )
        throw new BadRequestException('Voice tests use only the fixed server phrase.');
      text = `Hello, this is ${String(body.agent).toUpperCase()} speaking.`;
    } else {
      if (
        !resolve ||
        !('runId' in body) ||
        typeof body.runId !== 'string' ||
        !('replyId' in body) ||
        typeof body.replyId !== 'string' ||
        !('revision' in body) ||
        typeof body.revision !== 'string' ||
        !('segment' in body) ||
        typeof body.segment !== 'number' ||
        !Number.isSafeInteger(body.segment) ||
        body.segment < 0 ||
        Object.keys(body).some(
          (key) =>
            ![
              'kind',
              'agent',
              'requestId',
              'runId',
              'replyId',
              'revision',
              'segment',
              'generation_config',
            ].includes(key),
        )
      )
        throw new BadRequestException('Provide a complete saved narration reference.');
      text = resolve({
        agent: body.agent as SpeechAgent,
        runId: body.runId,
        replyId: body.replyId,
        revision: body.revision,
        segment: body.segment,
      });
    }
    if (!this.status().ready) throw new ServiceUnavailableException(this.status().detail);
    if (this.active.size >= 4)
      throw new HttpException(
        'Four speech segments are already active. Stop or wait.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const now = Date.now();
    for (const [id, expires] of this.used) if (expires <= now) this.used.delete(id);
    if (this.used.has(body.requestId))
      throw new ConflictException(
        'This speech segment was already requested. It will not be synthesized again.',
      );
    if (this.used.size >= 2000)
      throw new HttpException(
        'Speech request limit reached. Wait before requesting more.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const config = generationConfig(
      'generation_config' in body ? body.generation_config : undefined,
    );
    this.used.set(body.requestId, now + 10 * 60 * 1000);
    return {
      agent: body.agent as SpeechAgent,
      text,
      requestId: body.requestId,
      generation_config: config,
    };
  }

  private connect(): Promise<SpeechSocket> {
    // A new explicit segment may reconnect, but an interrupted segment is never replayed.
    if (this.socket?.isOpen && !this.socket.isOpen()) {
      this.socket.close();
      this.socket = undefined;
      this.connection = undefined;
    }
    if (!this.connection) {
      const key = this.key();
      if (!key) throw new ServiceUnavailableException('Cartesia key is not loaded on the server.');
      this.connection = this.openSocket(key)
        .then((socket) => {
          if (this.destroyed) {
            socket.close();
            throw new Error('Speech closed.');
          }
          this.socket = socket;
          return socket;
        })
        .catch(() => {
          this.connection = undefined;
          throw new Error(
            'Cartesia connection failed. Check server credentials and network access.',
          );
        });
    }
    return this.connection;
  }

  async stream(request: SpeechRequest, signal: AbortSignal, emit: Emit): Promise<void> {
    if (signal.aborted) return;
    let context: SpeechContext | undefined;
    let cancelled = false;
    let complete = false;
    let timedOut = false;
    const cancel = () => {
      cancelled = true;
      void context?.cancel().catch(() => {});
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      cancel();
    }, 45000);
    signal.addEventListener('abort', cancel, { once: true });
    this.active.set(request.requestId, cancel);
    try {
      const socket = await this.connect();
      if (cancelled || signal.aborted) return;
      context = socket.context({
        contextId: randomUUID(),
        model_id: SPEECH_MODEL,
        voice: SPEECH_VOICES[request.agent],
        output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: SPEECH_RATE },
        language: 'en',
        timeout: 15000,
      });
      await context.push({
        transcript: request.text,
        generation_config: request.generation_config,
      });
      if (cancelled || signal.aborted) return;
      await context.no_more_inputs();
      for await (const event of context.receive()) {
        if (cancelled || signal.aborted) break;
        if (event.type === 'error') throw new Error('Cartesia synthesis failed.');
        if (event.type === 'chunk' && event.audio?.byteLength)
          emit({
            type: 'audio',
            audio: Buffer.from(event.audio).toString('base64'),
            sampleRate: SPEECH_RATE,
            contextId: context.contextId,
          });
        if (event.type === 'done') complete = true;
      }
      if (timedOut) throw new Error('Speech timed out.');
      if (!cancelled && !signal.aborted) {
        if (!complete) throw new Error('Cartesia disconnected before finishing speech.');
        emit({ type: 'done' });
      }
    } catch {
      if (!signal.aborted && (!cancelled || timedOut))
        emit({
          type: 'error',
          message: timedOut
            ? 'Speech timed out. Stop playback and retry explicitly.'
            : 'Cartesia speech failed. Check voice access, server credentials and connection.',
        });
      // Discard a failed shared socket. Other contexts will terminate or time out;
      // no text is automatically retried or replayed on a new connection.
      this.socket?.close();
      this.socket = undefined;
      this.connection = undefined;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      if (!complete) await context?.cancel().catch(() => {});
      this.active.delete(request.requestId);
    }
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.active.forEach((cancel) => cancel());
    this.socket?.close();
    this.socket = undefined;
    this.connection = undefined;
  }
}
