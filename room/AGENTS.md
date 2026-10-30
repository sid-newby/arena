# Project conventions

For UI design, implementation or review, read
[scaffold-ui](.agents/skills/scaffold-ui/SKILL.md) and only the references needed
for the task. It maps the actual component, token and typography sources. Read
PRODUCT.md and DESIGN.md when present; the starter's neutral theme is a starting
point, not an approved product identity.

[README.md](../README.md) owns setup, checks, package versions and supply-chain
policy. Preserve that policy when adding components or dependencies. Update the
project's design context and local guidance when its conventions change.

In Sociotechnic runs, design approval and implementation/publication gates remain
owned by the engine. Reference skills never authorize an action on their own.

Run `task install`, `task checks`, and `task dev` from the repository root.
Keep API unit tests under `apps/api/test/unit/`, mirroring `src/`. Startup tests
live under `test/scripts/`; web tests remain under `apps/web/test/`. Native select
is the canonical Select/Listbox owner, recorded in DESIGN.md and premium-ui.json.

The shadcn CLI is not installed. Existing generated components remain local source.
The Tailwind utilities are pinned in `apps/web/src/vendor/shadcn-tailwind.css`,
with the upstream MIT notice alongside them. This overrides the bundled UI guide's
references to an installed CLI and `shadcn/tailwind.css`. Do not reinstall the CLI
until its dependency audit is clean and the change is reviewed.
