# Cartesia speech in arena

TTS only. Luna and Opus share one server-side Cartesia WebSocket with isolated
contexts. A room playback queue schedules incoming 44.1kHz float32 PCM chunks
through Web Audio. It plays one speaker at a time; synthesis contexts can be
independent. No microphone or STT path is installed.

Speech starts off. Enable speech explicitly to send narration for new completed
replies to Cartesia. Enabling baselines existing and active replies; reconnect, preview,
stop, or turn failure clears playback and prevents old/late content being read.
The fixed voice sample buttons are separate from automatic reply speech. Stop
audio cancels the request and all scheduled sources. End-to-end timeout is45s;
AudioContext unlock timeout is5s. No automatic synthesis retry is performed.

## Saved narration

Agents author a separate spoken summary with the `summarize_speech` tool. Detailed
answers and language-labelled code blocks remain visible in the panel. The
server derives narration from the saved summary after a reply completes, checks
for common source-code patterns, removes Markdown formatting, and divides the
text into segments that prefer sentence boundaries. It does not truncate the
remaining text. Missing or rejected summaries produce no speech and show a reason.

The browser sends a run, agent, reply, narration revision, and segment index to
`POST /api/speech/stream`. The server resolves the exact transcript from the
saved reply. It rejects caller-supplied text, another run, incomplete replies,
stale revisions, and invalid segments before synthesis. Voice tests use a fixed
server phrase. Each completed reply has a Spoken summary disclosure with the
derived narration or its unavailable reason. Each panel also has a fullscreen
toggle. Fenced code has language labels and scrollable formatting.

The routing boundary prevents the playback API from accepting raw panel text.
Detecting arbitrary source inside a generated summary remains heuristic. Summary
fidelity needs evaluation against the original response and its material facts.
The [improvement plan](model-response-plan.md) records the acceptance cases.

Run `task narration:eval` from the repository root after installing dependencies.
This opt-in task uses both subscribed model providers with temporary databases
and a fake Cartesia connection. It sends no audio requests to Cartesia. Inspect
the printed output directory for visible replies, summaries, exact outbound
transcripts, and the fixture checklist. Model output varies, so review meaning
instead of comparing exact wording. Temporary artifacts are retained for review.

## Configuration and startup

Voice IDs are public constants in apps/api/src/speech/speech.service.ts:
Luna064b17af-d36b-4bfb-b003-be07dba1b649;
Opus365dc2a1-3832-4437-b946-0bad694fc0e6. Model sonic-3.6; neutral defaults.
Optional per-segment generation_config supports typed speed, volume and emotion.
The server validates it; no automatic emotion classifier is installed.

Official @cartesia/cartesia-js4.2.0 pins Cartesia-Version2026-08-14. The public CJS
TTSWS entry is loaded using createRequire: the SDK's ESM file uses require('ws')
inside a try/catch and can silently select native WebSocket with query auth.
Offline tests assert wss, Bearer headers, version and an empty URL query. An error
listener is attached before connecting; errors returned to clients are sanitized.

The key never belongs in Vite variables or browser code. The service captures
CARTESIA_API_KEY into module memory and immediately deletes it from process.env
before agents spawn. The approved optional launcher fetches the latest version
of the CARTESIA_API_KEY secret in the CARTESIA_GCP_PROJECT project using existing gcloud auth,
captures stdout privately, disables gcloud file logging and passes the key only
in the child environment. It does not log, store, copy .env, or set up credentials.

Build the API, then (after stopping only this app's existing idle Nest watcher):

    node scripts/start-with-cartesia.mjs

An existing listener on58242 must be coordinated with its owner. Do not start a
second watcher or terminate unrelated services. Frontend remains on58241.

## Verification in this task

- API and web typechecks/builds passed;55backend tests and5queue tests passed.
- Offline coverage includes shared-connection interleaving, context cancellation,
  duplicate segments, no history replay, alternating playback order, late audio,
  starved fetch timeout, header authentication and handshake errors.
- GCP latest-secret access succeeded without displaying/storing the value.
- One explicit Luna test-button attempt produced no confirmed completion; it was
  not retried. Browser control later became unavailable during concurrent use.
- One explicit Opus HTTP test ('Hello, this is Opus speaking.') succeeded:
  12audio chunks,366912PCM bytes,2.08seconds, non-silent samples.
- Live browser speaker playback is NOT verified. Concurrent user turns arrived
  while automatic speech was briefly enabled during the earlier UI check, so
  the total provider request count cannot be certified from browser observations.
  Fixed sample playback was subsequently separated from automatic reply speech.
- No agent/model prompts were sent by this task; existing concurrent turns were
  left alone. No additional live synthesis retries were made.
