import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatStore } from '../../apps/api/dist/chat/chat.store.js';
import { ChatService } from '../../apps/api/dist/chat/chat.service.js';
import { DebateService } from '../../apps/api/dist/debate/debate.service.js';
import { WorkspaceManager } from '../../apps/api/dist/workspaces/workspace-manager.js';

const directory = mkdtempSync(join(tmpdir(), 'arena-messaging-probe-'));
const store = new ChatStore(':memory:', directory);
const runId = store.runs.currentId();
const events = [];
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const factory = (binding) => ({
  info: {
    id: binding.role,
    name: binding.role,
    ...binding.config,
    runtime: 'probe',
    status: 'ready',
  },
  run: async (context) => {
    context.append('Progress pushed before completion.');
    await gate;
    context.append(' Completed output.');
  },
});
const chat = ChatService.forTest(
  store,
  {
    a: factory(store.runs.binding(runId, 'a')),
    b: factory(store.runs.binding(runId, 'b')),
  },
  directory,
  { runtimeFactory: factory },
);
const subscription = chat.events('a', runId).subscribe(({ data }) => {
  events.push({ status: data.status, reply: data.messages.at(-1) });
});
let debate;
try {
  const receipt = await chat.submit(
    'a',
    {
      requestId: 'probe-first-turn',
      text: 'Synthetic fixture only.',
    },
    runId,
  );
  assert.ok(events.some((event) => event.reply?.text.includes('Progress pushed')));
  await assert.rejects(
    chat.submit(
      'a',
      {
        requestId: 'probe-busy-input',
        text: 'Synthetic follow-up while working.',
      },
      runId,
    ),
    /already replying/,
  );
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(
    events.some(
      (event) => event.reply?.id === receipt.turnId && event.reply.status === 'completed',
    ),
  );
  const manager = new WorkspaceManager({ controlRoot: join(directory, 'control') });
  debate = DebateService.forTest(chat, manager);
  debate.saveTask(runId, {
    expectedRevision: chat.run(runId).revision,
    task: {
      question: 'Synthetic task-policy probe.',
      mode: 'reasoning',
      expectedArtifact: 'No real artifact.',
      criteria: ['No external calls'],
      grounding: [],
      source: null,
      profile: 'analysis',
      maxHandoffs: 1,
      timeLimitSeconds: 60,
    },
  });
  await assert.rejects(
    chat.submit(
      'a',
      {
        requestId: 'probe-structured-input',
        text: 'Synthetic follow-up after completion.',
      },
      runId,
    ),
    /Use the task controls/,
  );
  console.log(
    JSON.stringify(
      {
        progressPushedBeforeCompletion: true,
        completionPushedWithoutPolling: true,
        busyHumanInputRejected: true,
        structuredTaskRejectsHumanChatEvenWhenIdle: true,
      },
      null,
      2,
    ),
  );
} finally {
  release();
  subscription.unsubscribe();
  debate?.onModuleDestroy();
  await chat.onModuleDestroy();
  rmSync(directory, { recursive: true, force: true });
}
