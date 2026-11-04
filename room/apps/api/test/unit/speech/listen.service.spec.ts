import {
  ListenService,
  type ListenEvent,
  type ListenHandlers,
} from '../../../src/speech/listen.service.js';

class FakeListener {
  static instances: FakeListener[] = [];
  static failOpen = false;
  audio: Uint8Array[] = [];
  closed = false;
  constructor(
    readonly key: string,
    readonly handlers: ListenHandlers,
  ) {
    if (FakeListener.failOpen) throw new Error('offline');
    FakeListener.instances.push(this);
  }
  sendAudio(chunk: Uint8Array) {
    this.audio.push(chunk);
  }
  close() {
    this.closed = true;
  }
}
function service(key: string | null = 'offline-test-key') {
  return ListenService.forTest((k, handlers) => new FakeListener(k, handlers), key);
}
beforeEach(() => {
  FakeListener.instances = [];
  FakeListener.failOpen = false;
});

it('reports readiness from the server-side key only', () => {
  expect(service().status()).toMatchObject({ ready: true, model: 'ink-2', sampleRate: 16000 });
  expect(service(null).status()).toMatchObject({ ready: false });
  expect(() => service(null).open({ event: () => {} })).toThrow('CARTESIA_API_KEY');
});

it('relays audio to Cartesia and turn events back to the room', () => {
  const events: ListenEvent[] = [];
  const session = service().open({ event: (event) => events.push(event) });
  const listener = FakeListener.instances[0];
  expect(listener.key).toBe('offline-test-key');
  session.sendAudio(new Uint8Array([1, 2, 3]));
  expect(listener.audio).toHaveLength(1);
  listener.handlers.event({ type: 'ready' });
  listener.handlers.event({ type: 'turn.start' });
  listener.handlers.event({ type: 'turn.update', transcript: 'Hey' });
  listener.handlers.event({ type: 'turn.end', transcript: 'Hey Fable.' });
  expect(events.map((event) => event.type)).toEqual([
    'ready',
    'turn.start',
    'turn.update',
    'turn.end',
  ]);
  session.close();
  expect(listener.closed).toBe(true);
  session.close();
  expect(FakeListener.instances).toHaveLength(1);
});

it('limits concurrent microphones and frees a slot when Cartesia closes', () => {
  const listen = service();
  const first = listen.open({ event: () => {} });
  listen.open({ event: () => {} });
  expect(listen.sessions).toBe(2);
  expect(() => listen.open({ event: () => {} })).toThrow('Two microphones');
  FakeListener.instances[0].handlers.event({ type: 'closed' });
  expect(listen.sessions).toBe(1);
  first.close();
  expect(listen.sessions).toBe(1);
  listen.onModuleDestroy();
  expect(listen.sessions).toBe(0);
  expect(FakeListener.instances[1].closed).toBe(true);
  expect(() => listen.open({ event: () => {} })).toThrow('CARTESIA_API_KEY');
});

it('sanitizes a failed Cartesia handshake', () => {
  FakeListener.failOpen = true;
  const listen = service();
  expect(() => listen.open({ event: () => {} })).toThrow('Cartesia listening connection failed.');
  expect(listen.sessions).toBe(0);
});
