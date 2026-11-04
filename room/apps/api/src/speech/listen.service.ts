import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Cartesia from '@cartesia/cartesia-js';
import { createRequire } from 'node:module';
import { serverCartesiaKey } from './speech.service.js';

// The SDK ESM build falls back to a native WebSocket with the key in its URL when
// require('ws') is unavailable. The CJS build always sends Bearer headers.
const sdkRequire = createRequire(import.meta.url);
const { AutoFinalizeWS } = sdkRequire(
  '@cartesia/cartesia-js/resources/stt/auto-finalize/ws',
) as typeof import('@cartesia/cartesia-js/resources/stt/auto-finalize/ws');

export const LISTEN_MODEL = 'ink-2';
export const LISTEN_RATE = 16000;
export const LISTEN_ENCODING = 'pcm_s16le';
export const LISTEN_PATH = '/api/speech/listen';

export type ListenEvent =
  | { type: 'ready' }
  | { type: 'turn.start' }
  | { type: 'turn.update'; transcript: string }
  | { type: 'turn.end'; transcript: string }
  | { type: 'closed' }
  | { type: 'error'; message: string };

export interface ListenSocket {
  sendAudio(chunk: Uint8Array): void;
  close(): void;
}
export interface ListenHandlers {
  event(event: ListenEvent): void;
}
type OpenListener = (key: string, handlers: ListenHandlers) => ListenSocket;

export function openCartesiaListener(key: string, handlers: ListenHandlers): ListenSocket {
  const client = new Cartesia({
    apiKey: key,
    baseURL: 'https://api.cartesia.ai',
    maxRetries: 0,
    timeout: 15000,
    logLevel: 'off',
  });
  let closed = false;
  const socket = new AutoFinalizeWS(
    client,
    { model: LISTEN_MODEL, encoding: LISTEN_ENCODING, sample_rate: LISTEN_RATE },
    { handshakeTimeout: 15000, headers: { 'Cartesia-Version': '2026-08-14' }, reconnect: null },
  );
  const finish = () => {
    if (closed) return;
    closed = true;
    handlers.event({ type: 'closed' });
  };
  socket.on('event', (event) => {
    if (closed) return;
    switch (event.type) {
      case 'connected':
        handlers.event({ type: 'ready' });
        return;
      case 'turn.start':
        handlers.event({ type: 'turn.start' });
        return;
      case 'turn.update':
        handlers.event({ type: 'turn.update', transcript: event.transcript });
        return;
      case 'turn.end':
        handlers.event({ type: 'turn.end', transcript: event.transcript });
        return;
      case 'error':
        handlers.event({ type: 'error', message: 'Cartesia transcription failed.' });
        return;
      default:
        return;
    }
  });
  socket.on('error', () => {
    if (!closed)
      handlers.event({ type: 'error', message: 'Cartesia listening connection failed.' });
  });
  socket.on('close', finish);
  return {
    sendAudio: (chunk) => {
      if (!closed) socket.sendRaw(chunk);
    },
    close: () => {
      if (closed) return;
      try {
        socket.send({ type: 'close' });
      } catch {
        /* The socket may already be gone. */
      }
      socket.close();
      finish();
    },
  };
}

@Injectable()
export class ListenService implements OnModuleDestroy {
  private openListener: OpenListener = openCartesiaListener;
  private key = serverCartesiaKey;
  private readonly active = new Set<ListenSocket>();
  private destroyed = false;

  static forTest(openListener: OpenListener, key: string | null = 'offline-test-key') {
    const service = new ListenService();
    service.openListener = openListener;
    service.key = () => key ?? undefined;
    return service;
  }

  status() {
    const ready = Boolean(this.key()) && !this.destroyed;
    return {
      ready,
      detail: ready
        ? 'Cartesia key loaded on the server. The microphone streams only while you enable it.'
        : 'Cartesia needs CARTESIA_API_KEY in the server process before the room can listen.',
      model: LISTEN_MODEL,
      sampleRate: LISTEN_RATE,
      encoding: LISTEN_ENCODING,
    };
  }

  get sessions() {
    return this.active.size;
  }

  open(handlers: ListenHandlers): ListenSocket {
    const key = this.key();
    if (!key || this.destroyed) throw new Error(this.status().detail);
    if (this.active.size >= 2)
      throw new Error('Two microphones are already open. Close one first.');
    let socket: ListenSocket | undefined;
    const session: ListenSocket = {
      sendAudio: (chunk) => socket?.sendAudio(chunk),
      close: () => {
        if (!this.active.delete(session)) return;
        socket?.close();
      },
    };
    this.active.add(session);
    try {
      socket = this.openListener(key, {
        event: (event) => {
          handlers.event(event);
          if (event.type === 'closed') this.active.delete(session);
        },
      });
    } catch {
      this.active.delete(session);
      throw new Error(
        'Cartesia listening connection failed. Check server credentials and network access.',
      );
    }
    return session;
  }

  onModuleDestroy() {
    this.destroyed = true;
    for (const session of this.active) session.close();
  }
}
