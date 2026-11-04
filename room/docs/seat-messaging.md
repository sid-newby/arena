# Messaging seats while they work

The main composer stays available while a seat works. Typed and spoken messages
in the public room use the `interrupt` intent. An idle seat starts the message
immediately. For a busy seat, Arena saves the new message, requests cancellation
of the current reply, and starts the replacement when the local turn ends. The API still accepts `queue` and `send` intents for
other clients; the room no longer offers them.

Both sends save an independent receipt for
each seat. If one destination fails, Retry preserves the original intent and
request ID and sends only to destinations that did not acknowledge the request.
Changing the text, destination, or delivery action creates a new request.

## Saved messages and stopping

The receipt disclosure shows delivery state separately from agent replies.
Cancel removes a queued message before it starts. If the provider never confirms
an interruption, the old delivery ends with an unconfirmed receipt. Later
messages can run without review. Stop conversation affects both main queues,
side conversations, peer deliveries, and local audio.

Interruption preserves partial text. Completed tool effects remain completed;
interrupting a reply does not undo a file edit or published artifact. Partial
stopped replies are not spoken as completed summaries.

Unsent main messages survive a server restart. If work had already been
dispatched, its receipt becomes unconfirmed. The server resumes queued messages
and skips the previously dispatched delivery. Request retries must match the
saved text, action, run, seat, binding, and accepted revision.

Structured tasks record main-seat interventions and track the resulting turn as
that seat's current output. A seat-specific message is not silently sent to the
other candidate. Closed tasks reject new main work; use a side conversation for
read-only consultation. Paused tasks keep pending main messages until the task
is resumed or those messages are cancelled.

## Side conversations

Side conversation opens a private dialog for the selected seat. The main task
continues. Closing the dialog preserves its draft and work, and sending another
side message while it is busy queues that message within the side conversation.
Its Stop control affects only that side conversation.

Side sessions have their own history and provider continuation. A new side
session starts from a bounded checkpoint of that seat's completed main replies.
It has no workspace, artifact, panel, peer, or speech tools. Its messages do not
become candidate outputs or enter the main task's session.

An unconfirmed side interruption or restart fails the affected pending side work
and resets its provider continuation. A later explicit message starts from the
saved checkpoint and bounded completed side history, excluding unfinished text.

Use in main draft copies a completed side reply into the main composer for
review. It does not submit it. Choose a delivery action and send explicitly to
apply it to the main task.

## HTTP and event contract

All endpoints are beneath `/api/runs/:runId/agents/:seat`.

| Request | Result |
| --- | --- |
| `POST /messages` with `requestId`, `text`, `expectedRevision`, and `intent` | HTTP 202 with a saved message receipt. Intent is `send`, `queue`, or `interrupt`. |
| `DELETE /messages/:id` | Cancels a queued message before it starts. |
| `GET /side-conversation` | The separate side snapshot. |
| `POST /side-conversation` with `requestId`, `text`, and `expectedRevision` | HTTP 202 with `turnId`. |
| `DELETE /side-conversation/turns/current` | Stops active and queued side work. |
| `GET /side-conversation/events` | Initial side snapshot and subsequent updates. |

Main snapshots include `humanMessages`. Receipt status is `queued`,
`dispatching`, `running`, `completed`, `stopped`, `failed`, `cancelled`, or
`uncertain`. The canonical types live in
[message.contract.ts](../apps/api/src/chat/message.contract.ts) and
[side-conversation.contract.ts](../apps/api/src/chat/side-conversation.contract.ts).

The browser shares one room event connection across A, B, Maestro, side-A,
side-B, and workflow updates. Database notifications are emitted only after a
successful outer commit. Correspondence replay uses recorded sequence IDs.
Workflow, feedback, setup, and criteria completion use pushed updates rather than
periodic status requests. Deadline, bounded retry, timeout, and liveness timers
remain separate from normal delivery.
