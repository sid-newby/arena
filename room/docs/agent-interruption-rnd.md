# Agent messaging while work continues

Sid should be able to send a correction, queue a follow-up, or open a separate
conversation while a debate seat works. The room should acknowledge the message
immediately and push its subsequent state. This research was performed on
October 30, 2026, after the speech fixes landed in PR #1. It changes no production
messaging behavior.

## Finding

Both subscribed providers already support live turn control. The room's UI,
execution policy, and one-turn runtime interface prevent it from using those
capabilities. Agent replies already push through server-sent events. Polling
remains in workflow reconciliation, correspondence delivery, and Maestro setup.

Initial progress speech stays unchanged. The speech endpoint accepts only
completed replies with a saved spoken summary. Speaking a progress fragment
would require a separate narration contract, and Sid explicitly accepted leaving
these fragments silent.

## Where input is blocked

| Owner | Current behavior | Consequence |
| --- | --- | --- |
| `AgentPanel.targetAvailable` and Send rendering | Working human turns are unavailable; only Stop is shown. | A draft can be written but cannot be sent while the seat works. |
| `ChatService.submitInternal` | Rejects a second human turn while another human/workflow turn is active. | Removing the UI restriction alone produces a conflict. |
| `DebateService.attach` submit policy | Rejects ordinary human messages whenever a structured task exists, including idle boundaries. | Human follow-ups need an explicit workflow policy, not just a new busy-state check. |
| `AgentRuntime.run` and `TurnContext` | One prompt, one append callback, one completion, and AbortController. | No public handle for steering, input delivery, or independent side sessions. |
| Codex adapter | Local client closes at the end of one turn. | Native queue auto-drain can outlive the room's reply bookkeeping. |
| Claude adapter | Input generator yields once, then ends; Query closes after one result. | Native persistent input and control methods are hidden. |

Relevant source is in [AgentPanel](../apps/web/src/components/agent-panel.tsx),
[ChatService](../apps/api/src/chat/chat.service.ts),
[DebateService](../apps/api/src/debate/debate.service.ts),
[runtime types](../apps/api/src/chat/chat.types.ts),
[Codex adapter](../apps/api/src/chat/codex.runtime.ts), and
[Claude adapter](../apps/api/src/chat/runtimes.ts).

## Provider experiments

All live probes used isolated sessions, synthetic prompts, subscription sign-in,
and no workspace tools. They did not touch the current room run, private task
text, saved narration, or Cartesia. Side-session forking was inspected in the
installed protocols and documentation but was not live-tested.

| Provider and installed version | Observed capability | Integration constraint |
| --- | --- | --- |
| Codex CLI 0.159.3, `gpt-6-luna` | `turn/steer` accepted input on an active turn; a stale `expectedTurnId` was rejected. The same turn produced `STEER_CONFIRMED` and a completion notification. | Steering can wait for the current model emission to finish. It does not promise an immediate stop. |
| Codex | `turn/interrupt` produced a terminal notification with status `interrupted`. | Wait for matching activation and terminal events. An interrupt before activation can lose the race. |
| Codex | Persistent `thread/queue/add` accepted a follow-up, automatically started a distinct turn after completion, and produced `QUEUE_CONFIRMED`. | Queue APIs are experimental and reject ephemeral threads. Explicit `queue/start` can race automatic drain. |
| Claude Agent SDK 0.3.310, `claude-fable-5-1`, high effort | `Query.interrupt()` during streaming followed by new input produced `FOLLOWUP_ACCEPTED` on the same Query. | The interrupt receipt can contain `still_queued` messages. Plain interrupt does not cancel provider-queued input. |
| Claude | Input with `priority: 'now'` and human origin interrupted streaming and ran the follow-up. | The interrupted result reported success but had `terminal_reason: 'aborted_streaming'`. Success alone cannot mean completed work. |
| Claude | Input with `priority: 'later'` waited for natural completion before starting the follow-up. | Match message UUIDs to response ownership; one Query can yield multiple results and repeated init frames. |

Codex steering uses `threadId`, `expectedTurnId`, a stable `clientUserMessageId`,
and text input. Interruption uses `threadId` and `turnId`. Claude input supports a
stable message `uuid`; output carries `user_message_uuid` and sometimes
`user_message_uuids` when inputs are coalesced. Partial text, summaries, usage,
tool calls, and artifacts must remain attached to the correct room turn.

The [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
describes steering, interruption, streamed completion, and forks. Codex queue
behavior above comes from the installed experimental schema and live probes.
Claude documents [persistent streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode),
[message priorities and correlation](https://code.claude.com/docs/en/agent-sdk/typescript#sdkusermessage),
[interrupt receipts](https://code.claude.com/docs/en/agent-sdk/typescript#sdkcontrolinterruptresponse),
and [session forks](https://code.claude.com/docs/en/agent-sdk/sessions).

## Recommended behavior

Keep the composer available and make each send action explicit.

- **Interrupt and send** stops the active reply, preserves its partial text,
  then starts a new reply in the same seat session after cancellation is
  acknowledged. Cancellation does not undo already completed tool side effects.
  It does not silently restart work on an ambiguous timeout.
- **Queue after this reply** persists a follow-up immediately and starts it
  after the active reply finishes. Show queued, sending, started, completed,
  failed, and cancelled states, with a way to cancel a queued message.
- **Side conversation** uses a separate session and reply history. Seed it from
  a known recorded checkpoint. Do not replace the main continuation, edit the
  active workspace, expose the other independent seat's work, or count its reply
  as the candidate's task output. Explicitly sending its conclusion back to the
  main task is a separate action.

Treat native steering as a separately named control if added. The observed Codex
behavior differs from immediate interruption, so one ambiguous Send button should
not silently select different semantics by provider.

Use an application-owned durable message queue for both providers. A send
receipt is returned after persistence, before model completion. Each record needs
run, immutable binding, configuration revision, seat, conversation lane, request
ID, delivery intent, current state, and provider message/turn IDs when known.
Repeated request IDs with matching content return the same receipt. Reject a
reused ID with different content or scope.

Dispatch only the next eligible message when a matching completion event arrives.
Keep undispatched messages in SQLite so Stop can deterministically cancel them.
Do not pre-feed the entire application queue into either provider's native queue.
After a crash or ambiguous provider acknowledgement, reconcile against provider
message IDs before retrying; blind retries can duplicate work. Changes to shared
task instructions must be recorded and applied consistently to both candidates,
while private side chats remain private.

## Replace the remaining polling

The active seat path already calls `context.append`, persists text, and emits a
snapshot to listeners. The shared [room event stream](../apps/web/src/lib/room-events.ts)
carries A, B, and Maestro updates. Its 15-second seat heartbeat is a liveness
signal, not the mechanism that delivers text or completion.

The remaining polling owners are:

- `DebateService` checks workflow completion and feedback every 200 milliseconds.
- `ChatService.correspondenceEvents` reads new correspondence every 250 milliseconds.
- `MaestroService.events` checks the correspondence cursor every second.
- `useRunSetup` refreshes while open every two seconds.

Add notifications after the outermost successful database commit. Events from
rolled-back transactions must never reach listeners. Use recorded event sequence
IDs for replay and deduplication; subscribe without a replay/live gap. Trigger
workflow reconciliation, queue dispatch, Maestro context updates, and setup
refresh from those events. Keep deadline timers and any bounded retry scheduler
separate from normal completion delivery. Recover unfinished work once at startup
and reconcile on reconnect instead of scanning all historical runs continuously.

This preserves the current SSE connection and existing provider event streams.
It does not require WebSockets or a second transport stack.

## Verification and implementation order

The deterministic [room probe](../test/scripts/agent-messaging.probe.mjs) runs real
ChatService persistence and listeners with a gated synthetic runtime. Build the
API first, then run `node room/test/scripts/agent-messaging.probe.mjs` from the
repository root. It proves progress and completion push without waiting for a
poll, busy human input is rejected, and a structured task also rejects ordinary
human chat at an idle boundary. It sends no provider requests.

Provider scripts, generated schemas, and raw probe results remain in the local
ignored `.audit/agent-interrupt-rnd/` directory. Successful observations above are
separated from failed race probes and untested fork behavior.

Implement in verifiable units:

1. Add persisted message receipts, explicit lanes/intents, and runtime control
   handles. Keep request, binding, provider turn, and message ownership distinct.
2. Add interrupt-and-send and queue delivery for ordinary seat chat, driven by
   provider terminal events. Verify races, restart recovery, cancellation, and
   Both sends where one seat is busy or fails.
3. Extend structured-task policy with recorded human interventions. Preserve
   candidate ownership, comparison gates, and shared-grounding fairness.
4. Replace the four polling paths with committed-event delivery and replay.
5. Add separate side conversations with read-only context and explicit transfer
   back to the main task. Verify session and workspace isolation.

Acceptance checks must include a correction during tool use and text streaming,
multiple queued messages, cancelling queued work, Stop with queued work, stale
turn IDs, switching runs, SSE disconnect/replay, duplicate requests, a provider
disconnect after acknowledgement, and process restart. Interrupted partial text
must never be marked completed or spoken as a completed summary.
