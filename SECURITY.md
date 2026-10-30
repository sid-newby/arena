# Security

Arena runs on your computer and uses your signed-in model providers. Keep its web
and API listeners on loopback. Do not expose them through a public tunnel or
reverse proxy. The application is intended for a single local user and has no
multi-user authentication boundary.

## Local data and credentials

Prompts, model replies, tool records, and continuation identifiers persist in
`room/.room/`. Provider state and authentication links can also exist there.
Private control and report data can live under `~/.local/state/lilbits`, or the
path selected by `ROOM_CONTROL_HOME`. The old state directory name remains for
compatibility with existing installations.

Retained workspaces, reports, and audit output can contain private code and
conversation content. Review an artifact before sharing it. Model requests leave
your machine for the selected provider. Speech sends the selected narration to
Cartesia when enabled.

The speech launcher reads `CARTESIA_API_KEY` from Google Cloud Secret Manager in
the project selected by `CARTESIA_GCP_PROJECT`. It passes the key to the API in
memory. Never put the key in Vite variables or browser code.

Use a reviewed Git commit for public distribution. Ignore rules exclude local
state from normal Git imports, but do not sanitize a working-folder archive.
Do not force-add ignored files or upload a ZIP of your working folder.

## Agent execution

Agents can read project content, use network access, and run tools allowed by the
selected profile. macOS containment constrains candidate workspace tools. Review
the source, requested profile, proposed publication, and resulting changes before
applying them. Do not run untrusted projects with credentials or private data you
do not intend to make available to the selected tools.

## Report a vulnerability

Do not post credentials or an exploitable vulnerability in a public issue. Use
GitHub's private vulnerability reporting option if it is enabled for the public
repository. If no private channel is available, open an issue asking the
maintainer for one without including exploit details or private data.

Include affected files, reproduction steps, impact, and a suggested fix when
available. There is no guaranteed response time. If a credential is exposed,
revoke or rotate it with its provider before sharing diagnostic material.
