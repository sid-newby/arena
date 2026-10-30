---
name: "arena — The Lacquer Room"
description: "Two square-cut black lacquer terminals for Luna and Opus."
colors:
  background: "oklch(0.16 0.004 260)"
  foreground: "oklch(0.94 0.005 90)"
  card: "oklch(0.105 0.003 260)"
  card-foreground: "oklch(0.94 0.005 90)"
  popover: "oklch(0.19 0.004 260)"
  popover-foreground: "oklch(0.94 0.005 90)"
  primary: "oklch(0.78 0.13 235)"
  primary-foreground: "oklch(0.12 0.01 260)"
  secondary: "oklch(0.23 0.006 260)"
  secondary-foreground: "oklch(0.92 0.004 260)"
  muted: "oklch(0.21 0.005 260)"
  muted-foreground: "oklch(0.69 0.012 260)"
  accent: "oklch(0.25 0.006 260)"
  accent-foreground: "oklch(0.96 0.004 260)"
  destructive: "oklch(0.76 0.17 32)"
  border: "oklch(0.32 0.006 260)"
  input: "oklch(0.32 0.006 260)"
  luna-identity: "oklch(0.78 0.13 235)"
  opus-identity: "oklch(0.73 0.17 45)"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(72px, 7.2vw, 96px)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(38px, 4vw, 60px)"
    fontWeight: 500
    lineHeight: 1.03
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "15px"
    lineHeight: 1.8
  input:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "11px"
  metadata:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "10px"
  caption:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "9px"
    lineHeight: 1.5
rounded:
  square: "0px"
spacing:
  control-gap: "7px"
  compact: "12px"
  group: "16px"
  panel-inset: "24px"
  reply-gap: "34px"
  fluid-inset: "clamp(24px, 3vw, 46px)"
components:
  button-send-luna:
    backgroundColor: "{colors.luna-identity}"
    textColor: "{colors.card}"
    rounded: "{rounded.square}"
    height: "31px"
    padding: "0 11px"
    typography: "{typography.label}"
  button-send-opus:
    backgroundColor: "{colors.opus-identity}"
    textColor: "{colors.card}"
    rounded: "{rounded.square}"
    height: "31px"
    padding: "0 11px"
    typography: "{typography.label}"
  button-stop:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.square}"
    height: "31px"
    padding: "0 11px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.square}"
    height: "26px"
    padding: "0 6px"
    typography: "{typography.metadata}"
  composer:
    textColor: "{colors.foreground}"
    rounded: "{rounded.square}"
    padding: "15px 15px 8px"
    typography: "{typography.input}"
  destination-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    padding: "6px 9px"
    rounded: "{rounded.square}"
    typography: "{typography.metadata}"
  mobile-navigation:
    textColor: "{colors.muted-foreground}"
    height: "38px"
    padding: "0 22px"
    rounded: "{rounded.square}"
  lacquer-slab:
    textColor: "{colors.foreground}"
    rounded: "{rounded.square}"
    width: "100%"
    height: "100%"
  reply:
    textColor: "{colors.foreground}"
    width: "100%"
    typography: "{typography.body}"
  theme-preset:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    padding: "8px"
    rounded: "{rounded.square}"
---

# Design System: arena

## Overview

**Creative North Star: "The Lacquer Room"**

Two physical, glossy black terminals occupy a quiet room. Square-cut edges, thick side faces and narrow reflected light make the conversations feel housed in objects. Condensed Neo Tokyo signage carries the agents’ names; calm reading type keeps their replies usable. The approved appearance is the default, and additions should continue it.

Luna and Opus remain distinct colleagues with blue OpenAI and orange Anthropic identities. Optional color and font presets change the room’s styling while preserving its material construction, independent conversations and square corners. The shipped surface uses CSS geometry and reflections with supplied SVG provider masks; it has no shipping raster artwork.

**Key Characteristics:**

- Thick black lacquer with sharp reflections and visible side faces.
- Oversized condensed names paired with quiet, readable replies.
- Blue Luna and orange Opus identities retained across optional themes.
- Two independent desktop panels and one tab-selected panel on mobile.
- Bounded agent-owned motion with a front-facing reduced-motion fallback.

## Colors

The default palette is near-black lacquer and cool gray text, punctuated by clear blue and hot orange identities. The frontmatter records the canonical OKLCH values from `apps/web/src/index.css`; it describes the default, not a second runtime token source.

### Primary

- **Luna blue** (`luna-identity`): Luna’s name, OpenAI mark, status, composer focus and Send action. `primary` shares the default hue and drives global selection, active tabs and focus.
- **Primary ink** (`primary-foreground`): text on global primary actions.

### Secondary

- **Opus orange** (`opus-identity`): Opus’s name, Anthropic mark, status, composer focus and Send action.
- **Destructive signal** (`destructive`): explicit error text and destructive primitive states; never a replacement for provider identity.

### Neutral

- **Room black** (`background`) surrounds the objects; **lacquer black** (`card`) forms their faces.
- **Reading white** (`foreground`, `card-foreground`) carries replies and prominent utility text.
- **Drawer charcoal** (`popover`, `popover-foreground`) carries the theme dialog.
- **Selection charcoal** (`secondary`, `secondary-foreground`) marks destination selection and Stop.
- **Muted charcoal and gray** (`muted`, `muted-foreground`) support subordinate copy and ghost states.
- **Interaction charcoal** (`accent`, `accent-foreground`) identifies active controls and hover states.
- **Seam gray** (`border`, `input`) draws controls and dividers. The runtime ring aliases the active primary token.

**The Identity Rule.** Provider identity colors stay blue for Luna and orange for Opus across presets; theme accents must not overwrite them.

The bundled tweakcn presets and CSS/registry-JSON import apply supported semantic theme tokens. Display and conversation font overrides are independent and persist locally. Radius remains zero; identity tokens are outside the import allowlist. Lacquer reflections derive from semantic colors, so optional themes keep the same construction.

## Typography

**Display Font:** Barlow Condensed, with sans-serif fallback.
**Body Font:** Geist Variable, with sans-serif fallback.
**Label/Mono Font:** Labels use the body face. Theme import text uses `ui-monospace, monospace` unless a preset supplies a mono font.

The large condensed signs give each terminal a recognizable presence; quieter body text gives replies priority over metadata. Fonts are bundled locally. The frontmatter records the default roles; theme font controls may replace their families.

### Hierarchy

- **Display:** uppercase agent names, responsive size from the frontmatter; at the intermediate viewport they use 78px, and mobile uses `clamp(70px, 18vw, 92px)`.
- **Headline:** uppercase empty-state statements; mobile uses 46px.
- **Title:** theme drawer title, with close tracking.
- **Body:** replies at 15px and 1.8 line height, with preserved line breaks and anywhere wrapping. Empty-state explanation uses 12px, 1.75 line height and a 35ch measure.
- **Input:** desktop composer text at 14px and 1.6 line height; mobile increases to 16px.
- **Label / metadata / caption:** compact controls, actual model/status metadata, and supporting instructions. These are functional labels, not decorative eyebrows.

**The Reading Rule.** Use the condensed display face for names and empty-state headlines; keep replies and controls in the conversation face.

## Layout

The room fills `100svh` with a desktop minimum height of 620px. A 76px header sits above a flexible two-column stage; each column is `minmax(0, 1fr)`. The stage gap is `clamp(34px, 4.3vw, 78px)` and default padding is `12px 54px 30px 34px`. At 1600px and above, outer gutters grow to keep the room composed on wide screens.

Each slab is a vertical flex container: large identity header, independently scrolling reply area, anchored composer. Header, replies and composer share the fluid panel inset recorded in the frontmatter. Replies use a 34px gap; controls use tighter spacing. The footer holds recentering and utility controls.

At 1000px and below, header and panel gutters tighten and secondary header/footer copy disappears. At 700px and below, accessible Luna/Opus tabs select one full-width panel, the room minimum becomes 560px, the header becomes 62px and manual pose controls are hidden. This is a tabbed mobile surface, not stacked simultaneous chat panels. Short desktop viewports at 760px height or below also compress headers and composers. The theme drawer is `min(490px, 100%)` wide; at 480px and below its font controls become one column.

## Elevation & Depth

Depth is structural: a 20px side face, skewed by 35 degrees, makes the slab thick; a 112-degree face gradient and narrow diagonal reflections make it glossy. The face carries two fine inset highlights and a diffuse cast shadow. A room radial wash adds only slight tonal separation. Reflections are pointer-transparent CSS layers.

### Shadow Vocabulary

- **Slab:** `inset 1px 1px 0 color-mix(in oklch, var(--foreground), transparent 63%), inset -1px 0 0 color-mix(in oklch, var(--foreground), transparent 78%), 18px 28px 36px -18px color-mix(in oklch, var(--card), transparent 10%)`.
- **Composer recess:** `inset 0 1px 8px color-mix(in oklch, var(--card), transparent 20%)`.
- **Theme drawer:** `-20px 0 70px rgb(0 0 0 / 0.4)` with a dark translucent overlay.

**The Lacquer Rule.** Build depth from the slab face, side face, fine reflected light and a diffuse cast shadow. Preserve the black lacquer default.

Panel pose transitions use 650ms and `cubic-bezier(0.16, 1, 0.3, 1)`, with desktop yaw bounded to ±2.7 degrees and mobile yaw to ±1.5 degrees. The stage perspective is 1800px on desktop and 1600px on mobile. Audience, peer and center are semantic agent actions. Human controls suggest a pose until the next agent pose call, including a repeated call. Reduced motion removes panel rotation and collapses transitions/animations to 0.01ms.

## Shapes

Every interactive surface is square-cut. The runtime radius is zero and global control/data-slot rules enforce it, including imported themes. Slabs use straight edges, thin light seams and visible side planes; status lights are small squares. Provider marks are the supplied OpenAI and Anthropic SVG masks colored with identity tokens. Interface icons use the existing Lucide SVG system.

## Components

### Buttons

Compact square actions sit quietly until needed. Send is identity-colored with lacquer-colored text, a 31px height and a 15px arrow icon. Hover mixes 20% foreground into the identity color. Stop uses the secondary surface and reading text. Ghost copy and footer controls use muted text, brighten on interaction and retain visible focus. Disabled action opacity is a state treatment, not a text-color token. Default, outline, secondary, ghost, destructive and link primitives remain available in the installed Button; prefer the observed room variants for room controls.

### Chips

Destination selectors are labeled radio controls, not decorative tags. The selected option uses the secondary pair; unselected options use muted text. Keyboard focus outlines the visible option. Both means one prompt sent independently to each agent.

### Cards / Containers

The lacquer slab is the room’s signature container, with full-height internal flex layout and the depth construction above. Do not wrap replies in additional cards. The installed generic Card is a supporting primitive, not the composition of the conversation room.

### Inputs / Fields

The composer uses Input Group with a thin input seam and a face mixed 2% toward foreground. Focus changes the seam and one-pixel outer ring to the panel identity. Desktop textareas have a 78px minimum and 160px maximum height, reduced to 66px minimum on mobile and 62px in short desktop windows. Placeholders use the muted foreground at full placeholder opacity. Errors are explicit destructive text above the form. Preview is labeled authored content and disables sending.

Theme search, selects and import fields use background/foreground tokens, a border and at least 40px height. The dialog uses Radix focus and dismissal behavior. The global focus treatment is a two-pixel ring with four-pixel offset; destination and theme controls use their local offsets.

### Navigation

Desktop keeps both colleagues visible. Mobile tabs use muted inactive text, reading-white active text and a two-pixel primary underline. Tabs retain semantic selection and keyboard behavior. The header’s Themes action opens the fixed right-hand drawer; its selectable preset tiles show swatches and a ring-colored selected border.

### Replies

Completed replies expose a native Spoken summary disclosure. It shows the exact
server-derived narration or the reason audio is unavailable. Language-labelled
fenced code uses a bordered, scrollable monospace block. The per-panel fullscreen
button enters the browser fullscreen view, with Escape and the same button
returning to the room. Panel motion is disabled while fullscreen.

Replies use the ghost Bubble inside Message and Message Scroller. The content is full-width, borderless and readable; small identity-colored author metadata and a Copy action provide orientation. Only agent replies appear in these threads. Scroll-to-latest is a bordered square control on the card surface.

## Do's and Don'ts

### Do:

- Do preserve the approved lacquer default when adding optional themes.
- Do use the existing semantic CSS variables and shadcn/Radix composition.
- Do keep provider identities distinct and corners square across themes.
- Do retain independent reply scrolling and anchored composers.
- Do show connection, failure, preview and working states truthfully.
- Do let every subsequent agent pose call supersede a human suggestion, even when the requested pose repeats.
- Do keep keyboard focus visible and render reduced-motion panels front-facing.

### Don't:

- Don’t replace the approved appearance with a new visual direction.
- Don’t add rounded cards or pill controls.
- Don’t turn reflections into raster backgrounds or obscure text with them.
- Don’t use condensed display typography for conversation paragraphs.
- Don’t show human prompts as visible reply bubbles or imply Both connects the agents to each other.
- Don’t turn a manual pose suggestion into a persistent lock or present future voice as working.

## CSS 3D arena poses (Sid-approved increment)

The lacquer panels remain ordinary DOM chat surfaces. `apps/web/src/arena.css`
owns this scoped geometry layer, loaded by App.tsx: one 1800px stage perspective,
center pivots, 36px panel thickness, 9° peer-facing yaw in opposite directions,
and a 48px forward / -4° pitch lean. Audience is straight on. Turns settle over
800ms with a deliberate ease-out and no bounce. Side, rear and horizontal edge
surfaces remain outside the clipped front face; chat clipping stays inside it.
Panel colors and typography continue to inherit the existing theme. At tablet
widths the existing display treatment uses a 64px heading to retain chat width.

The shared footer exposes Audience, Peer, Lean in, and Reset per agent plus
Recenter panels. Manual poses are local visual state; genuine existing pose
revisions can supersede them. There is no generated activity or audio reaction.
At <=700px, panels are flat with active-agent controls labeled flat view. Reduced
motion removes transforms, transitions and depth faces for stable reading.

## Panelist delivery

Keep the existing reply body and lacquer composition. Reply metadata can show
To Luna or To Opus and Responding to Luna or Responding to Opus. An outgoing
reply shows Queued for, Sending to, or Replied status from the server's delivery
record. Sending means an attempt has started; it does not claim comprehension.
Failed, stopped, and exchange-limit outcomes include their available detail.
A nonzero panelist inbox count appears in the receiving panel's metadata.

The footer's square ghost Stop conversation action stops both model replies,
queued deliveries, and local audio. It shows pending, success, and error feedback.
Stop audio remains a separate playback action. During a panelist reply the
composer retains both Stop and Send. Its caption explains that Send interrupts
the panelist exchange to give Sid priority. Human-prompted active replies keep
the existing Stop-only behavior. Preview never sends or stops live conversation.

No new color or typography tokens are introduced. Status text uses existing
muted foreground and destructive roles. Metadata and footer utilities wrap at
narrow widths, and the existing keyboard focus and reduced-motion behavior stay
in effect.

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | AgentPanel composer and useAgents | PRODUCT.md and server submit validation | Luna, Opus, Both | API boundary tests and browser send/stop checks |
| Conversation control | ChatService with the App Stop conversation action | PRODUCT.md panelist delivery rules | Human turn, addressed panelist turn | peer-delivery.spec.ts and actual provider exchange |
| Reply metadata | AgentReply and parseSnapshot | Server ChatSnapshot | Recipient, triggering panelist, delivery state | panelist-delivery.test.mjs and narrow browser check |
| Speech playback | useSpeech and SpeechQueue | Saved reply text | Live replies, explicit voice test | speech-queue.test.mjs and streamed playback checks |

## Stable debate seats

A and B are stable panel identities. Provider marks and the existing blue or orange
identity tokens follow the configured Codex or Anthropic provider. Panel position,
pose direction, and voice stay with the seat. Panel headings, mobile tabs, and
current composer labels derive their short name from the applied model ID through
`modelPanelName`. Known model families use names such as Sol, Luna, and Opus;
unknown models retain their exact ID, and missing model information falls back to
A or B. Secondary metadata shows the seat, exact model ID, and effort. Accessible
labels include the seat so identical models remain distinguishable. Long headings
and tab names truncate within their available width; the exact model ID wraps in
the panel metadata. Historical replies retain their original author and model
provenance, and peer delivery labels keep their stable seat references.

Keep exactly two lacquer slabs. Maestro is a separate, text-only dialog in the
approved feature plan. It never enters the panel, pose, peer-destination, or speech
collections. Existing A/B voice settings use MODEL_A_VOICE_ID and MODEL_B_VOICE_ID.

## Maestro and run setup

Maestro opens a dedicated text-only dialog. Chat and Run tabs share the existing
conversation typography, square controls, and semantic colors. Closing the dialog
keeps chat, drafts, and pending requests mounted. Run setup uses native selects,
matching ThemeControls. Native select is the canonical Select/Listbox owner for
provider, model, effort, mode, profile, retained run, and moderation choices.
Artifacts render as text or inside an opaque sandboxed iframe. Candidate HTML
never enters the trusted room DOM.

Agent and Maestro assistant replies share ReplyMarkdown. It renders CommonMark
and GitHub-flavored tables, lists, links, emphasis, and fenced code with the
existing conversation typography. Code and wide tables scroll inside the reply.
Raw HTML stays inert, unsafe link protocols are blocked, and Copy retains the
original Markdown. Human Maestro messages remain plain text.

A draft without a configured task opens as New run, with the required question
first and setup guidance in the dialog description. Outcome review, retained
outputs, and closeout panels appear after a task is configured. Loading is labeled
Opening run setup so it does not imply an existing saved task.

### Outcome review

The Run and outputs tab contains a compact outcome review after run controls and before retained outputs. It uses native selects and labeled fields for the proposed selection, goal status, summary, and criterion evidence. Confirmation is an explicit action; current confirmation and a disclosure for revision history remain visible alongside the proposal. Polling preserves the user's draft and a newer proposal requires an explicit load.

### Saved reports

Report generation and history use the room's existing React controls and native
selects. Report HTML is a separate Basecoat document with inline CSS, embedded
Geist and Barlow Condensed fonts, and a fixed Black Lacquer token adapter generated
from the canonical default in `apps/web/src/index.css`. It does not follow theme
switches or imported presets. React and Recharts mount only progressive chart
roots inside that document. Static summaries and numeric tables remain readable
without chart libraries or JavaScript. Previews use an opaque iframe with scripts
allowed and no same-origin privilege. Chart model identity stays stable across
seat changes; legends and tables carry exact model and configuration labels.
