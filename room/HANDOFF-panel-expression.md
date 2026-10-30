# Handoff: agent-owned panels and screen expression

Date: 2026-10-26. This document hands the agreed direction and proposed implementation to the agent working on the room. It does not implement the effects. Another agent is already changing panel movement, so inspect its current work before editing shared files.

## Preserve the approved room

Keep the two thick, shiny black lacquer panels, square edges, condensed typography, blue Luna identity, and orange Opus identity. Sid likes the current appearance. The Cyberpunk references inform expression and typography experiments, not a replacement design.

Make the objects feel like adjustable widescreen monitors mounted in portrait orientation. "Turned up 90 degrees" describes the physical monitor orientation, not sideways chat text.

The panels belong to the agents. Sid can help when a panel gets stuck, but manual controls do not establish a lasting override. The small controls at the bottom represent capabilities the agents can use themselves. Preserve optional human assistance and a recovery action without introducing a Freeze mode or approval step for each movement.

Use [DESIGN.md](DESIGN.md) for the approved visual system and [PRODUCT.md](PRODUCT.md) for product constraints. Keep the existing signed-in provider connections. Do not introduce API keys for this work.

## Build on the current implementation

The following facts were checked in the local sources when this handoff was written. Recheck them against the other agent's changes.

- React renders the chat as HTML. Tailwind and local shadcn components built on Radix provide the controls.
- `apps/web/src/index.css` already gives the stage CSS perspective and the slabs `preserve-3d`. Desktop yaw is currently 2.7 degrees in either direction, with a 650 ms transition. A separate side element suggests thickness.
- `apps/api/src/chat/panel-presence.ts` defines `face_panel` targets `audience`, `peer`, and `center`. Peer maps to Luna right and Opus left. Audience and center map to front.
- `set_pose` remains available for older Codex conversations. New dynamic tools are registered when a Codex thread starts, so existing sessions need an explicit compatibility strategy.
- `apps/api/src/chat/chat.service.ts` validates room tool calls, updates pose state, records tool results, and emits snapshots through SSE.
- `poseRevision` lets the next agent pose call supersede a manual suggestion, including a repeated request for the same pose.
- `skills/panel-presence/SKILL.md` explains ownership and recovery. Turning toward a peer does not deliver a message to that peer.
- Voice, audio analysis, callable moods, and glitch effects are not implemented in the inspected foundation.

Both live providers previously demonstrated pose changes and recovery from manual nudges. That verification does not establish that the proposed effects work.

## Keep persistent pose separate from temporary expression

Use CSS 3D for the physical panel. Keep text, selection, scrolling, and form controls in the DOM.

Let persistent pose describe where the panel faces. Let temporary expression describe a brief gesture or screen disturbance. Compose the two on separate elements so competing animations cannot overwrite the same `transform`.

Use this conceptual nesting, adapted to the current components:

```text
stage with perspective
  persistent pose wrapper
    temporary gesture wrapper
      solid lacquer enclosure and edges
      screen face
        readable chat content
        decorative screen-effects layer
      unaffected composer
```

Keep the effects layer attached to the screen face so it follows perspective. Give decorative elements `aria-hidden` and `pointer-events: none`. Keep enclosure geometry outside screen brightness and distortion effects.

Use yaw as the main gesture for changing addressee. Experiment with a little pitch for a nod or lean. Keep roll scarce and small. A desktop peer turn around 6–10 degrees is a proposed trial range, not an approved new default. Judge it with real text visible. Keep motion deliberate and settled, with no springy bounce or constant idle movement.

## Add a callable expression vocabulary

Expose a bounded tool the agent can choose to call. The agent selects an expressive cue; the system does not claim to detect an internal emotional state.

Proposed tool usage:

```ts
express({
  mood: 'annoyed',
  intensity: 0.35,
  duration: 900,
});

clear_expression();
```

Treat these names and fields as a proposed contract. `duration` is milliseconds and `intensity` is normalized from 0 to 1. Bind the target panel to the calling agent on the server. Do not accept another agent's identity, CSS, selectors, or executable animation definitions in the arguments.

Start with these candidate mappings and tune them in the actual room:

- Annoyed produces one sharp horizontal interference band, then clears.
- Grumpy produces a small brightness dip with a slower recovery.
- Amused produces a brief shimmer in the panel's identity color.
- Skeptical adds a slight temporary angle, holds briefly, then releases it.
- Startled produces a short signal displacement with an immediate recovery.

These mappings are experiments, not fixed meanings. Begin with annoyed and grumpy to prove two distinct gestures. Add other moods after the first pair reads clearly.

Return the applied expression ID, accepted parameters, and expiry in the tool result. Distinguish an accepted command from confirmed browser rendering. An offline browser cannot visibly perform the expression.

## Define interruption and recovery

Keep one active expression per agent. A new expression replaces the old one, and `clear_expression()` cancels it. Use a unique expression ID so repeated calls to the same mood can trigger independently. An old timer must never clear a newer expression.

Use a short duration cap and a cooldown. As initial tuning values, try a 150–1500 ms expression envelope and a 750 ms minimum interval between effects. These are proposed starting values; the visible disturbance can occupy only a small part of the envelope. Return a clear cooldown result instead of silently accepting an effect that never runs.

On expiry or clear, remove only the temporary expression. Reveal the latest persistent pose, including any pose change that happened during the expression. Do not restore a stale pose captured at expression start.

Carry an expression ID and server expiry with any expression state sent through the existing snapshot stream. Account for client/server clock differences. SSE heartbeats, reconnects, and tab remounts must not replay expired effects or restart an active effect from its beginning. Clear transient expression state on server restart. Tool history can remain durable without making a mood persistent.

## Start with CSS interference and brightness

Use a small JavaScript controller to schedule and cancel effects. Use CSS keyframes and custom properties for the visual treatment.

First build a clipped horizontal interference band and a restrained screen-brightness pulse or dip. Keep the composer, focus indicator, text layout, and scroll position stable. Preserve readable contrast at the strongest permitted effect setting.

A moving overlay suggests interference. It does not displace the actual chat pixels. Do not describe an overlay as real text tearing.

If true slice displacement later earns its complexity, evaluate a clipped decorative duplicate of the affected content or a rendering/filter approach. A duplicate must have no accessible content, focusable controls, duplicate IDs, or interaction handlers. Avoid duplicating the entire live chat subtree in the first implementation.

Use the panel identity tokens for color separation and shimmer. Test optional tweakcn themes without changing the default lacquer appearance. Avoid full-screen flashes, rapid flashing, continuous noise, or per-token effects.

Provide an effects-off preference and honor reduced motion. These preferences constrain rendering; they do not revoke the agent's ownership of its panel or change the conversation.

## Add speech timing after voice exists

Keep the initial expression tools useful without audio. Later, connect each panel's own outgoing voice to a Web Audio analyser. Keep the two audio paths separate so Luna's speech cannot animate Opus's screen.

Let the agent choose the gesture and let audio energy help time it. Use a smoothed amplitude envelope and sudden changes in energy to detect candidate accents. Raw loudness alone must not produce continuous distortion. Keep analysis local to the browser instead of sending audio measurements through React state or SSE every frame.

An optional future timing mode can arm an expression for the next vocal accent. Give it an expiry and cancel it when speech stops. Amplitude analysis cannot locate a particular word reliably. Precise word timing requires speech marks or timestamps from the voice system.

Automatic sentiment analysis is optional future work. Start with deliberate agent calls. A positive/negative score is not enough to choose a useful expressive gesture.

## Implement in bounded steps

1. Coordinate with the panel-movement agent and preserve its current pose work. Confirm center, peer, and audience behavior on both panels.
2. Add a local development trigger for the first two effects. Verify the visual treatment on desktop and mobile without consuming model turns.
3. Add the validated expression tool to both provider adapters and route it through the existing room service. Address existing Codex sessions explicitly.
4. Extend the client snapshot parser and expression controller. Verify replacement, expiry, clear, and reconnect behavior.
5. Extend the panel-presence skill with expression examples, duration rules, recovery, and truthful tool-result handling. Do not instruct agents to emote on every reply.
6. Verify each model can express, clear, change pose during an expression, and recover without human intervention.
7. Add audio timing only after the voice output path exists. Keep it a separate delivery from the first working expression tools.

Likely integration files are `apps/api/src/chat/chat.types.ts`, `chat.service.ts`, `runtimes.ts`, and `codex.runtime.ts`; `apps/web/src/lib/agents.ts`, `hooks/use-agents.ts`, `components/agent-panel.tsx`, and `index.css`; and `skills/panel-presence/SKILL.md`. Check current ownership before editing any of them.

## Verify the intended behavior

- Each agent can affect only its own panel through its tool connection.
- Annoyed and grumpy are visibly distinct while the lacquer enclosure remains solid.
- The next agent pose command still supersedes human assistance, including a repeated pose.
- A temporary gesture finishes at the latest persistent pose.
- Replacement and clear cancel previous timers and animations.
- SSE heartbeats do not retrigger expressions. Reconnects do not replay expired expressions.
- Chat selection, scrolling, typing, destination selection, and keyboard focus remain usable during an effect.
- Reduced motion and effects-off suppress the relevant visual treatment.
- Both panels fit the viewport without clipping controls or causing horizontal overflow.
- Provider tool errors and cooldown results are accurate. The model does not announce a gesture it failed to request.
- No additional API keys, voice implementation, or inter-agent message delivery are implied by this work.

Use focused behavioral tests for tool validation and expression lifecycle. Use browser checks for compositing, readability, and interaction. Run the repository's existing build, lint, and formatting checks for changed files. Update DESIGN.md only after the new visual behavior is implemented and accepted.
