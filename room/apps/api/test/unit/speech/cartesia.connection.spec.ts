import { createRequire } from 'node:module';
import { openCartesia } from '../../../src/speech/speech.service.js';

const sdkRequire = createRequire(import.meta.url);
type Listener = (event: { message: string }) => void;
class FakeTransport {
  readyState = 0;
  private listeners = new Map<string, Set<Listener>>();
  static fail = false;
  static headerAuth = false;
  static safeURL = false;
  static versionPinned = false;
  static handlerBeforeHandshake = false;
  constructor(url: URL, options: { headers: Record<string, string> }) {
    FakeTransport.headerAuth = options.headers.authorization === 'Bearer offline-test-key';
    FakeTransport.versionPinned = options.headers['cartesia-version'] === '2026-08-14';
    FakeTransport.safeURL =
      url.protocol === 'wss:' && url.hostname === 'api.cartesia.ai' && !url.search;
    queueMicrotask(() => {
      this.readyState = FakeTransport.fail ? 3 : 1;
      // The SDK adds one handshake and one steady-state socket error listener.
      FakeTransport.handlerBeforeHandshake = (this.listeners.get('error')?.size ?? 0) >= 2;
      this.listeners
        .get(FakeTransport.fail ? 'error' : 'open')
        ?.forEach((fn) => fn({ message: 'offline test handshake failure' }));
    });
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  addEventListener(type: string, fn: Listener) {
    const entries = this.listeners.get(type) ?? new Set<Listener>();
    entries.add(fn);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
}

beforeEach(() => {
  FakeTransport.fail = false;
  FakeTransport.handlerBeforeHandshake = false;
  // If SDK packaging changes to native/browser fallback, fail before any network access.
  vi.spyOn(globalThis, 'WebSocket').mockImplementation(() => {
    throw new Error('Native WebSocket fallback is forbidden.');
  });
  const wsModule = sdkRequire('ws') as { WebSocket: typeof FakeTransport };
  vi.spyOn(wsModule, 'WebSocket').mockImplementation(FakeTransport);
});
afterEach(() => vi.restoreAllMocks());

it('uses the official CJS SDK with Bearer header auth and no credentials in its URL', async () => {
  const socket = await openCartesia('offline-test-key');
  expect(FakeTransport.headerAuth).toBe(true);
  expect(FakeTransport.safeURL).toBe(true);
  expect(FakeTransport.versionPinned).toBe(true);
  expect(socket.isOpen?.()).toBe(true);
  socket.close();
});

it('handles initial SDK handshake rejection without exposing diagnostics', async () => {
  FakeTransport.fail = true;
  await expect(openCartesia('offline-test-key')).rejects.toThrow('Cartesia connection failed.');
  expect(FakeTransport.handlerBeforeHandshake).toBe(true);
});
