# Improve model replies and spoken narration

## Goal

Keep detailed, language-labelled code examples readable in each agent panel. Send a concise, separately authored narration to Cartesia while preserving conclusions, prerequisites, uncertainty, critical numbers, and required actions.

## Decisions

The server owns narration validation and segmentation. The browser requests a saved reply segment by run, seat, reply, revision, and segment index. It cannot supply replacement transcript text. Fixed voice tests use a server-owned phrase.

Reuse the existing summary tool, SQLite tool ledger, ChatService, and SpeechService. Do not add another inference service. Missing or rejected summaries remain silent with a visible reason. Completed replies expose their exact narration through a Spoken summary disclosure.

Code detection is an additional heuristic. The enforced routing property is that panel text and caller-supplied text do not become Cartesia transcripts through the playback API. Generated summaries still need quality evaluation. No classifier claims to recognize every possible program.

## Delivery sequence

1. Define narration as either ready with stable revision and segments, or unavailable with a reason.
2. Move narration construction to the server and replace browser transcript requests with saved references.
3. Reject raw text, invalid revisions, wrong seats, other runs, incomplete replies, and invalid segment indices before synthesis.
4. Strengthen summary instructions. Preserve meaningful caveats, negation, prerequisites, uncertainty, numbers, and action order. Prefer short sections. Allow more complete sections when detail is requested. Do not truncate an answer to meet a length target.
5. Expose narration text and unavailable reasons next to each completed response.
6. Test deterministic routing and lifecycle behavior with a fake Cartesia connection. Evaluate real subscribed model responses separately.
7. Run root checks, review the complete change independently, merge the verified revision, sync main, and remove the feature branch.

## Parallel work

One implementation owner changes application code. A separate reader defines the acceptance cases. An evaluator owns an isolated temporary directory and runs live models against temporary databases with a fake voice connection. Documentation follows the settled implementation. An independent reviewer verifies the finished revision.

## Acceptance cases

| Case | Expected result |
| --- | --- |
| Code example in a panel | Language-labelled block stays visible; narration explains the example without reading source |
| Qualified recommendation | Prerequisite, prohibition, uncertainty, and critical numbers survive |
| Requested detail | Displayed explanation expands; narration remains coherent and complete |
| Missing or rejected summary | No synthesis; visible reason |
| Streaming, stopped, or failed reply | No narration eligibility |
| Wrong run, seat, revision, or index | Request rejected before synthesis |
| Raw transcript request | Request rejected before synthesis |
| Voice test | Only the fixed server phrase reaches the connection |
| Run change or stop | Existing queue interruption and baseline behavior prevents stale playback |
| Fullscreen | Both panels enter and exit; code scrolls; Escape returns to the room |

## Verification limits

Model evaluations are samples, not proofs of summary fidelity. Review the saved visible response, narration, and exact outbound transcript against the fixture's facts. Rerun these cases when prompts, provider adapters, or narration rules change. Syntax coloring remains separate from the existing language-labelled code formatting.

## Observed verification

The final integrated root checks passed on October 30, 2026. Both subscribed defaults completed the combined fixture. Their narrations preserved the prerequisite, credential prohibition, 30-second limit, and rollout order. Replaying the saved responses through the final narration builder produced exact fake-Cartesia transcript equality. No real Cartesia connection was opened. See [evaluation evidence](narration-evaluation.json). These two samples establish observed behavior, not a reliability rate. The fixture leaves the timeout operation unspecified, so the prototype code was not verified as production-ready.

A review found and fixed a client/server segment-count mismatch. The client now validates total text length instead of rejecting valid long summaries by segment count. Narration revisions hash the exact segment array so future segmentation changes invalidate stale requests.
