# Third-party notices

The root MIT license covers original arena code and documentation. Third-party
material keeps its existing license and attribution. Keep the notices with copies
of that material.

- The unmodified shadcn 4.22.1 Tailwind stylesheet is retained as
  `room/apps/web/src/vendor/shadcn-tailwind.css` and in the bundled scaffold's
  matching path. Each copy has the upstream MIT notice in `shadcn-LICENSE.md`.
  Its SHA-256 is
  `4c371f7a1ff5d219ae2f7ff28bd256b4346fd546fe46fbae22092e57db2f0fae`.
- Theme presets derived from tweakcn retain the Apache License 2.0 text in
  `room/apps/web/src/themes/LICENSE-tweakcn`.
- Bundled web fonts retain their notices in
  `room/apps/web/public/fonts/licenses/`. Report font copies retain the Geist and
  Barlow licenses in `room/packages/reporting/assets/vendor/`.
- The Basecoat CSS used by reports retains its MIT license in
  `room/packages/reporting/assets/vendor/basecoat-LICENSE.md`. Asset sources and
  hashes are recorded in `room/packages/reporting/assets/provenance.json`.
- UI reference bundles retain licenses under
  `room/docs/ui-standards/upstream/` and
  `scaffolds/react-nest/template/docs/ui-standards/upstream/`.
- Provider names and logo assets identify the supported integrations. They remain
  the property of their respective owners. The root MIT license does not grant
  rights to third-party trademarks or imply provider endorsement.

Dependencies installed through pnpm retain their own licenses. The lockfile
records the resolved dependency versions. Installed dependencies and package
caches are excluded from this repository.
