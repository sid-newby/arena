# Build the Luna, Opus, and Scout room

Build a localhost Vite + React app with two highly styled chat panels composed with Radix primitives. The agents respond through those panels in text and speech. Start with Luna and Opus, with Scout, also called D.O.T. or Dot, participating from Sid's desktop through a verified Codex SDK connection. The experience is colleagues sitting beside the user, talking things through and challenging questionable ideas.

This is a build handoff. No application implementation or installation has been performed for this plan. Complete the steps in order, with a usable result after each step. Do not turn the work into an orchestration platform.

## Initial lineup and model choices

| First participant | Connection | Effort | Role |
| --- | --- | --- | --- |
| `gpt-6-luna` | OpenAI Responses API | High | General-purpose agent. Base profile for research, building, and classification. |
| `opus-5-5` | Claude Agent SDK, Claude Code in build mode | High | Specialist, versatile builder. Base profile for a later orchestrator. |
| Scout / D.O.T. / Dot | Codex SDK | Preserve the intended Scout configuration | Desktop colleague participating in the conversation. |

Keep the requested model roster in configuration so the panels can change models without a UI rewrite.

- OpenAI Responses API choices: `gpt-6-astra`, `gpt-6.1-sol`, and `gpt-6-luna`.
- Claude Agent SDK choices: `fable-5.1`, `opus-5-5`, `sonnet-5-5`, and `haiku-5-5`.
- Treat these as the user's requested model names. Verify exact provider identifiers, access, and supported effort values during setup. Map display names to verified API identifiers explicitly. Show unavailable choices as unavailable; never silently substitute a model.
- Keep model choice, agent role, runtime connection, and speech provider separate. The Codex SDK is Scout's runtime connection, not a model identifier or the Responses API.
- Implement the two base agent profiles first. Additional research, classifier, and orchestrator profiles reuse them later; they are not separate first-release agents.

## 1. Stand up the supplied scaffold

- Copy `scaffolds/react-nest/template/` into `room/`, including dotfiles. Preserve the original template.
- Read the copied `AGENTS.md`, `CLAUDE.md`, and `.agents/skills/scaffold-ui/SKILL.md`.
- Keep its pnpm workspace, Vite, React, Nest, Tailwind, shadcn Radix stack, Oxc tooling, and dependency policies.
- Use the pinned Node and pnpm requirements. Run `pnpm install --frozen-lockfile` and `pnpm dev` from `room/`.
- Check existing listeners before startup. If necessary, select free ports and update the Vite proxy to match. Bind both services to loopback.
- Verify the page loads and `/api/health` succeeds through Vite.

## 2. Build and style the two chats

Use one reusable `AgentPanel` twice. Give Luna and Opus distinct visual treatments through scoped tokens and composition. Compose the panels with Radix primitives and reusable shadcn chat components. Make the chat output itself expressive through typography, color, artwork, and restrained motion. Keep the conversation readable. Record the chosen direction briefly in `DESIGN.md`.

- Put both panels side by side on desktop. Let their message areas fill the remaining height. At narrow widths, switch between agents with accessible tabs.
- Give each panel an agent name, connection/activity status, message thread, composer, send button, and stop button.
- Start with direct messages to either agent. Add a small “Both” destination option for a shared prompt.
- Use the installed shadcn CLI to inspect and add the needed chat components. The scaffold's chat reference lists `message-scroller`, `message`, `bubble`, `trace`, `code-block`, and `attachment`. Check availability and actual exports before importing them.
- Use shadcn wrappers for controls and the installed `radix-ui` primitives where a wrapper does not fit. Preserve the scaffold's Radix style and dependency policy.
- Render streamed text, Markdown, code, tool activity, and permission requests inside the conversation. Show reasoning summaries only when the runtime explicitly supplies them.
- Include empty, connecting, working, stopped, disconnected, and failed states. Keep the composer draft after a failed send.
- Keep scrolling stable during streaming. Reading an earlier message must not force the viewport back to the bottom.

Use clearly labeled fixtures to style the first screen. Replace them with live sessions in the next step. Do not present fixtures as agent output.

**Done when:** both panels look intentional at desktop and narrow widths, keyboard controls work, and long conversations and tool output fit without breaking the layout.

## 3. Connect the actual agents

Keep credentials and agent processes in Nest. Use HTTP for commands and a server event stream for chat updates. Use the Responses API for the OpenAI panel, the Claude Agent SDK for the Claude panel, and the Codex SDK for Scout.

### Luna through the Responses API

- Use the official OpenAI client to stream Responses API output from `gpt-6-luna` with high reasoning effort.
- Give Luna a general-purpose role with research, builder, and classifier capabilities. Keep its role instructions separate from the model setting.
- Implement the tool-call loop in the backend. Execute permitted tools, return their results to the model, and continue until the turn completes. The Responses API alone does not supply a local shell agent.
- Persist response/conversation identifiers and application tool state so follow-up turns retain context. Handle context limits without silently losing completed tool results.
- Implement stopping generation and cancelling application-owned tools where supported. Record completed operations accurately.
- Require Responses API credentials explicitly. Do not assume the existing Codex ChatGPT login authenticates direct API requests.
- Keep `openai/luna.ts` as a reference for the earlier Codex client. Do not reuse its app-server transport as a replacement for the requested Responses API connection.

### Opus

- Use the supported local Claude Agent SDK with persistent sessions, streaming, tools, and interruption. Run the requested Opus model at high effort with Claude Code's build capabilities. Verify exact model identifiers, effort configuration, and authentication requirements.
- Inspect `anthropic/AGENTS/builder-agent/` as reference material. It contains a definition and a managed-agent quickstart, not a running local adapter.
- Give Opus a versatile specialist-builder profile that can discuss plans and serve as the base for a later orchestrator. Do not copy the builder-only restriction against planning, and do not build an orchestration framework now.
- If the local SDK cannot use the available account, report the exact missing setup. Do not silently change to a paid managed service or a different model.

### Scout through the Codex SDK

- Include Scout in the initial participant configuration. Use the supported Codex SDK for starting, resuming, and streaming Codex work.
- Verify whether the SDK can connect to the intended existing desktop Scout session. A newly created SDK session is not automatically the same Scout, with the same context or desktop capabilities.
- Keep Scout in the desktop interface rather than adding a third full-size panel. Provide compact room presence and attributed contributions when its connection is established.
- If attaching the intended Dot session is unsupported, identify the exact missing connection. Keep the Luna and Opus build moving, but do not claim Scout is integrated or silently create a substitute identity.

### Shared behavior

- Track each agent's session, turn, messages, tool calls, and pending permission requests by stable identifiers.
- Keep a small local SQLite store for room history, runtime session identifiers, settings, and event sequence numbers. Do not add a database server.
- Make command submission idempotent. Reconnecting or refreshing must not run a tool or send a prompt twice.
- Treat runtime events as the source of execution status. On backend restart, reconcile persisted turns with the runtime; do not mark interrupted work successful or automatically replay it.
- Show each agent's actual selected model and runtime connection in a small settings dialog.
- Use explicit workspace and permission settings. Route required tool approvals into the relevant panel.
- Scope browser commands to the local application and validate their origin. Do not expose a shell-backed API to arbitrary websites.

**Done when:** Luna and Opus stream real responses, use a real tool, retain context, handle a permission request, stop an active turn, and recover from refresh without duplicate work. Scout's initial SDK connection is either verified against the intended session or reported as a specific unresolved integration.

## 4. Let them talk together

- Support direct messages and room messages. Make the destination visible before sending.
- When addressing both, send the same user message to each agent. Let both finish their first take before sharing the other's answer.
- Add “Ask Luna about this” and “Ask Opus about this” to completed messages. Use configured participant names so model changes do not require rewrites. Preserve the original speaker and content when forwarding.
- Record shared messages once in a room transcript and deliver them once to each intended participant. Keep direct messages private to their destination unless the user shares them.
- For an ongoing discussion, use a bounded conversation loop with one next speaker at a time. Allow either agent to pass. Provide an always-visible pause control and an editable turn limit, initially six agent replies.
- Give human input priority. Stop scheduling further agent replies as soon as the user interrupts.
- Do not automatically forward every output forever. Do not infer approval for tool actions from agreement between models.

**Done when:** the user can ask both agents a question, invite a critique, continue a short discussion, and pause it reliably.

## 5. Add voices to those same conversations

Add streaming speech-to-text (STT) and text-to-speech (TTS) around the existing agents. Give each panel a distinct voice. Preserve the agent's words in the spoken output. Keep speech-provider configuration separate from model selection.

- Evaluate Cartesia, OpenAI, and ElevenLabs as the requested realtime speech options. Choose one initial working speech path based on available credentials, streaming support, voice quality, and measured interruption behavior. Implement one provider first; do not build all three integrations as a prerequisite.
- Use the chosen provider's supported realtime transport and SDK. Verify STT and TTS separately; they may use different endpoints or providers. Record the selected models and voice identifiers in configuration.
- Keep a small speech adapter boundary so a later provider change does not rewrite the panels or agent connections. Prefer a provider's existing interruption and streaming support over custom audio plumbing when it fits the two-panel experience.

- Capture one microphone stream for the room. Route recognized human speech using the visible destination control, with optional spoken names after the basic flow works.
- Start with push-to-talk to verify the path. Then add voice activity detection for hands-free conversation.
- Stream completed phrases to speech synthesis. Keep code and long tool output visible, with a short explicit spoken description when appropriate.
- Use one playback queue across the two agents. They may work concurrently, but only one speaks at a time.
- On human speech, stop playback immediately, clear queued audio, and invalidate late audio chunks from the interrupted utterance.
- Distinguish stopping speech from cancelling agent work. Attempt native turn cancellation when the user redirects an agent; keep tool state accurate when an operation has already completed or cannot be cancelled.
- Track playback progress. Mark the unspoken portion of an interrupted response so the next turn does not assume the user heard it.
- Prevent synthesized speech from being treated as a new human prompt. Verify echo behavior with speakers as well as headphones.
- Show microphone permission errors, muted state, voice connection failures, and a usable text fallback.
- Keep long-lived provider keys on the server. Use short-lived client tokens where the selected provider supports direct browser audio. Verify speech access separately from Responses API, Codex SDK, and Claude authentication.

Keep Luna and Opus responsible for the substantive replies. If evaluating a conversational voice model instead of direct TTS, verify that it faithfully delivers the selected agent's answer and does not become an unlabelled replacement participant.

**Done when:** the user can speak to either agent, hear distinct replies, interrupt mid-sentence, and continue without stale playback or duplicate turns. Measure speech-end-to-first-audio and interruption-to-silence during the live check; report the actual results rather than promising latency in advance.

## 6. Bring Scout into the conversation

Complete the desktop participation check for the Scout connection introduced in step 3. Keep Scout in Dot as requested. Check which supported mechanisms the actual desktop interface exposes for receiving room output and contributing speech or text.

- Prefer a supported audio or message connection if one exists.
- If participation relies on desktop audio, test input selection, microphone sharing, speaker attribution, echo, and interruption with the real applications.
- Do not assume browser microphone capture includes Dot's output. Do not label captured Scout speech as the human.
- Use explicit copy/share as an interim path if necessary, and describe that limitation honestly. Do not count manual sharing as completed live participation.
- Avoid screen scraping, simulated typing, or transcript-file polling to manufacture an integration.

**Done when:** Scout can receive a room contribution and contribute a reply through a verified route. This integration remains unproven until tested in Dot.

## Verify and hand off

Run the scaffold's lint, format check, typecheck, build, unit tests, and API end-to-end tests. Add focused tests for duplicate event delivery, destination routing, permission responses, cancellation, and stale audio suppression.

Drive the real browser at desktop and narrow widths. Verify keyboard focus, message scrolling, errors, reconnects, and reduced motion. Test live agent tools and speech separately from mocked UI checks. Save screenshots of the two styled panels and record what was actually verified.

Deliver the runnable app, a short setup README, required authentication and speech configuration, test results, screenshots, and any specific remaining integration limitations. Finish the text experience before starting voice work. Do not publish or deploy as part of this local build.

## Builder starting prompt

> Read BUILD-PLAN.md and implement it in order under room/, using scaffolds/react-nest/template/ as the Vite scaffold. Build two highly styled Radix-based chat panels. Start with gpt-6-luna at high effort through the Responses API and opus-5-5 at high effort through the Claude Agent SDK in build mode. Include Scout/Dot through a verified Codex SDK connection to the intended desktop participant. Add streaming STT/TTS using one initial provider selected from Cartesia, OpenAI, and ElevenLabs. Reuse components and SDK capabilities. Make routine implementation choices yourself. Verify each working increment in the browser. Keep progress updates short and identify real account or integration blockers precisely.

## Sources

- Local scaffold conventions and chat component reference under `scaffolds/react-nest/template/`.
- Existing Codex transport in `openai/luna.ts` and its `README.md`.
- Anthropic reference definition under `anthropic/AGENTS/builder-agent/`.
- [OpenAI agent runtime choices, including Responses API](https://developers.openai.com/api/docs/guides/agents).
- [Codex platform and SDK](https://developers.openai.com/blog/codex-as-a-platform).
- [OpenAI voice architecture](https://developers.openai.com/api/docs/guides/voice-agents).
- [GPT-Live and client delegation](https://developers.openai.com/api/docs/guides/live).
- [ElevenLabs realtime TTS](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts).
- [ElevenLabs realtime STT](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime).
