import { narration } from '../../../src/speech/narration.js';

describe('Saved narration', () => {
  it('preserves conditions, numbers, uncertainty, and actions through segmentation', () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Step ${i + 1} requires the migration first; the outcome remains uncertain.`,
    ).join(' ');
    const result = narration(text);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready narration');
    expect(result.segments.every((segment) => segment.length <= 350)).toBe(true);
    expect(result.segments.join(' ')).toBe(text);
    expect(narration(text)).toEqual(result);
    expect(narration(`${text} Additional condition.`)).not.toEqual(result);
  });

  it('keeps complete sentences together when the next sentence exceeds a segment', () => {
    const text = `Migration is required first. ${'Check the retained data carefully '.repeat(20).trim()}.`;
    const result = narration(text);
    if (result.status !== 'ready') throw new Error('Expected ready narration');
    expect(result.segments[0]).toBe('Migration is required first.');
    expect(result.segments.join(' ')).toBe(text);
  });

  it.each([
    'const secret = process.env.API_KEY;',
    'print("hello")',
    'console.log("hello");',
    'SELECT * FROM users;',
    '```ts\nconst x = 1;\n```',
  ])('rejects suspicious summary %s', (text) => {
    expect(narration(text)).toEqual({
      status: 'unavailable',
      reason: 'The spoken summary contains possible source code.',
    });
  });

  it('keeps readable package and method names while removing markdown decoration', () => {
    expect(narration('Use **react** and call `render()`.')).toMatchObject({
      status: 'ready',
      segments: ['Use react and call render().'],
    });
    expect(narration(undefined).status).toBe('unavailable');
  });

  it.each([
    [
      'Use a timeout of `30 seconds` before retrying.',
      'Use a timeout of 30 seconds before retrying.',
    ],
    [
      'Do not enable caching until `migration completes`.',
      'Do not enable caching until migration completes.',
    ],
    [
      'Retry after `30 seconds`, at most `3 attempts`.',
      'Retry after 30 seconds, at most 3 attempts.',
    ],
  ])('preserves inline values in %s', (input, expected) => {
    expect(narration(input)).toMatchObject({ status: 'ready', segments: [expected] });
  });

  it.each(['Check `x > 3` before retrying.', 'Check `unfinished before retrying.'])(
    'rejects unsafe or malformed inline content in %s',
    (input) => {
      expect(narration(input)).toEqual({
        status: 'unavailable',
        reason: 'The spoken summary contains inline content that cannot be safely spoken.',
      });
    },
  );
});
