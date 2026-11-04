import { createRequire } from 'node:module';
import { openCartesiaListener, type ListenEvent } from '../../../src/speech/listen.service.js';

const sdkRequire = createRequire(import.meta.url);
type Listener = (...args: unknown[]) => void;
class FakeTransport {
  static current: FakeTransport | undefined;
  static headerAuth = false;
  static safeURL = false;
  static versionPinned = false;
  static params = '';
  readyState = 0;
  sent: unknown[] = [];
  closed = false;
  private listeners = new Map<string, Set<Listener>>();
  constructor(url: URL, options: { headers: Record<string, string> }) {
    FakeTransport.current = this;
    FakeTransport.headerAuth = options.headers.authorization === 'Bearer offline-test-key';
    FakeTransport.versionPinned = options.headers['cartesia-version'] === '2026-08-14';
    FakeTransport.params = url.search;
    FakeTransport.safeURL =
      url.protocol === 'wss:' &&
      url.hostname === 'api.cartesia.ai' &&
      url.pathname === '/stt/turns/websocket' &&
      !/api_key|access_token/.test(url.search);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open');
    });
  }
  emit(type: string, ...args: unknown[]) {
    this.listeners.get(type)?.forEach((fn) => fn(...args));
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from('OK'));
  }
  addEventListener(type: string, fn: Listener) {
    const entries = this.listeners.get(type) ?? new Set<Listener>();
    entries.add(fn);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  on(type: string, fn: Listener) {
    this.addEventListener(type, fn);
  }
  off(type: string, fn: Listener) {
    this.removeEventListener(type, fn);
  }
  once(type: string, fn: Listener) {
    const wrapped: Listener = (...args) => {
      this.removeEventListener(type, wrapped);
      fn(...args);
    };
    this.addEventListener(type, wrapped);
  }
}

beforeEach(() => {
  FakeTransport.current = undefined;
  vi.spyOn(globalThis, 'WebSocket').mockImplementation(() => {
    throw new Error('Native WebSocket fallback is forbidden.');
  });
  const wsModule = sdkRequire('ws') as { WebSocket: typeof FakeTransport };
  vi.spyOn(wsModule, 'WebSocket').mockImplementation(FakeTransport);
});
afterEach(() => vi.restoreAllMocks());

it('opens the turn-detection socket with header auth, pinned version, and no credentials in the URL', async () => {
  const events: ListenEvent[] = [];
  const socket = openCartesiaListener('offline-test-key', { event: (event) => events.push(event) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(FakeTransport.headerAuth).toBe(true);
  expect(FakeTransport.versionPinned).toBe(true);
  expect(FakeTransport.safeURL).toBe(true);
  expect(FakeTransport.params).toContain('model=ink-2');
  expect(FakeTransport.params).toContain('encoding=pcm_s16le');
  expect(FakeTransport.params).toContain('sample_rate=16000');
  const transport = FakeTransport.current!;
  transport.emit('message', JSON.stringify({ type: 'connected', request_id: 'r' }), false);
  transport.emit('message', JSON.stringify({ type: 'turn.start', request_id: 'r' }), false);
  transport.emit(
    'message',
    JSON.stringify({ type: 'turn.end', request_id: 'r', transcript: 'Hello room.' }),
    false,
  );
  socket.sendAudio(new Uint8Array([0, 1]));
  expect(transport.sent.at(-1)).toBeInstanceOf(Uint8Array);
  socket.close();
  expect(transport.sent.some((data) => data === JSON.stringify({ type: 'close' }))).toBe(true);
  expect(transport.closed).toBe(true);
  expect(events).toEqual([
    { type: 'ready' },
    { type: 'turn.start' },
    { type: 'turn.end', transcript: 'Hello room.' },
    { type: 'closed' },
  ]);
});
