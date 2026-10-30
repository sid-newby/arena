# Maestro setup and workspace lifecycle plan

Status: implemented under the user-approved defaults. The user authorized delegation, verification, commit, sync, and merge on October 30, 2026. Application closeout still requires explicit per-result confirmation before publishing or removing a worktree.

## Desired result

Guide the user from a required debate question to a reviewed run. Prepare separate A and B workspaces in a user-visible location, make each result available locally, and offer a deliberate closeout that preserves tracking and any work the user chooses to keep. Maestro can propose acceptance criteria and post useful unsolicited feedback to its private chat.

## Current behavior

- `apps/web/src/components/maestro-dialog.tsx` has private chat and run tabs. `apps/web/src/hooks/use-run-setup.tsx` already collects a question, artifact, success criteria, grounding, model configuration, and an optional repository path and revision.
- `apps/api/src/workspaces/workspace-manager.ts` prepares separate Git worktrees for a source commit or separate scratch directories with no source. Worktrees live under the private control root, which defaults under the user's state directory. The manager prohibits that control root from being inside the source repository.
- `apps/api/src/maestro/maestro.service.ts` only starts responses on explicit user requests. It maintains private, run-scoped chat and captures a correspondence boundary.
- `apps/api/src/state/` and `apps/web/src/components/outcome-review.tsx` already support a Maestro outcome proposal and human confirmation. That is distinct from generating criteria before the run.
- `../scaffolds/react-nest/template` is the available React, Vite, and Nest scaffold. It has pnpm policy but no root Taskfile. The root `../README.md` describes this repository's supply-chain policy.

## Proposed user experience

1. Open Maestro. For a new run, show a setup wizard with a required question first. Keep private chat available throughout and preserve drafts when navigating, closing the dialog, or reloading. Return to the relevant step with the current status and next action.
2. Ask what kind of work the user wants. Offer reasoning or prototypes. Collect the intended artifact, shared context, and editable acceptance criteria. Generate criteria on demand from the current question, artifact, context, mode, and selected source or scaffold. Present the result as a draft the user can edit, replace, or discard. Never silently overwrite edits. Disable generation until the question is present and explain failures and stale results.
3. Offer a project source. Let the user choose an existing local Git repository with a revision, start a new project from an available scaffold, or use empty scratch space. Provide a local folder browser and a path entry fallback. Display the resolved repository, exact commit, destination, and a warning that uncommitted source changes are excluded. Preserve the existing ability to leave the source empty.
4. Make scaffold use optional. List available scaffolds from `scaffolds/` using explicit metadata. Do not infer that every project needs one. For new TypeScript projects, establish root `task install`, `task checks`, and `task dev`, prefer pnpm, and carry over the applicable pinned package manager, lockfile, release-age, build-script, engine, and dependency-source policies. Review scaffold contents rather than assuming the current template already meets these requirements. Do not overwrite an existing project's tooling.
5. Show model choices and a final review of the question, criteria, models, source commit, scaffold, and workspace locations. Preflight destination permissions, provider availability, and required tools; explain how to resolve failures before starting. The application, not A or B, prepares and records their separate workspaces before either starts. A source repository defaults to an application-owned directory within this repository, with an explicit destination choice for external projects. Private state remains outside participant workspaces. Validate the actual destination and its relationship to the source and control roots before creation.
6. After each participant completes, snapshot its result into an independent local result directory under the chosen application-owned location. Show a result card per seat with its exact path, copy-path action, available run command, copy-command action, and verification status. Offer open-folder only where the host supports it, with the path as a fallback. Preserve each seat separately, including its changes and relevant artifact metadata. Do not automatically merge competing A and B changes into one branch or modify the user's source checkout. Describe conflicts or incomplete snapshots rather than claiming success.
7. After a completed run and tracking capture, offer a closeout screen for each result. The user can keep it locally, save it to a new private repository, or explicitly discard it. Maestro may propose a repository name, but creation and publication require the user's explicit choice. Show the remote and privacy before publishing. Preserve local work if publication fails. Remove only application-owned worktrees after their chosen preservation has succeeded, the user has confirmed deletion, and checks find no unaccounted changes or active processes. Keep the run's durable tracking and result metadata.
8. Let Maestro initiate a private observation when a meaningful event warrants it. Put it in the existing chat and show a yellow glow on the Maestro navigation button while feedback is unread. Move Maestro to the far left of its existing navigation group. Opening the wizard or a different tab does not mark chat feedback as read. Mark feedback read only when its chat message is visible. A question that needs an answer remains visibly unresolved after it is read, until the user answers or dismisses it. Include accessible unread and unresolved labels and reduced-motion treatment. Avoid repeat notifications for the same event and distinguish working status from unread feedback.
9. Add context-sensitive actions for suggesting criteria, explaining a blocker, summarizing differences, and identifying unverified work when the required context exists. Show each action's request and response in private chat. Offer **Use this setup again** to copy a prior setup into a new draft, with a clear choice between its recorded commit and current HEAD. Always create fresh workspaces.
10. Let the user choose **Keep for now** at closeout. List retained work with the run, date, location, and reason cleanup is pending. Show approximate disk usage when it can be obtained safely. This choice does not authorize deletion.

Defer an in-app prototype runner and a rich comparison viewer. The first release gives the user the path and run command; managed processes, ports, logs, and stop controls can follow as a separate feature.

## Data and lifecycle contracts

- Extend the run draft with an explicit source choice, destination, optional scaffold identity and version, and the reviewed criteria. Existing saved drafts and runs must remain readable. Store resolved paths and source commit separately from user-entered values.
- Give each run and seat a stable ownership record containing source commit, worktree path, branch, result path, snapshot revision or content digest, and lifecycle state. Track preparation, result capture, preservation, and cleanup independently so a restart can resume safely. Do not depend on Git worktree existence as the only record of user decisions.
- Keep private control files outside the source repository and outside agent writable roots. Move only managed worktree and result directories into the selected destination. Check canonical paths, symlinks, ownership, collisions, Git metadata, and permissions at each operation. Never remove an unknown worktree, a source checkout, or a user directory.
- Define a capture boundary for each result. Include tracked changes, staged changes, untracked files, deletions, and relevant executable bits without silently dropping ignored files the user expects to test. Show anything excluded. Do not include tool homes, secrets, or dependencies by default. Determine the precise exclusions from the existing sandbox and product needs before implementation.
- Make preparation, capture, publish, and cleanup retryable. Handle partial creation, missing or moved sources, dirty trees, interrupted agents, conflicting names, external drive removal, and application restart. Only remove a Git branch after proving its unique history is preserved and the user approved removal.
- Persist criteria generation requests with the input revision and apply a result only to that revision, or ask the user to reconcile it. Record the provenance of generated suggestions. An AI suggestion is never an implicit start or approval.
- Give proactive feedback durable event IDs, a captured evidence boundary, a deduplication key, per-message read state, and separate resolution state for questions. Preserve these states across reloads and reconnects. Define bounded triggers such as a blocked participant or a material result ready for review. Coalesce bursts, avoid concurrent Maestro turns, and expose errors without retry storms. Private chat stays private.

## Delegation and sequence

The coordinator owns shared contracts, migrations, integration, and final review. Builders work in separate checkouts with non-overlapping file ownership. Exact paths and contracts are agreed before parallel implementation. A builder does not review its own work.

1. **Contract and UI design.** A high-capability design and architecture builder traces run persistence and sandbox boundaries, proposes the source and lifecycle state models, and produces a wizard mockup using the existing product design. The coordinator reviews the contracts before dependent builders start. Prototype the wizard at desktop and narrow widths before production styling.
2. **Workspace lifecycle.** A high-capability backend builder owns provisioning, ownership manifests, result capture, recovery, and safe cleanup under `apps/api/src/workspaces/` and related tests. The coordinator owns shared API and state wiring. Use real temporary Git repositories for lifecycle tests, including external source paths.
3. **Setup and criteria.** After the contract is fixed, a frontend builder owns the wizard and navigation, and a backend builder owns criteria generation and scaffold discovery. They can work alongside workspace lifecycle work against the agreed contracts. A smaller model can handle the bounded scaffold Taskfile and metadata update after the required commands and policy are specified. The coordinator integrates shared files.
4. **Feedback.** A backend builder adds bounded proactive Maestro events and read state; a frontend builder adds unread treatment and chat behavior. Start after the event contract is agreed. Check coexistence with normal user-initiated Maestro turns.
5. **Closeout and private save.** Build on verified capture and ownership. A backend builder implements a private repository publishing adapter only after checking the available account and provider capabilities. A frontend builder implements explicit per-seat choices and status. Do not require a remote account for local keep or cleanup decisions.
6. **Integration and review.** The coordinator combines local changes, reviews the full workflow and safety boundaries, and obtains independent correctness and UX review. Run root `task checks`, plus targeted behavior tests. Drive the real app at desktop and narrow sizes with a real local Git repository and an external source. Present screenshots and a local test handoff. Do not sync until the user confirms.

## Acceptance checks

- A blank question cannot start preparation. Draft navigation and reload preserve entered values.
- The final review displays the intended setup, and failed preflight checks identify the problem without starting agents. Reusing a setup creates a fresh draft and workspaces and makes the source revision choice explicit.
- Criteria generation uses the current setup, returns editable criteria, handles failure, and cannot overwrite later edits with a stale response. Existing outcome review continues to work.
- A repository outside this directory is discoverable or enterable. A selected revision resolves to a recorded commit. Two agents receive isolated workspaces at displayed, controlled paths. The user's source checkout remains unchanged.
- A new scaffolded TypeScript project has working root `task install`, `task checks`, and `task dev`, with the selected scaffold's dependency policy retained. Scratch and existing-project runs do not require a scaffold.
- A and B results are independently accessible in displayed local directories and reproduce the captured work. Each result exposes its path, run command when known, and verification state. Failed or incomplete capture is visible and blocks destructive cleanup.
- Closeout retains durable run and outcome records. Keep, private save, and discard are explicit per result. Cleanup refuses unknown, active, dirty, or unpreserved work and survives interruption. Private publication is confirmed and verified before cleanup.
- A meaningful Maestro observation appears in private chat and marks its navigation control unread across reloads. Opening another tab leaves it unread. Viewing the message clears its unread state; an unanswered question stays unresolved until answered or dismissed. Duplicates, concurrent requests, reconnects, and reduced motion behave correctly.
- Keep for now preserves the result and lists it for later closeout. Context-sensitive Maestro actions appear only when relevant and leave their requests and responses visible in chat.
- Keyboard navigation, focus return, labels, error states, and narrow layouts work. Existing run, chat, outcome, and sandbox behavior remains covered.

## Selected defaults

1. Managed workspaces default to `lilbits/workspaces/<run-id>/`, including for external source repositories. `ROOM_MANAGED_WORKSPACE_ROOT` overrides the destination.
2. A and B results remain independent local repositories. Completion preserves both; it does not combine competing code into the source checkout.
3. Closeout is explicit per result. Keep for now, preserve, private publish, and cleanup remain separate choices. Changed work is never silently discarded.
4. Private saves use GitHub and a fresh history containing the preserved files, with an editable generated repository name.
5. Automatic Maestro feedback is bounded to blocked work and completed independent results, with durable retries and visible manual recovery.

## Implementation simplifications

Use the existing run workflow as the execution fence. Terminal runs reject further participant tool calls. Preserve files through the existing macOS sandbox and compare contents before and after the copy. If contents change, retain the live workspace and ask for a retry. This is ordinary file preservation, not a global filesystem snapshot.

Use a single manager-scoped operation lock for closeout, one shared workspace path resolver, and per-seat UI components. A preserved result is a fresh repository with a recorded commit, so publishing cannot expose the source repository history. Cleanup retains durable run records and bundles Git history before removing only owned worktrees.
