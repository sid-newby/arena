import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../../../src/chat/chat.store.js';

it('migrates existing poses and sessions, increments repeated poses, and retains revisions after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-pose-'));
  const path = join(directory, 'chat.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE agents (id TEXT PRIMARY KEY, session TEXT, pose TEXT NOT NULL DEFAULT 'front', error TEXT);
    INSERT INTO agents(id, session, pose) VALUES ('luna', 'existing-session', 'right');
  `);
  legacy.close();
  let store = new ChatStore(path);
  try {
    expect(store.session('a')).toBeUndefined();
    expect(store.runs.session('legacy-a')?.continuation).toBe('existing-session');
    expect(store.snapshot('a')).toMatchObject({ pose: 'right', poseRevision: 0 });
    store.setPose('a', 'right');
    expect(store.snapshot('a').poseRevision).toBe(1);
    store.setPose('a', 'right');
    expect(store.snapshot('a').poseRevision).toBe(2);
    expect(store.snapshot('b').poseRevision).toBe(0);
    store.close();
    store = new ChatStore(path);
    expect(store.session('a')).toBeUndefined();
    expect(store.runs.session('legacy-a')?.continuation).toBe('existing-session');
    expect(store.snapshot('a')).toMatchObject({ pose: 'right', poseRevision: 2 });
    store.setPose('a', 'front');
    expect(store.snapshot('a')).toMatchObject({ pose: 'front', poseRevision: 3 });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('archives legacy and version 2 provider sessions during expression upgrades and preserves room history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-session-'));
  const path = join(directory, 'chat.sqlite');
  const store = new ChatStore(path);
  try {
    store.setSession('a', 'legacy-session');
    store.create('turn-1', 'a', 'request-1', 'Look right');
    store.append('turn-1', 'I requested a turn.');
    store.tool('turn-1', 'set_pose', { pose: 'right' }, 'Panel turned.');
    store.finish('turn-1', 'completed');
    store.setSession('a', 'expression-session', 2);
    expect(store.session('a')).toBe('expression-session');
    expect(store.toolVersion('a')).toBe(2);
    expect(store.history('a')).toEqual([
      {
        prompt: 'Look right',
        text: 'I requested a turn.',
        status: 'completed',
        tools: [{ name: 'set_pose', input: '{"pose":"right"}', output: 'Panel turned.' }],
      },
    ]);
    expect(store.snapshot('a').sessionNotice).toContain('new provider session');
    store.setSession('a', 'expression-session', 2);
    const db = new DatabaseSync(path);
    expect(
      db.prepare('SELECT old_session,new_session FROM provider_session_migrations').all(),
    ).toEqual([{ old_session: 'legacy-session', new_session: 'expression-session' }]);
    store.setSession('a', 'emote-session', 3);
    expect(store.session('a')).toBe('emote-session');
    expect(store.toolVersion('a')).toBe(3);
    expect(store.history('a')[0]).toMatchObject({
      prompt: 'Look right',
      text: 'I requested a turn.',
      tools: [{ name: 'set_pose', input: '{"pose":"right"}', output: 'Panel turned.' }],
    });
    expect(store.snapshot('a').sessionNotice).toContain('update expressions');
    store.setSession('a', 'emote-session', 3);
    expect(
      db
        .prepare('SELECT old_session,new_session FROM provider_session_migrations ORDER BY id')
        .all(),
    ).toEqual([
      { old_session: 'legacy-session', new_session: 'expression-session' },
      { old_session: 'expression-session', new_session: 'emote-session' },
    ]);
    db.close();
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
