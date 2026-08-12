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

The explicitly requested `multi-thread-library` workstream is the precise
exception. Inside its active qualified UI slice, Nyx becomes a real local
Thread Library while keeping the same quiet two-pane shell: the sidebar owns
orientation and collection navigation, and the main pane remains the selected
Thread. This workstream must not turn the product into a dashboard or add a
permanent third region.

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

The Multi-Thread Library uses this same structure. Archived, Trash, and Search
replace the sidebar collection rather than opening another page-level pane.
The main pane must show a Thread from the active sidebar mode or that mode's
empty state; it must never leave an editable Thread from another collection on
screen.

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

Inside the active `multi-thread-library` UI slices, the Sidebar may show only
real main-owned data in this order:

```text
Nyx
New thread
Search
Pinned
Recent
Archived
Trash
Connections / Local user
```

Nyx, New thread, and Search stay fixed at the top. The current Pinned/Recent,
Search-results, Archived, or Trash collection is the Sidebar's only scrolling
region (`min-height: 0; overflow-y: auto`). Archived, Trash, Connections, and
Local user stay fixed at the bottom; in Archived/Trash mode, Back to threads
stays fixed immediately above the scrolling collection. A long list must not
bury these controls.

Thread collections load 50 summaries at a time. A keyboard-reachable
`Load more threads` follows the loaded rows; it is not a Thread row. Loading,
initial failure, load-more failure, and end-of-collection are explicit states.
Initial failure replaces the mode detail with `Couldn't load threads` and
Retry; load-more failure preserves loaded rows, detail, focus, and scroll and
shows `Couldn't load more` with Retry at the tail. Home/End move only through
loaded rows. Loading more moves focus to the first new row and announces the
count once; reaching the end removes the button and announces it once.
Any valid selection beyond loaded rows uses one rule, including startup restore,
Back, Cancel Search, Search result open, Pin/Unpin/Move, and concurrent reorder.
Keep its selection, detail, and collection scroll and announce the full title
and destination once. Exact Search matches keep their Thread-heading,
Composer, attachment, or Turn focus; otherwise focus `Load more threads`. Each
explicit load keeps focus on Load more until the target appears, then focuses
that row. A load failure keeps the target and focuses Retry; an invalid target
falls back deterministically.
Reaching the end with a still-valid missing target retries the collection once,
then shows `Couldn't load threads` rather than looping or inventing a row. Do
not auto-load an unknown number of pages or render the target out of canonical
order.

- Pinned contains manually ordered Available Threads; those rows do not repeat
  in Recent.
- Recent uses stable user-activity order. Background completion must not move a
  row.
- Archived uses the same stable user-activity order. Trash shows most recently
  moved rows first, with a stable created-time/id tie-break; neither collection
  may jump order after restart.
- A normal row shows its title and only one highest-priority status: failure or
  Interrupted, Running, Unseen completion, then Draft. Search results may add a
  short match snippet.
- Available, Archived, Trash, and Search are explicit sidebar modes. Row
  removal falls to the next row, then the previous row. Only an empty Available
  mode may show the untouched New-thread placeholder; Archived/Trash show their
  own empty state, and Search returns focus to its input.
- Search has a visible, keyboard-reachable `Cancel search` control. Cancel (or
  Escape on an empty query) restores the pre-search mode and its still-valid
  selection. Opening a result is different: it exits Search into the matching
  Available/Archived mode, keeps that Thread selected, and focuses the exact
  title, Draft, attachment, or Turn match. Editing a Draft result must never
  leave focus attached to a row that disappears from Search.
- Archived and Trash show a visible, keyboard-operable `Back to threads`
  control above their collection. It restores the last valid Available row (or
  the first row/New thread fallback) without changing any Thread; a failed
  Draft save leaves the old mode and detail in place while focus enters the
  safe save-failure dialog.
- Archived Threads are readable and offer Unarchive without requiring a new
  message. Sending also restores the Thread to Available. Both actions keep the
  Thread selected and move the UI to Available; a menu Unarchive returns focus
  to the selected row, while a main-pane action or Send returns it to Composer.
  Trash is read-only
  and explicitly says its Threads remain stored on this device and continue to
  use storage. Until the separately accepted P1 it offers Restore only: do not show
  a disabled, hidden-menu, or otherwise fake Delete permanently affordance.
  Delete permanently appears only inside the separately accepted P1 slice.
- Thread, mode, and Search navigation waits for the current Draft save ack
  before closing a full-image view or unmounting the old detail. Failure leaves
  the old detail in place while focus enters a trapped
  Stay/Retry/explicit-Discard dialog. Stay is the initial focus, Escape chooses
  Stay and returns focus to the trigger; failed Retry stays in the dialog, and
  successful Retry/Discard follows the destination's focus rule. Discard names
  the unconfirmed text, attachments, and safe target-label rollback without
  exposing provider configuration. Success mounts only the new selected
  Thread's images, restores its Draft/reading position, and never cancels a
  background Run. Packaged acceptance must exercise distinct image-bearing
  Threads, not repeated views of one cached URL.
- A native title-bar Close or Cmd-Q has no DOM trigger. Before showing its save
  confirmation, remember the last connected, non-inert content focus. If a
  full-image `<dialog>` is open, reuse that top-level dialog for the
  confirmation instead of stacking another modal; Stay/Escape returns to its
  last valid control (or its Close fallback). Otherwise Stay returns to the
  remembered content focus, then the selected row/Composer fallback. Successful
  close/quit has no pretend focus destination.
- Running Archive/Trash asks the user to Keep running or Stop and move. It must
  not silently hide or cancel work. Keep running is the initial/default focus,
  Escape cancels, focus remains trapped in the dialog, and cancellation returns
  focus to the original trigger without saving or discarding the Draft. Only
  Stop and move proceeds to the Draft Stay/Retry/Discard barrier. Draft
  ack/explicit Discard is followed by one exact Run recheck, then abort/move,
  direct move after a winning terminal, or Retry saving after settlement
  failure; the running dialog is not shown twice.
- A Thread with an unsaved terminal result is not Running or durably complete.
  Archive/Trash first focuses `Retry saving`; it must not hide the row or open a
  Stop dialog. If Stop-and-move was already chosen, Retry saving completes that
  exact settlement and move together without repeating the Provider call.
- When collapsed, the Sidebar toggle still exposes a quiet attention indicator
  and accessible count. A completion becomes seen only when the focused,
  foreground window actually shows its terminal/bottom anchor.
- Each Thread collection has one roving Tab stop. New, Search, Archived/Trash,
  Back to threads, and Connections remain normal Tab stops. Arrow/Home/End move
  row focus; Enter opens; Shift+F10 opens the row menu. F2/Rename exists only
  for Available and Archived; Trash has no Rename action and offers Restore
  only before P1. Pin ordering always has Move up/down/top/bottom alternatives
  to drag.
- Pin/Unpin keeps the same Thread selected and moves focus to that Thread's
  remounted row in Pinned/Recent when loaded; a cross-page target uses the
  Load-more focus rule above. A failed move preserves the old row, focus, and
  collection scroll positions.
- Search covers titles, Main-confirmed Draft text, sent messages, and verified
  Draft/Turn attachment text. It never indexes unconfirmed Composer content;
  Draft hits return to the Composer or matching attachment without clearing it.
  IME composition does not dispatch queries; typing is debounced and stale
  work is coalesced so Search cannot queue ahead of Draft saves or Run
  settlement.
- A new debounced Search clears old results, visibly marks the collection busy,
  and shows `Searching`. Only an epoch that actually dispatches announces
  `Searching`, then one complete-count, no-result, or first-50 update in a
  polite live region. Clearing the query, Cancel, or opening a result synchronously removes
  visible Searching/busy state; replaced pending, stale, cancelled, and
  post-exit results cannot restore it or announce. Result accessible names
  include the full Thread title, match source, and bounded snippet.
- Latest-query failure clears busy and old results, preserves the query, and
  shows `Couldn't search` with Retry while focus remains in the Search input.
  Activating Retry returns focus to the input and uses a new query epoch; late
  success or failure cannot alter or announce after a newer query, Cancel, or
  result open.
- Search returns at most 50 Thread results. When more exist, the visible status
  and polite announcement say `Showing first 50 results`; never label the first
  50 as the complete count. Q1 does not add Search pagination.
- Before first Send, an automatic Thread title follows the last Main-confirmed
  Draft: normalized text first, then a safe document name, then `Image`, then
  `Untitled draft`. The two generic fallbacks include the once-persisted local
  creation second (`Image · YYYY-MM-DD HH:mm:ss`); same-second collisions get a
  stable ` · 2`, ` · 3` suffix allocated once by the Library. Restart, timezone
  changes, or Rename never renumber them. Deleting one never renumbers surviving
  Threads; a future Thread may reuse its freed ordinal. First Send freezes the
  automatic title; a manual Rename is never overwritten.
- Manual Rename uses the same Main-authoritative validation in every entry
  point. After trimming, a title must contain 1–48 Unicode code points; longer
  input is rejected, never silently truncated, and duplicate titles are
  allowed. Invalid Enter keeps the original title, edit text, input focus, and
  an associated field error; Escape restores the original title. Rows, Search,
  accessible names, and result-loss dialogs use the full accepted title, with
  creation time/full Thread ID providing duplicate-title disambiguation.

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
- the legacy single-current-thread format may offer explicit Start fresh only
  before the Multi-Thread Library cutover
- if the Thread Library Worker, database open/schema/quick-check, or permission
  validation fails, preserve the database, journals, sidecars, staging, and old
  root. Show `Couldn't open Thread Library` with Retry only; do not show New
  thread, Start fresh, or any destructive reset, and do not authorize Thread
  mutation, Provider start, detail, Search, or image reads
- Library failure focuses Retry only when a Thread surface is visible. If the
  user is editing Connections or another still-available surface, keep that
  route, input, and focus and announce the failure once; focus Retry when the
  user next enters a Thread surface
- if one identifiable Thread's canonical content cannot be rebuilt, or its
  exact Responses repair fails, keep its row in its stable location with the
  highest-priority error and show
  `Couldn't open this thread` with Retry only. This whole-Thread state is only
  for canonical Thread/Draft/Turn reconstruction or failed exact Responses
  repair. A bad image/document remains an unavailable resource placeholder;
  healthy text/resources and verified extracted text stay usable. A corrupt
  Responses continuation first clears only its exact identity reference and
  falls back to durable visible text. If safe Thread identity/location is
  unknown, use the Library-wide unavailable state
- when a Thread surface is visible or next entered, first entry into Library
  unavailable focuses Retry; the failure announcement still occurs only once.
  Retry failure keeps focus there and announces once per attempt; success
  focuses the deterministic restored row/New thread. A selected Thread error
  follows the same rule and restores its Thread heading; a background Thread
  error updates only its row and never steals focus
- a failed Draft save keeps the current Thread, text, attachments, target, and
  mode in place while focus enters the safe Stay/Retry/Discard dialog;
  navigation never discards an unacknowledged Draft without explicit consent
- app quit first completes that same save/confirmation flow without stopping
  Runs, then checks every Thread whose complete generated result failed to save.
  A process-wide confirmation defaults to Stay and offers exact Retry saving or
  `Quit without saving N results`; Retry never calls the Provider. It lists each
  affected full Thread title and stable creation time, adding the full Thread ID
  only if those still collide, and updates after partial Retry/new failure. The
  DOM and VoiceOver/native-dialog text match. A full-image dialog remains the
  one top-level modal, while a no-window app uses the native system dialog. Only a successful Draft save/explicit Draft Discard and either
  saved results/explicit result loss may enter the final shutdown phase. Stay
  or a failed save cancels quit and leaves background work running
- if final shutdown itself creates another unsaved result, Nyx must remain open
  at the same result barrier until exact Retry succeeds or the user explicitly
  confirms that new loss; it must not close the Worker or silently exit
- failed terminal settlement uses `Retry saving`, distinct from Provider Retry;
  failed permanent deletion exposes only generic deletion status and Retry
- avoid high-alarm visual treatment

### Empty State

- quiet and centered in the main pane
- invite the first prompt
- no illustration-heavy onboarding
- Thread Library empty states are mode-specific; Archived, Trash, and Search
  must not expose an Available Composer

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
- inside a named `multi-thread-library` slice, treat Electron main as the
  durable Thread Library owner and keep Renderer to summaries, the selected
  Thread projection, and one current dirty Draft overlay
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
