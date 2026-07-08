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

## 2. Visual Theme and Atmosphere

Nyx should feel like a restrained desktop tool for people who spend a lot of time in AI chat.

The aesthetic should be dark, plain, geeky, and utilitarian. Think closer to ChatGPT or Codex than to a branded showcase page. It should look like a tool window, not a composition.

The interface should communicate restraint:

- dark default theme
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

Theme configuration can come later. For now, ship one solid dark default.

## 4. Typography

Preferred typefaces:

- Sans: `IBM Plex Sans`
- Chinese fallback: `PingFang SC`
- Mono: `IBM Plex Mono`

Typography should feel precise, quiet, and technical rather than expressive.

Rules:

- headings should be compact and understated
- body copy should optimize for long reading comfort
- status labels should be crisp and quiet
- mono should be used sparingly for technical hints, not as the dominant UI voice
- avoid giant marketing headlines
- avoid decorative editorial styling

Plain-text chat readability matters more than personality flourishes.

## 5. Layout Principles

The default layout should remain single-page with a standard desktop chat
application shape.

Core structure:

- one full-window app shell
- one left sidebar, roughly `240px` to `280px`
- one main pane for the current conversation
- one comfortable message column inside the main pane
- one anchored composer near the bottom
- one quiet top bar inside the main pane

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
- contains product identity, `New chat`, and lightweight session context
- may show temporary thread items only when they reflect real state
- should not pretend there is a full history system if one does not exist
- should feel like a standard chat sidebar, not a dashboard

### Main Header

- compact and supportive
- may contain page title and one lightweight status chip
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

### Status Pills

- small rounded pills
- light borders or tinted fills
- read as system feedback, not as marketing badges

### Error States

- inline and contained
- respectful tone
- clear retry affordance
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

Motion should be subtle and purposeful:

- streaming can feel alive through content updates, not flashy animation
- transitions should support clarity
- avoid motion that makes the app feel like a landing page

## 8. Responsive Behavior

Nyx should preserve the same chat-first mental model across sizes.

Guidelines:

- desktop keeps the sidebar and main pane
- on narrower widths, the sidebar may collapse to a compact rail or temporary drawer
- keep the composer comfortable on small screens
- keep touch targets generous
- the main pane remains the primary focus at every size

The small-screen version should feel like the same product, not a different app.

## 9. Do and Do Not

Do:

- keep the chat loop visually dominant
- use a familiar desktop chat shell
- keep the whole interface plain and useful
- favor subtle refinement over dramatic redesign
- design for long reading sessions
- make streaming, stop, retry, and new-chat actions feel clear

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
