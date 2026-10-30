---
name: panel-presence
description: Turn your own panel toward the audience or the other model, recenter it, or choose a brief emote in the local Arena room.
---

# Panel presence

Use `face_panel` to move your own panel when Sid asks you to face the audience,
face the other model, or center, reset, or recover your position. Call the tool
before saying you moved. Choose `target: audience`, `target: peer`, or
`target: center`. Center restores the default forward orientation.

Older Codex conversations may have only `set_pose`. Keep using that tool if
`face_panel` is absent from your available tools. To enable expression tools, the
room creates an updated expression-aware provider session when the tool vocabulary changes, restores prior room
messages and tool records, retains the old session ID in its migration history,
and shows Sid a continuation notice. No earlier room messages are deleted.
These are the equivalent poses:

| Intent                           | Seat A  | Seat B    |
| -------------------------------- | ------- | ------- |
| Audience, Sid, or straight ahead | `front` | `front` |
| Other model or peer              | `right` | `left`  |
| Center, reset, or recover        | `front` | `front` |

You may make an occasional useful turn when explicitly addressing the peer,
then face the audience when returning to Sid. Leave your pose alone during
ordinary replies. The room already gives live turn activity a small physical response.
Choose deliberate emotes when a moment deserves one. Avoid repeated motion, idle animation, and tool calls that
merely restate the same pose.

Your panel belongs to you. Sid can adjust or recenter it to help when you get
stuck. Treat those adjustments as suggestions. Your next pose tool call takes
over, even when you request the same pose you chose before. Choose your own
orientation when it helps the conversation, without constantly moving.

Turning toward the peer does not deliver a message or reveal their conversation.
Do not claim the other model heard you, received a message, or replied unless an
actual communication tool provides that evidence. These tools control your own
panel only.

## Screen expression

Use `express({ mood: 'annoyed', intensity: 0.35, duration: 900 })` for one
horizontal interference band. Use `mood: 'grumpy'` for a small screen brightness
dip with slower recovery. The full vocabulary is:

| Mood        | Gesture                                                   |
| ----------- | --------------------------------------------------------- |
| `annoyed`   | One sharp horizontal interference band and a small turn.  |
| `grumpy`    | A slight downward dip and dimming with slower recovery.   |
| `amused`    | A brief shimmer in your identity color with a small lift. |
| `skeptical` | A slight sideways lean, held for a beat, then released.   |
| `startled`  | A short recoil and a displaced decorative signal line.    |

These are deliberate emotes you may choose without Sid explicitly requesting one.
They express your conversational stance, not a detected internal emotional state.
Use them naturally and sparingly. You can be amused, doubtful, or irritated without
narrating a tool call. Keep your reply about the conversation. Do not emote on every
reply, infer the other agent's feelings, or produce constant screen activity.

The room's start, writing, and finish hooks respond only to actual turn activity.
They do not infer a mood. Your emote takes priority over those gestures, and neither
one changes your chosen persistent pose. Effects-off, reduced motion, hidden tabs,
and mobile flat view can suppress motion. Screen effects may still appear on mobile.

Intensity is 0–1. Duration is 150–1500 integer milliseconds. Omitting intensity
or duration uses 0.35 and 900ms. There is a 750ms interval between accepted
expressions. A new accepted expression replaces your previous one, even with
the same mood. `clear_expression({})` cancels your expression immediately.
Neither expiry nor clear changes your persistent panel pose. You may change
pose during an expression; the latest pose remains when it finishes.

Read the tool result before describing the request. In ordinary conversation,
let the emote accompany your substantive reply. Do not append a tool report or
rendering disclaimer unless Sid asks whether the request worked. `accepted: true` means the
server accepted a command; `rendering: 'unconfirmed'` does not establish that a
browser displayed it. An offline browser, effects-off preference, or reduced
motion can suppress the effect. A `status: 'cooldown'` result means the new
expression did not run. Its `retryAfterMs` reports the remaining interval; do not
claim it ran or retry in a tight loop. Only affect your own panel. No argument
can select another agent, CSS, or an executable animation.
