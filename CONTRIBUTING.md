# Contribute to arena

Discuss substantial changes in an issue before implementation. Include the user
problem, expected behavior, and a way to verify the result. For bugs, include
reproduction steps and your Node.js, pnpm, and operating system versions. Remove
credentials, conversation content, and private paths from reports.

## Develop locally

Use the Node.js and pnpm versions in [README.md](README.md). From the repository
root, run:

```sh
task install
task dev:text
```

Text mode does not need Cartesia or Google Cloud access. Use your own signed-in
provider accounts. Model availability depends on your account. Debate workspace
containment currently requires macOS.

For speech, set `CARTESIA_GCP_PROJECT` to a project where your current `gcloud`
account can read the `CARTESIA_API_KEY` secret, then run `task dev`.
Keep credentials out of source files and browser environment variables.

## Make a change

Keep changes focused. Follow [room/AGENTS.md](room/AGENTS.md) and applicable
instructions in the directory you edit. Use the existing components and design
conventions for UI changes.

Keep API unit tests under `room/apps/api/test/unit/`, mirroring source paths.
Web tests belong under `room/apps/web/test/`; startup tests belong under
`room/test/scripts/`. Keep test files separate from application source.

Run `task checks` from the repository root before requesting review. The full
containment checks require macOS. Describe any check you could not run, including
its error. For UI changes, verify the running app and include a screenshot with
demonstration content.

Review the staged files before committing. Do not force-add ignored files. Local
runtime state, provider authentication, retained workspaces, audit output, and
`.env` files must stay private.

## Request review

Describe the problem, resulting behavior, and verification performed. Link the
related issue when one exists. Maintainer review and local verification precede
merge. Do not include unrelated formatting or generated runtime files.

By submitting a contribution, you agree to license your original contribution
under this project's MIT license. Preserve third-party license notices.

Treat other contributors with respect. Address the work and give specific,
actionable feedback. Do not post private information or harass contributors.
