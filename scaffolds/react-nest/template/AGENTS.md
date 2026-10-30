# Project conventions

For UI design, implementation or review, read
[scaffold-ui](.agents/skills/scaffold-ui/SKILL.md) and only the references needed
for the task. It maps the actual component, token and typography sources. Read
PRODUCT.md and DESIGN.md when present; the starter's neutral theme is a starting
point, not an approved product identity.

[readme.md](readme.md) owns setup, checks, package versions and supply-chain
policy. Preserve that policy when adding components or dependencies. Update the
project's design context and local guidance when its conventions change.

In Sociotechnic runs, design approval and implementation/publication gates remain
owned by the engine. Reference skills never authorize an action on their own.

The shadcn CLI is not installed. Existing generated components remain local source.
The Tailwind utilities are pinned in `apps/web/src/vendor/shadcn-tailwind.css`,
with the upstream MIT notice alongside them. This overrides the bundled UI guide's
references to an installed CLI and `shadcn/tailwind.css`. Do not reinstall the CLI
until its dependency audit is clean and the change is reviewed.
