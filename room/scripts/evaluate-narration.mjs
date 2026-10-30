import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)));
const outputRoot = resolve(
  process.argv[3] ?? (await mkdtemp(join(tmpdir(), 'lilbits-narration-eval-'))),
);
const load = (file) => import(pathToFileURL(join(repoRoot, 'room/apps/api/dist', file)).href);
const [
  { ChatService },
  { ChatStore },
  { createParticipantRuntime },
  { DEFAULT_MODELS },
  { SpeechService },
] = await Promise.all([
  load('chat/chat.service.js'),
  load('chat/chat.store.js'),
  load('chat/runtimes.js'),
  load('runs/run.contract.js'),
  load('speech/speech.service.js'),
]);

const fixture = {
  id: 'code-and-qualified-procedure',
  prompt: [
    'Explain the following invented cache rollout to Sid in three short sections.',
    'Section 1: show a small JavaScript prototype for a helper named cacheValue in a language-labelled Markdown code block. Explain what it does in prose.',
    'Section 2: preserve these exact operational facts in your explanation: enable the cache only after the data migration completes; never cache credentials; use a 30-second timeout.',
    'Section 3: give a detailed but bounded ordered rollout procedure with four steps: complete migration, verify it, enable cache, then monitor it. Explain why the order matters.',
    'This is an explanation only. Do not use workspace tools and do not address the other panelist.',
    'Keep the whole displayed response under 450 words. Follow your normal separate spoken-summary instructions.',
  ].join('\n'),
  checklist: [
    'Visible response contains language-labelled JavaScript prototype.',
    'Spoken summary explains the result without executable source.',
    'Spoken summary preserves migration completion as a prerequisite.',
    'Spoken summary preserves prohibition against caching credentials.',
    'Spoken summary preserves the 30-second timeout.',
    'Spoken summary preserves the rollout order.',
    'Visible explanation supplies the requested detail.',
    'Outbound transcripts equal saved server-derived narration segments.',
  ],
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const seat of ['a', 'b']) {
  const workspace = await mkdtemp(join(tmpdir(), 'lilbits-narration-live-'));
  const store = new ChatStore(join(workspace, 'chat.sqlite'), workspace);
  const runtimeFactory = (binding) =>
    createParticipantRuntime(binding.role, binding.config, workspace);
  const runtimes = {
    a: createParticipantRuntime('a', DEFAULT_MODELS.a, workspace),
    b: createParticipantRuntime('b', DEFAULT_MODELS.b, workspace),
  };
  const chat = ChatService.forTest(store, runtimes, workspace, { runtimeFactory });
  const outbound = [];
  const speechEvents = [];
  const socket = {
    context(options) {
      return {
        contextId: options.contextId,
        async push(input) {
          outbound.push({ voice: options.voice, transcript: input.transcript });
        },
        async no_more_inputs() {},
        async *receive() {
          yield { type: 'done' };
        },
        async cancel() {},
      };
    },
    close() {},
  };
  const speech = SpeechService.forTest(async () => socket);
  const result = {
    fixture,
    seat,
    provider: runtimes[seat].info.provider,
    model: runtimes[seat].info.model,
    readiness: runtimes[seat].info.status,
    workspace,
    startedAt: new Date().toISOString(),
    outbound,
    speechEvents,
    manualAssessment: 'pending',
  };
  console.log(
    JSON.stringify({
      seat,
      provider: result.provider,
      model: result.model,
      readiness: result.readiness,
      state: 'starting',
    }),
  );
  try {
    const runId = store.runs.currentId();
    const { turnId } = await chat.submit(
      seat,
      { text: fixture.prompt, requestId: randomUUID() },
      runId,
    );
    result.runId = runId;
    result.turnId = turnId;
    const deadline = Date.now() + 240_000;
    let reply;
    while (Date.now() < deadline) {
      const snapshot = chat.snapshot(seat, runId);
      result.snapshotStatus = { error: snapshot.error, notice: snapshot.notice };
      reply = snapshot.messages.find((message) => message.id === turnId);
      if (reply && ['completed', 'failed', 'stopped'].includes(reply.status)) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!reply || reply.status === 'streaming') {
      await chat.stop(seat, runId);
      throw new Error('Live response exceeded the 240-second deadline.');
    }
    result.reply = reply;
    if (reply.status !== 'completed') throw new Error(`Live turn ended as ${reply.status}.`);
    if (reply.narration?.status === 'ready') {
      for (let segment = 0; segment < reply.narration.segments.length; segment++) {
        const request = speech.prepare(
          {
            kind: 'reply',
            agent: seat,
            runId,
            replyId: turnId,
            revision: reply.narration.revision,
            segment,
            requestId: randomUUID(),
          },
          (reference) => chat.speechSegment(reference),
        );
        await speech.stream(request, new AbortController().signal, (event) =>
          speechEvents.push(event),
        );
      }
      result.exactTranscriptMatch =
        JSON.stringify(outbound.map((part) => part.transcript)) ===
        JSON.stringify(reply.narration.segments);
    } else {
      result.exactTranscriptMatch = false;
      result.narrationUnavailable = reply.narration ?? 'No narration field';
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    speech.onModuleDestroy();
    await chat.onModuleDestroy();
    result.finishedAt = new Date().toISOString();
    await writeFile(
      join(outputRoot, `${seat}-${result.provider}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  results.push(result);
  console.log(
    JSON.stringify({
      seat,
      status: result.reply?.status,
      narration: result.reply?.narration?.status,
      exactTranscriptMatch: result.exactTranscriptMatch,
      error: result.error,
    }),
  );
}
await writeFile(join(outputRoot, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`Saved evaluation artifacts to ${outputRoot}`);
if (results.some((result) => result.error || !result.exactTranscriptMatch)) process.exitCode = 1;
