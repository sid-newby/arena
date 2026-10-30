import type { AgentId } from '../../../src/chat/chat.types.js';
import { PanelExpressions } from '../../../src/chat/panel-expression.js';

describe('Panel expressions', () => {
  let expressions: PanelExpressions;
  let changed: ReturnType<typeof vi.fn<(agent: AgentId) => void>>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    changed = vi.fn<(agent: AgentId) => void>();
    expressions = new PanelExpressions(changed);
  });
  afterEach(() => {
    expressions.close();
    vi.useRealTimers();
  });

  it('binds effects to the caller and supplies bounded defaults and truthful acceptance', () => {
    const result = expressions.express('a', { mood: 'annoyed' });
    expect(result).toMatchObject({
      accepted: true,
      rendering: 'unconfirmed',
      expression: {
        mood: 'annoyed',
        intensity: 0.35,
        duration: 900,
        startedAt: 10000,
        expiresAt: 10900,
      },
    });
    expect(expressions.snapshot('a', Date.now())?.id).toBeTruthy();
    expect(expressions.snapshot('b', Date.now())).toBeNull();
    expect(changed).toHaveBeenCalledExactlyOnceWith('a');
  });

  it.each(['amused', 'skeptical', 'startled'] as const)(
    'accepts %s on the caller panel with the existing bounded lifecycle',
    (mood) => {
      const result = expressions.express('b', { mood, intensity: 0.6, duration: 1500 });
      expect(result).toMatchObject({
        accepted: true,
        rendering: 'unconfirmed',
        expression: { mood, intensity: 0.6, duration: 1500, expiresAt: 11500 },
      });
      expect(expressions.snapshot('a', Date.now())).toBeNull();
      vi.advanceTimersByTime(1500);
      expect(expressions.snapshot('b', Date.now())).toBeNull();
    },
  );

  it.each([
    { mood: 'happy' },
    { mood: 'annoyed', intensity: -0.01 },
    { mood: 'annoyed', intensity: 1.01 },
    { mood: 'grumpy', intensity: Number.NaN },
    { mood: 'annoyed', duration: 149 },
    { mood: 'annoyed', duration: 1501 },
    { mood: 'annoyed', duration: 900.1 },
    { mood: 'annoyed', agent: 'b' },
    { mood: 'annoyed', css: 'arbitrary' },
  ])('rejects invalid expression %j', (input) => {
    expect(() => expressions.express('a', input)).toThrow('Invalid expression');
    expect(expressions.snapshot('a', Date.now())).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('reports cooldown without replacing or extending an active expression', () => {
    expressions.express('a', { mood: 'annoyed', duration: 1500 });
    const first = expressions.snapshot('a', Date.now());
    vi.advanceTimersByTime(200);
    expect(expressions.express('a', { mood: 'grumpy' })).toEqual({
      accepted: false,
      status: 'cooldown',
      retryAfterMs: 550,
      rendering: 'unconfirmed',
    });
    expect(expressions.snapshot('a', Date.now())).toEqual(first);
    expect(expressions.express('b', { mood: 'grumpy' }).accepted).toBe(true);
  });

  it('replaces repeated moods with unique ids and an old expiry cannot clear the replacement', () => {
    expressions.express('a', { mood: 'annoyed', duration: 1000 });
    const first = expressions.snapshot('a', Date.now());
    vi.advanceTimersByTime(750);
    expressions.express('a', { mood: 'annoyed', duration: 1500 });
    const second = expressions.snapshot('a', Date.now());
    expect(second?.id).not.toBe(first?.id);
    vi.advanceTimersByTime(250);
    expect(expressions.snapshot('a', Date.now())).toEqual(second);
    vi.advanceTimersByTime(1250);
    expect(expressions.snapshot('a', Date.now())).toBeNull();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('clear cancels its timer and is safe when already clear without resetting cooldown', () => {
    expressions.express('b', { mood: 'grumpy' });
    const id = expressions.snapshot('b', Date.now())?.id;
    expect(() => expressions.clear('b', { agent: 'a' })).toThrow('no arguments');
    expect(expressions.clear('b', {})).toMatchObject({ status: 'cleared', expressionId: id });
    expect(expressions.clear('b', {})).toMatchObject({ expressionId: null });
    expect(expressions.snapshot('b', Date.now())).toBeNull();
    expect(expressions.express('b', { mood: 'grumpy' }).accepted).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('snapshot omits expired effects even before an expiry callback runs and close clears transients', () => {
    expressions.express('b', { mood: 'grumpy' });
    expect(expressions.snapshot('b', 10900)).toBeNull();
    expressions.close();
    expect(expressions.snapshot('b', 10000)).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
