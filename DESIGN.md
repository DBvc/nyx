# Nyx Design System

## 1. Product Reality

Nyx is a minimal desktop AI chat client by default.

For ordinary work, the interface should support a focused desktop chat loop
with a familiar app shell:

- one app window
- one quiet left sidebar for orientation and primary actions
- one main conversation surface
- plain-text messages
- real streaming feedback
- stop, retry, and new-chat controls
- one real current thread that can be restored after a complete app restart

Nyx is not a general AI workbench by default. Do not introduce visual patterns
that imply:

- settings panels
- tools or skills surfaces
- file browsers
- multi-agent dashboards
- fake persistent history that is not backed by real data

The main chat surface is still the product. The sidebar supports the chat loop. It must not compete with it.

When the user explicitly asks to execute the gated first agent-workbench
workstream, the product may add Settings > Connections and thread-first copy.
That workstream still must not imply fake tools, fake artifacts, fake history,
fake file context, approval cards, a multi-agent dashboard, or a permanent
third workspace region. A future details pane is not part of the first
workstream; if introduced later, it must be contextual and backed by real data.

The completed current-thread durability workstream does not change this visual
model. The sidebar still represents one current thread, while Electron main
owns its durable record. Renderer messages are a safe in-memory projection,
not a hidden history collection. Do not add Recent, thread switching, archive,
search, or per-message history controls.

## 2. Visual Theme and Atmosphere

Nyx should feel like a restrained desktop tool for people who spend a lot of time in AI chat.

The aesthetic should be dark, plain, geeky, and utilitarian. Think closer to ChatGPT or Codex than to a branded showcase page. It should look like a tool window, not a composition.

The interface should communicate restraint:

- one deliberate dark theme
- low saturation surfaces
- small to medium radii
- thin borders and quiet separators
- almost no decorative shadow
- familiar app patterns over visual novelty

This is not a marketing page. Avoid oversized hero copy, ornamental illustrations, animated spectacle, glassmorphism, and decorative gradients.

## 3. Color Palette and Roles

Default theme is deep dark neutrals with one controlled accent.

Suggested roles:

- Canvas: near-black charcoal
- Sidebar: slightly raised dark panel
- Surface: dark slate
- Border: low-contrast graphite
- Text Primary: cool off-white
- Text Muted: desaturated slate
- Accent: subdued blue

Design guidance:

- most of the UI should live in dark neutrals
- accent color is used mainly for send actions, focus states, and lightweight status emphasis
- user messages should not become bright candy-colored bubbles
- avoid rainbow accents, purple gradients, and neon glows
- error states should stay readable and calm

Nyx is dark-only in the current product scope. Do not add a parallel light
palette, theme store, or system-theme switch until the product explicitly asks
for one. Executable color values live in `apps/desktop/src/styles/index.css`;
this document owns role and usage guidance rather than a second value table.

## 4. Typography

Use the native system sans stack:

- Apple platforms: `-apple-system`, `BlinkMacSystemFont`
- Windows: `Segoe UI`
- Chinese fallback: `PingFang SC`
- General fallback: `system-ui`, `sans-serif`

Do not assume IBM Plex, Inter, or another downloaded font is installed. Add a
font asset only when the product explicitly chooses to own and ship it.

Typography should feel precise, quiet, and technical rather than expressive.

Rules:

- headings should be compact and understated
- body copy should optimize for long reading comfort
- status labels should be crisp and quiet
- use the platform mono stack sparingly for technical hints, not as the dominant UI voice
- avoid giant marketing headlines
- avoid decorative editorial styling

Plain-text chat readability matters more than personality flourishes.

## 5. Layout Principles

The default layout should remain single-page with a standard desktop chat
application shape.

Core structure:

- one full-window app shell
- one `264px` left sidebar
- one main pane for the current conversation
- one message and composer column no wider than `46rem`
- one anchored composer near the bottom
- one quiet `48px` top bar inside the main pane

Layout behavior:

- use the full application window, do not float the UI as a small inset card
- the sidebar should stay low-noise and supportive
- the main pane should carry the visual center of gravity
- keep the message column readable, never excessively wide
- do not split the main pane into multiple major panels
- do not add a third workspace region in the default min-chat surface

The allowed default structure is: sidebar plus main chat pane. No more than
that. The explicit first agent-workbench workstream may add a Settings route for
Connections, but it must not turn the main surface into a dashboard.

## 6. Component Styling

### App Shell

- full-window layout
- minimal outer chrome
- no oversized outer padding
- no big decorative container wrapped inside the app window

### Sidebar

- quiet and useful
- contains product identity, `New thread`, and lightweight session context
- may show the current thread item only when it reflects real durable state
- should not pretend there is a full history system if one does not exist
- should feel like a standard chat sidebar, not a dashboard

### Main Header

- compact and supportive
- contains the page title and at most one lightweight status chip
- active submitting/streaming status may temporarily replace connection status;
  terminal turn status remains inline with the message
- should not become a command center

### Message List

- generous vertical rhythm
- assistant messages should feel mostly unboxed or very lightly framed
- user messages may use a darker filled surface, not a bright accent block
- message chrome should stay quiet so the text remains primary

### Composer

- the most important control region in the app
- large, comfortable textarea
- tactile and padded
- clear send and stop actions
- should feel dependable, not decorative
- may use the interface's only soft elevation shadow

### Status Pills

- small rounded pills
- light borders or tinted fills
- read as system feedback, not as marketing badges

### Error States

- inline and contained
- respectful tone
- clear retry affordance
- current-thread load/reset failure must remain blocked and safe
- malformed local data may offer only explicit New thread/Start fresh recovery
- avoid high-alarm visual treatment

### Empty State

- quiet and centered in the main pane
- invite the first prompt
- no illustration-heavy onboarding

## 7. Depth, Borders, and Motion

Depth should feel nearly flat.

Rules:

- rely on borders and separators more than shadows
- use very low-contrast elevation
- avoid glossy surfaces
- avoid heavy translucency
- avoid oversized blur
- use filled neutral surfaces for hover and user messages; reserve the accent
  for primary actions and focus

Motion should be subtle and purposeful:

- streaming can feel alive through content updates, not flashy animation
- transitions should support clarity
- avoid motion that makes the app feel like a landing page

## 8. Window Behavior

The current Electron window has a minimum size of `1080px × 720px`. This phase
keeps the desktop layout fixed within that supported range.

Guidelines:

- desktop keeps the sidebar and main pane
- do not add a compact rail, drawer, or mobile-specific navigation
- keep the composer comfortable at the minimum supported window size
- the main pane remains the primary focus at every size

A smaller-screen product can be designed when Nyx supports a smaller runtime
viewport; do not pre-build it in the current desktop client.

## 9. Do and Do Not

Do:

- keep the chat loop visually dominant
- use a familiar desktop chat shell
- keep the whole interface plain and useful
- favor subtle refinement over dramatic redesign
- design for long reading sessions
- make streaming, stop, retry, and new-chat actions feel clear
- keep restart recovery visually indistinguishable from a valid terminal thread

Do not:

- turn the UI into a dashboard
- fake history, settings, or tools that do not exist yet
- overuse gradients, glow, glassmorphism, or neon accents
- make decorative elements compete with conversation content
- use oversized radii or large empty margins that make the app feel like an inset card

## 10. Implementation Guidance for Agents

When editing Nyx UI:

- follow `AGENTS.md` and the current min-chat implementation plan
- preserve the single-page, plain-text chat scope unless implementing a named
  agent-workbench slice
- treat Electron main as the durable current-thread owner and renderer state as
  a rebuildable projection
- use a lightweight sidebar plus main chat pane layout
- keep the app ordinary and dependable, not flashy
- use the full window, not a centered child shell
- reuse existing theme tokens before adding new ones
- if a visual idea suggests a broader product scope than the current task
  allows, do not implement it

Good prompts for UI work in this repository:

- "Make this feel more like a standard desktop chat app, with less decoration and tighter geometry."
- "Refine the sidebar and main chat pane to feel closer to ChatGPT or Codex."
- "Keep Nyx dark, plain, technical, and comfortable for long sessions."
