# Phones and touch

How the page works on a phone and with a finger. Decided with the user on 2026-10-30 from a review of the page at 375 px and mock-ups
of proposals (in the scratchpad, not kept). The rule: **one design**. Nothing is a phone version; every change is a rule about room
("a panel never leaves the dashboard too narrow") or about the input ("a finger cannot hover"), so a narrow desktop window follows it
too, and a desktop with a mouse looks and works as before.

## What changes with the room

- **Top menu** ([top-menu.md](top-menu.md) "Narrow"): the island folds by priority as its room shrinks (container queries on `.tm`):
  the logo (860 px), the "Editing" prefix (700 px), then Export, CMD, Edit and Help go behind **⋯** (620 px: a list with their keys,
  `ctx.topPanel == "more"`), then the rate keeps only its ring and, while editing, Done takes the place of the rate chip (460 px). The
  name of the dashboard is cut with an ellipsis, never dropped. Under 460 px the popups of the island are as wide as the island. `.main-panel` clips what is wider than the workspace (`overflow-x: clip`), and the workspace puts back any sideways scroll: a child too wide once moved every view 61 px to the left. Not `.tm`: it has no height, and Safari on iPhone then clipped the whole island (invisible, yet it took the taps).
- **Panels as sheets** (`style.css` "Sheets", `main.js`): under 640 px of window, every dock (Telemetries, Sources, Help, Export and
  import, the edit panel) rises from the bottom instead of taking room beside the dashboard: the same panel, rounded at the top, over
  the lower part of the dashboard. The workspace gets the height of the sheet as room at its bottom, so every view can be scrolled
  above it: a telemetry can be dropped on any view, a message tried in the Help seen arriving. One sheet at a time (opening one closes
  the others; the edit panel waits under another one: `sheet-under`). The grip at its top sets its height (`--sheet`, 12 % to 92 % of
  the window, 55 % at first); let go under 25 %, the sheet closes (the edit panel stays at 30 %). Panels size their lists from
  `--panel-vh` (the window on a desktop, the sheet here). In edit mode, the selected element is scrolled into the part above the sheet
  (`revealSelection`). The editor's "+" slots are clipped to what the sheet leaves.
- **Heights**: `--vh` is `100dvh` where browsers know it (`100vh` counts the room under the toolbar of a phone's browser).
- **Stacks**: their tabs scroll sideways when they do not fit.

## What changes with a finger

- **The page scrolls, not the workspace** (`pointer: coarse`, `pageScrolls()` / `dashboardScroller()` in `main.js`): the browsers of
  phones hide their bars (address, tabs) only when the page itself scrolls, never an element in it. The docks beside the dashboard stay
  in view by being sticky; sheets are fixed. With a mouse the workspace still scrolls by itself between the docks. Code that scrolls the
  dashboard or listens to its scroll goes through `dashboardScroller()`, `scrollEventsOf()` and `scrollerTop()`.
- **Press, then drag** (`dashboard-editor.js`, `E.touchLift`, `E.pressTelemetries`): HTML5 drag and drop does not start from a
  finger. A press of 300 ms without moving lifts a telemetry tile, a group or a label card of the Telemetries panel (a light vibration
  where there is one): the sheet steps down to its grip, the "+" slots show as during a drag of the mouse, the telemetry follows the
  finger (written above it), the page scrolls near the top and bottom edges, and letting go drops it where the mouse would have (a
  slot, a view, the end of the container under it). A finger that moves before the press is long enough scrolls. The rows of the
  Edit panel's list of telemetries reorder the same way. The mouse keeps the drag and drop of the browser.
- **Views share the finger with the page** (library, [`109-touch.js`](../packages/teleplot-js/src/109-touch.js)): one finger scrolls
  the page, two fingers move what a view shows, a double tap does what a double click does. Views have `touch-action: pan-x pan-y`.
  - Charts and timelines: a tap holds the group at that moment (as a click), two fingers pinch the time (spread: shorter window;
    moved sideways: earlier or later; `TELEPLOT.view.pinchWindow`, then `zoomTo`, which holds the group), a double tap is back to live.
  - 2D map, graph: two fingers pan and zoom (what was under them stays under them), a double tap frames the view again. A one-finger
    drag on them shows "Two fingers to move the map" for a moment (not more than every 4 s).
  - 3D scene: the orbit controls of three.js take no finger (they give two fingers only two of slide, zoom and turn); the view
    moves its camera itself (`ViewScene3D.touchOrbit`, tested): two fingers moved together slide the scene with them, spread come
    closer, twisted turn it around the vertical; three fingers turn it up and down and sideways (as a mouse drag); a double tap frames
    it. The hint of a one-finger drag: "Two fingers to move the scene, three to tilt it".
  - What is moved by hand keeps one finger: a writable pose or point on the 2D map (CMD on; its handles take a finger over twice the
    distance a mouse needs), the joystick, a value bar. A button that must be held (an action with `longpress`) keeps the finger too: nothing is selected, no menu of the browser, no scroll (`.teleplot-js-cmd-hold`).
  - `TELEPLOT.view.touchGestures(element, {owns, pinch, pinchEnd, doubleTap, hint})` is the helper; `pinchStep`, `isDoubleTap` and
    `pinchWindow` have no DOM ([tests/touch.test.js](../packages/teleplot-js/tests/touch.test.js)).
- **The island** (top menu): after a touch, it no longer fades on a timer. The focus a tap leaves on a button does not keep it then (it would never go). Commands on (CMD ON) do not keep it either, with a mouse too: it comes back as soon as the mouse moves or the dashboard is scrolled up. It slips away when the dashboard is scrolled down and comes
  back when it is scrolled up, or on a tap in the band it left (`.tm-catch`: that tap goes no further, so it does not hold a chart). A
  tap on the island (not on a button) opens the row of the time line until a touch elsewhere. The line takes a finger only while its row is open (before, a finger on it opens the row: a tap low on a button used to hold the time); the rate button takes the whole height of its chip. While the chosen time group is not live,
  a red **LIVE** button sits on the island itself (what Esc does). A mouse moving again brings back the fade on a timer.
- **Held = hover** ([`components/touch-tips.js`](../packages/webapp/components/touch-tips.js)): a finger held still for 450 ms on
  something with a tooltip shows it (the `title`, so a telemetry's unit and description, or the tip of a button of the top menu), and
  the elements under it are told `mouseenter` (a series of a chart lights up, a part of a message in the Help is named). Letting go
  puts everything back and drops the click of the release. Not on what is held on purpose (`touch-action: none`: joystick, bar, pill).
- **Sizes** (`pointer: coarse`): small controls take a finger over a larger area than they draw (an invisible `::after`: panel close,
  group headers, the buttons of the time line row and the line itself over 24 px, the "+N" chip of a legend, pills and their buttons);
  fields are 16 px (under that, Safari on iPhone zooms the whole page when one takes the focus).

## Keys and their buttons

Esc: LIVE on the island (with a finger) or in the time row; Shift+Esc: "All groups live" under ⋯ of the time row; Space: ▶ / ❚❚ of the
time row; Home / End: drag the line to its ends, End = LIVE; Alt+arrows in edit mode: drag the pill (it takes a finger); arrows in edit
mode: the size buttons of the selected pill.

## Not done

- Checked in Chromium with phone sizes and synthetic touch events, not yet on a real iPhone and Android phone: how a browser shares a
  swipe between the page and a view (two fingers that land one after the other, a press that the browser takes for its own menu) can
  only be seen there.
- Rows of the Sources panel's commands keep their size.

---

[All documentation](README.md) · [Teleplot](../README.md)
