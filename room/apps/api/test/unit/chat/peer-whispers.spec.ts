import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerWhispers } from '../../../src/chat/peer-whispers.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import type { ParticipantBinding } from '../../../src/runs/run.contract.js';

const astra: ParticipantBinding = {
  id: 'session-a',
  role: 'a',
  runId: 'hangout',
  config: { provider: 'codex', model: 'gpt-6-astra', effort: 'high' },
  workspace: 'shared',
  instructionsVersion: '1',
  toolPolicyVersion: 1,
};
const fable: ParticipantBinding = {
  ...astra,
  id: 'session-b',
  role: 'b',
  config: { provider: 'anthropic', model: 'claude-fable-5-1', effort: 'high' },
};
const factory = (run: AgentRuntime['run']) =>
  vi.fn<(binding: ParticipantBinding) => AgentRuntime>(
    (binding: ParticipantBinding): AgentRuntime => ({
      run,
      info: {
        id: binding.role,
        provider: binding.config.provider,
        effort: binding.config.effort,
        name: binding.id,
        model: binding.config.model,
        runtime: 'test',
        status: 'ready',
      },
    }),
  );

describe('private agent-to-agent whispers', () => {
  let db: DatabaseSync, dir: string;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    dir = mkdtempSync(join(tmpdir(), 'peer-whispers-'));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives the actual peer a separate, tool-less conversation and durable pair-only history', async () => {
    const contexts: TurnContext[] = [];
    const entry = factory(async (ctx) => {
      contexts.push(ctx);
      await expect(ctx.tool('whisper_peer', { text: 'recursive' })).rejects.toThrow('unavailable');
      ctx.append('Private answer.');
    });
    const record = vi.fn<NonNullable<ConstructorParameters<typeof PeerWhispers>[3]>>();
    const first = new PeerWhispers(db, entry, dir, record);
    const signal = new AbortController().signal;
    const result = await first.send(astra, fable, 'turn-a', 'Private question.', signal);
    expect(JSON.parse(result)).toMatchObject({
      from: 'Fable',
      reply: 'Private answer.',
      private: true,
    });
    expect(entry.mock.calls[0]![0]).toMatchObject({ role: 'b', config: fable.config });
    expect(entry.mock.calls[0]![0].workspace).toContain('/.room/peer-whispers/');
    expect(contexts[0]).toMatchObject({ mode: 'side', tools: [] });
    expect(contexts[0]!.session).toBeUndefined();
    expect(contexts[0]!.instructions).toContain(
      'Honcho memory for private whispers with your peer is off here',
    );
    expect(contexts[0]!.refreshInstructions).toBe(true);
    expect(record.mock.calls.map((c) => [c[1].id, c[2].id, c[3]])).toEqual([
      [astra.id, fable.id, 'Private question.'],
      [fable.id, astra.id, 'Private answer.'],
    ]);
    const restored = new PeerWhispers(db, entry, dir, record);
    expect(await restored.send(astra, fable, 'turn-a', 'Private question.', signal)).toBe(result);
    expect(entry).toHaveBeenCalledTimes(1);
    await expect(restored.send(astra, fable, 'turn-a', 'A second request', signal)).rejects.toThrow(
      'already',
    );
    await restored.send(fable, astra, 'turn-b', 'Follow-up', signal);
    expect(JSON.parse(contexts[1]!.text).history).toEqual([
      {
        sender: 'Astra',
        message: 'Private question.',
        recipient: 'Fable',
        reply: 'Private answer.',
      },
    ]);
    await restored.send({ ...astra, id: 'replacement' }, fable, 'turn-c', 'Hello', signal);
    expect(JSON.parse(contexts[2]!.text).history).toEqual([]);
  });

  it('cancels private generation with its caller and rejects crossing into another run', async () => {
    let context: TurnContext | undefined;
    const entry = factory(async (ctx) => {
      context = ctx;
      await new Promise<void>(() => {});
    });
    const record = vi.fn<NonNullable<ConstructorParameters<typeof PeerWhispers>[3]>>();
    const service = new PeerWhispers(db, entry, dir, record);
    const controller = new AbortController();
    await expect(
      service.send(astra, { ...fable, runId: 'debate' }, 'bad', 'x', controller.signal),
    ).rejects.toThrow('hangout');
    const sent = service.send(astra, fable, 'one', 'private question', controller.signal);
    await expect(
      service.send(fable, astra, 'two', 'concurrent', controller.signal),
    ).rejects.toThrow('already');
    controller.abort();
    await expect(sent).rejects.toThrow('could not be completed');
    expect(context?.controller.signal.aborted).toBe(true);
    context?.append('late private reply');
    expect(record).not.toHaveBeenCalled();
    expect(
      db.prepare('SELECT status,reply FROM peer_whispers WHERE turn_id=?').get('one'),
    ).toMatchObject({ status: 'failed', reply: null });
  });
});
