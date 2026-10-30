# Trusted report assets

`vendor/basecoat-1.1.0.css.txt` is the unmodified CSS source from the pinned official
Basecoat 1.1.0 npm archive. Its text extension keeps repository CSS formatters from
rewriting this hash-checked upstream input. `scripts/build-assets.mjs` retains its
base/theme/property definitions and only the actual table component rules used by
the document. The report never loads Basecoat JavaScript or a CSS CDN.

The adapter is generated from the allowlisted `:root` declarations in
`apps/web/src/index.css`. It overrides Basecoat's defaults with the single approved
Black Lacquer appearance. Geist and Barlow Condensed 600 are copied from the app's
approved local font files and embedded as data URLs with their OFL licenses retained.
No font request leaves the standalone document.

Run `node packages/reporting/scripts/build-assets.mjs` from `room/` after changing
renderer source, CSS, controller, approved tokens, or assets. The generated TypeScript
contains all trusted runtime assets. Its build identity hashes render.ts, compiled
CSS, and controller bytes. `assets/provenance.json` records the exact source and
compiled hashes and the pinned CDN dependency URLs/SRI values.

The renderer accepts only the versioned report DTO, emits static HTML first, and
embeds a compact projection of the exact metric fields consumed by chart roots.
All source numeric tables and run details remain in HTML; complete metric/source
DTOs remain in the publication sidecars. Unknowns never become zero. Chart mark
limits and timeline sampling are explicitly disclosed and do not alter statistics.

The shared compiler, formatter, tests, and package exports belong to the integration
owner. Build outputs live in `dist/`. `verify-render-scale.mjs` exercises actual
backend metric derivation and rendering at 10, 100, and 1000 runs with up to 50000
attempts, writing its synthetic 1000-run HTML to `/private/tmp/` for browser checks.
