import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import { HANGOUT_TOOL_VERSION } from '../../../src/chat/panel-presence.js';
import type { ParticipantBinding, SeatId } from '../../../src/runs/run.contract.js';
import { LiveProjectTools } from '../../../src/tools/tool-broker.js';

describe('hangout shared project', () => {
  let dir: string, project: string, chat: ChatService;
  let contexts: TurnContext[];
  let release: () => void;
  const broker = vi.spyOn(LiveProjectTools.prototype, 'call');
  const factory = (binding: ParticipantBinding): AgentRuntime => ({
    info: {
      ...binding.config,
      id: binding.role,
      name: binding.role,
      status: 'ready',
      runtime: 'fixture',
    },
    async run(context) {
      contexts.push(context);
      if (context.mode === 'side') {
        context.append('Private answer');
        return;
      }
      await new Promise<void>((resolve) => {
        release = resolve;
        context.controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  });
  function open() {
    const store = new ChatStore(join(dir, 'room.sqlite'), dir);
    const hangout = store.runs.ensureHangout();
    return ChatService.forTest(
      store,
      {
        a: factory(store.runs.binding(hangout.id, 'a')),
        b: factory(store.runs.binding(hangout.id, 'b')),
      },
      dir,
      { runtimeFactory: factory },
    );
  }
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'hangout-project-')));
    project = join(dir, 'selected');
    mkdirSync(project);
    contexts = [];
    broker.mockReset().mockResolvedValue('private-file-result');
    chat = open();
  });
  afterEach(async () => {
    await chat.onModuleDestroy();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });
  async function turn(seat: SeatId, requestId: string) {
    const count = contexts.length;
    const run = chat.hangout();
    chat.submitMessage(
      seat,
      {
        text: 'Project status?',
        requestId: requestId + '-' + seat,
        broadcastId: requestId,
        intent: 'queue',
        expectedRevision: run.revision,
      },
      run.id,
    );
    await vi.waitFor(() => expect(contexts.length).toBe(count + 1));
    return contexts[count]!;
  }
  async function finish() {
    release();
    await vi.waitFor(() => expect(chat.busy('hangout')).toBe(false));
  }
  it('offers stable project tools to both public seats and binds every call to Sid’s selection', async () => {
    const unattached = await turn('a', 'no-project');
    const tools = unattached.tools!.map((tool) => tool.name);
    expect(tools).toContain('project_read');
    await expect(unattached.tool('project_read', { path: 'code.ts' })).rejects.toThrow(
      /not attached/,
    );
    await finish();
    chat.setHangoutProject({ path: project });
    await chat.onModuleDestroy();
    chat = open();
    expect(chat.hangoutProject()).toEqual({ path: project });
    for (const seat of ['a', 'b'] as const) {
      const context = await turn(seat, 'work-' + seat + '-request');
      expect(context.tools!.map((tool) => tool.name)).toEqual(tools);
      expect(context.requiredToolVersion).toBe(HANGOUT_TOOL_VERSION);
      expect(context.instructions).toContain(JSON.stringify(project));
      expect(() => chat.detachHangoutProject()).toThrow(/finish before changing/);
      await expect(context.tool('project_attach', { path: dir })).rejects.toThrow(/unavailable/);
      expect(await context.tool('project_read', { path: 'private-input' })).toBe(
        'private-file-result',
      );
      expect(broker).toHaveBeenLastCalledWith(
        project,
        'project_read',
        { path: 'private-input' },
        context.controller.signal,
      );
      await finish();
      await expect(context.tool('project_read', { path: 'old-turn' })).rejects.toThrow(
        /unavailable/,
      );
    }
    expect(JSON.stringify(chat.correspondence('hangout'))).not.toMatch(
      /private-input|private-file-result/,
    );
    const before = contexts.length;
    chat.submitSide('hangout', 'a', {
      text: 'hello',
      requestId: 'whisper-message',
      expectedRevision: chat.hangout().revision,
    });
    await vi.waitFor(() => expect(contexts.length).toBe(before + 1));
    expect(contexts.at(-1)?.tools?.some((tool) => tool.name.startsWith('project_'))).toBe(false);
    expect(contexts.at(-1)?.instructions).not.toContain(project);
    expect(chat.detachHangoutProject()).toEqual({ path: null });
  });
  it('keeps runtime state out of attachments while allowing the workspace source module', async () => {
    const room = join(dir, 'arena', 'room');
    const managed = join(dir, 'managed-private');
    const control = join(dir, 'control-private');
    const data = join(dir, 'state-private');
    const provider = join(dir, 'provider-private');
    vi.stubEnv('ROOM_WORKSPACE', room);
    vi.stubEnv('ROOM_MANAGED_WORKSPACE_ROOT', managed);
    vi.stubEnv('ROOM_CONTROL_HOME', control);
    vi.stubEnv('ROOM_DB_PATH', join(data, 'chat.sqlite'));
    vi.stubEnv('CODEX_HOME', provider);
    const source = join(room, 'src', 'workspaces');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'package.json'), '{}');
    expect(chat.setHangoutProject({ path: source })).toEqual({ path: source });
    for (const root of [
      join(dir, 'arena', 'workspaces', 'run', 'b'),
      join(managed, 'run', 'a'),
      control,
      data,
      provider,
      join(dir, 'secrets'),
    ]) {
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}');
      expect(() => chat.setHangoutProject({ path: root })).toThrow(/project root/);
    }
    // A later deployment can relocate its control data onto a formerly valid binding.
    vi.stubEnv('ROOM_CONTROL_HOME', source);
    const context = await turn('a', 'changed-control');
    await expect(context.tool('project_list', {})).rejects.toThrow(/folder changed/);
    expect(broker).not.toHaveBeenCalled();
    await finish();
  });
  it('holds the project binding until a stopped turn’s tool has finished cancelling', async () => {
    chat.setHangoutProject({ path: project });
    const context = await turn('b', 'inflight-project');
    let complete!: (value: string) => void;
    broker.mockImplementationOnce(
      async () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    );
    const operation = context.tool('project_run', { argv: ['node', '--version'] });
    await chat.stop('b', 'hangout');
    expect(context.controller.signal.aborted).toBe(true);
    expect(() => chat.detachHangoutProject()).toThrow(/finish before changing/);
    complete('cancelled');
    await operation;
    expect(chat.detachHangoutProject()).toEqual({ path: null });
  });
  it('rejects broad and hidden attachments and invalidates moved, linked or replaced folders', async () => {
    const hidden = join(dir, '.ssh');
    mkdirSync(hidden);
    for (const path of ['/', homedir(), dirname(homedir()), hidden, 'relative', dir])
      expect(() => chat.setHangoutProject({ path })).toThrow(/absolute|project root/);
    writeFileSync(join(project, 'package.json'), '{}');
    chat.setHangoutProject({ path: project });
    const context = await turn('a', 'folder-swap');
    const moved = join(dir, 'moved');
    renameSync(project, moved);
    symlinkSync(moved, project);
    await expect(context.tool('project_list', {})).rejects.toThrow(/folder changed/);
    rmSync(project);
    mkdirSync(project);
    await expect(context.tool('project_list', {})).rejects.toThrow(/folder changed/);
    expect(broker).not.toHaveBeenCalled();
    await finish();
  });
});
