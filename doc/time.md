# Time: receiving, holding, replaying

Decided with the user and built on 2026-10-28. Mock-ups were made in the scratchpad (not kept: see [README.md](README.md)); this page is what was decided, and how it is done.

Until now one flag, `TELEPLOT.state.isPaused`, meant two things (stop storing what the devices send, and stop moving the display), and a zoom was a third state that the pause button, `Space` and `Esc` each handled in their own way. They become two independent switches:

- **Receiving** decides what reaches the store. One switch for the page.
- **Time shown** decides which part of the store the views draw. One state per time group (see [dashboard-editing.md](dashboard-editing.md) "Time groups"): Live, Held at a moment, or Replay at a speed.

Neither changes the other: a held display keeps recording, and stopping the reception does not move the display. Teleplot still never invents data (no interpolation): at any time shown, every view shows the last sample at or before that time.

## Receiving

- `TELEPLOT.state.receiving` (true by default). When false, incoming data is not stored: it is lost. `TELEPLOT.state.receivingOff` says why and since when: `{by: "user" | "memory", at}`.
- `TELEPLOT.state.isPaused` stays as an alias of `!receiving` for a while (tests, older code).
- The memory policy `"pause"` becomes `"stop"` (`"pause"` still accepted): at the limit, reception stops with `by: "memory"`.
- Files are not sources: an imported file is stored whatever the switch says (today the import lifts the pause for its duration: it keeps doing so).
- Commands need reception on: the echo of the device is the acknowledgement (unchanged, see [telecmd.md](telecmd.md)).
- The serial console still shows the lines while reception is off (see [sources.md](sources.md)).
- **Periods not received**: each data entry remembers the hole a stop of reception left in it, in the time of its own data: from its last sample before the stop to its first one after (`entry.gaps`, `Telemetry.gapsOf(entry, from, to)`, `TELEPLOT.datastore.gapsIn(telemetries, from, to)` merged; while still off, the hole is open from the last sample). Not on the page's clock: a device may date its data on its own clock (an hour off, since boot...), and the server dates plain lines when it received them, a little before the page restarts reception; a period on the page's clock missed both (fixed 2026-10-30). `TELEPLOT.datastore.offPeriods` still says when, on the page's clock, reception was off. Charts do not join samples across a hole: the line breaks, and the hole is hatched. The time line of the top menu hatches it too. This explains a gap, it does not make up data. A file read while reception is off leaves no hole.

## Time shown

### State of a time group

`TELEPLOT.view.groups[name]` gets:

| Field | Meaning |
| --- | --- |
| `mode` | `"live"`, `"held"` or `"replay"` |
| `at` | the time shown when not live (never negative: a negative time means "latest" to `getDataPoint`) |
| `speed` | replay speed: 0.25, 0.5, 1, 2, 5 or 10 |
| `span` | the zoom: a duration, or 0 for the whole data window |
| `window` | `{from, to}`: the period on the axis of the charts while not live (frozen), null when live |
| `cursorTimestamp` | the pointer's moment (unchanged: hovering a view previews a moment, see below) |

How it is stored: `window` is the fields the views already read, `cursorActive` (a window is in force), `timestampFrom` and `timestampTo`, so that every view (charts, timelines, logs, scenes, images) follows without change; they are always set while held or replaying, and while live with a span (moved on each update to the last `span` seconds). `cursorTimestamp` is `at` while not live (scenes, values and images show it), the pointer's moment while it is on a view of the group, -1 (the latest) while live. `TELEPLOT.view.timeOf(group)` gives `{mode, at, from, to, speed, span, movedWithWindow}` (live: `at` is the newest sample); the time of a group is what the telemetries of its views cover (`groupExtent`, `groupTelemetries`).

### Modes

- **Live**: follows the newest sample. Charts show the whole data window, or the last `span` (a sliding window).
- **Held at t**: the display stops at `t`. Data keeps arriving and is stored, but the charts do not take it: their window is frozen when the group is held (whole window: from the oldest to the newest sample at that moment; with a span: see "Charts").
- **Replay ×N from t**: `t` moves by `elapsed × speed` on every update (a hook of the update loop, `998-update.js`, on `performance.now()`), never past the newest sample. When it reaches the newest sample, the group becomes Live by itself.
- **Held moment older than the data window**: it moves with the oldest stored sample. The time line's tooltip says "moved with the data window".

Each time group keeps its own time: one can replay while another is live (the robot sample's custom "Live" group keeps its camera live while the charts of the dashboard are held).

### What the views show

- **Charts**: every sample of their window is drawn, before and after `t`. A cursor line at `t` in the color of the mode (blue held, purple replay) tells which moment the other views show. With a span, the window is placed so that `t` sits at 70 % of its width (data before it, and what comes next). The window never starts before the oldest sample: near it, `t` moves to the left. When `t` is the oldest sample itself, the axis starts 6 % of its width before it (empty room, as the room charts and timelines already leave after a latest state), so the cursor line is never on the frame.
- **Timelines**: the same window and cursor line as charts.
- **Logs**: the lines of the window; the line at `t` is highlighted and scrolled into view, as the cursor already does.
- **Values, 2D, 3D, images, graphs**: what was current at `t`.
- **Pointer preview**: hovering a chart, timeline or log of a group previews that moment in the other views of the group (`cursorTimestamp`, as today). When the pointer leaves, they show `t` again. A preview never changes the mode.

### Commands

In a view whose group is not live (held or replaying), command controls send nothing: editing a value, the bar of a setting, the joystick, the pose of a 2D view. They say "Robot group is not live" with a **Go live** button (`backToLive` of that group), the way they say "Commands are off" today (`TELEPLOT.commands.blockedWhileOff`). Views of other, live groups keep their commands. `TELEPLOT.view.isLive(group)`.

### Library calls

In `100-views.js`: `TELEPLOT.view.hold(group[, at])`, `play(group[, speed])` (from live: from the start of the window on screen), `togglePlay(group)`, `seek(group, at)`, `step(group, ±1)` (to the previous or next real sample of the telemetries of the group's views: `sampleNear`, a binary search per telemetry), `move(group, {seconds, samples})` (added up, applied on the next update), `setSpeed`, `changeSpeed(group, ±1)`, `setSpan(group, span)`, `zoomTo(group, from, to)`, `backToLive(group)` (also drops the span), `allLive(base)`, `pointerLeft(group)`, `isLive(group)`, `timeOf(group)`; `TELEPLOT.view.__updateTime()` is the hook of the update loop (`998-update.js`, before the views) that moves replays, applies moves and follows the data window. `TELEPLOT.view.lastHeld` (`{name, count}`) tells a GUI which group was last held (a click in one of its views). Constants `PLACE` (0.7), `ROOM` (0.06), `SPEEDS`.

## The top menu

Proposal A of the mock-ups (see [top-menu.md](top-menu.md) for the rest of the menu).

```
[logo] [Robot v] | [● 412/s] | [Telemetries] [Sources] | [Edit] [Help]
[▶] 14:02:42.3 −18 s                              [● LIVE] [⋯]    <- the row, on hover
=========================o------------------------------------    <- the line: always the bottom edge
```

| Part | Behaviour |
| --- | --- |
| Record switch (the dot of the rate chip) | Green: storing. Click or `R`: stop or start receiving. Its tooltip says what will happen ("Stop receiving · R"). |
| Rate | Opens the data menu, as today. The data menu starts with a **Receiving** switch, with who stopped it and when. |
| ⏯ | Hold or resume the chosen time group, same as `Space`. |
| Time shown | "live", or the time of the moment shown and how far behind live it is, with the speed while replaying. |
| LIVE | Red when live; grey otherwise, click it (or `Esc`) to go live. |
| ⋯ | Speed, step, and "Time group ›" behind one more click. |
| The line | The stored data from the oldest (left) to the newest (right). 3 px at rest, 6 px on hover, with a hover zone of 10 px. Click or drag: hold there. |

- **The line** is the bottom edge of the menu, at rest and on hover: it never moves, it only thickens, and a knob shows `t` when the group is not live. It is drawn only when it has something to say, or while the row is open (decided with the user 2026-10-30): live with no period not received in view, or no data at all, it is not drawn (its place stays, to be pointed at). Open and live: the data in grey, a red dot at the newest end. Held: blue up to a round knob, the data after it in grey. Replay: the same in purple. Not received: hatched amber (shown at rest too, with the red end while live). Periods with no data at all that are longer than 10 s and 5 % of the line (an old file next to live data) are folded to a 6 px mark, and a replay jumps over them.
- **The row** opens 120 ms after the pointer enters the menu, or when the keyboard focus enters it. It closes 400 ms after the pointer leaves, but stays open while dragging on the line or while ⋯ is open.
- **⋯** has the speeds (0.25× to 10×), previous / next sample, and "Time group: Robot ›", which opens the list of the time groups of the dashboard with their state (hovering one frames its views) and **All groups live**. The chosen group is the dashboard's by default, and again after switching dashboard. When another group is chosen, its name shows in the row. Clicking a log line, a graph chip or a timeline band holds the group of that view and chooses it.
- **Not receiving**: the rate chip turns amber ("not receiving", or "memory full") and a tab under the menu says "data sent now is lost · Receive" (or "Memory full (1 GB) · not receiving · Data menu").
- **Menu away**: the line and the tab fade out with the menu (after 3 s without activity, see [top-menu.md](top-menu.md) "Auto-hide"). Nothing stays on screen: the cursor lines and the times written in the views tell that a group is not live, and any mouse move brings the menu back. The amber "Paused" chip of today is removed.

## Actions and keys

| Action | Effect |
| --- | --- |
| `Space`, ⏯ | Chosen group: Live or Replay → Held at the time shown. Held → plays again (Live if it was live, Replay at its speed otherwise). Never touches reception. |
| Click or drag on the line | Chosen group → Held at that time |
| LIVE, `Esc` | Chosen group → Live (`Esc` first closes an open popup, as today) |
| `Shift + Esc`, All groups live | Every group of the dashboard → Live |
| Speed in ⋯, `-` `+` | Chosen group → Replay at that speed from the time shown (`-` slower, `+` or `=` faster) |
| Previous / next in ⋯, `←` `→` | Chosen group → Held at the previous / next real sample |
| `R`, record switch | Reception on ↔ off |
| Click on a chart (not a drag), on a timeline | Its group → Held at that moment |
| Drag on a chart or a timeline | Its group is held and its window is the selection (`span` = its duration). Resuming plays it with that span. |
| Double click on a chart or timeline | Back to live, as Esc (that group only). |
| Click a log line, graph chip, timeline band | Its group → Held at that sample, and it becomes the chosen group |
| Touch a command in a group that is not live | Nothing sent, "Go live" for that group |

Change from the mock-ups: they had "drag on a chart sets the span, Live stays live". A live window that slides would move the selection away as soon as it is made, so a drag also holds the group.

**When the time line is active** (its row is open under the pointer, or the keyboard focus is in the menu):

- `Home`: the oldest sample. `End`: live. (The arrows work anywhere: `←` `→` previous / next real sample, `Shift + ←` `→` by 1 % of the period of the line; and `-` `+` the replay speed. These keys are typed without Shift or AltGr on every layout, unlike `,` `.` `[` `]` on AZERTY.)
- **Mouse wheel** over the menu: each notch moves the time shown by 1 % of the period of the line (a trackpad moves it in proportion to its delta). Down or right: later. Up or left: earlier. `Alt +` wheel: one real sample per notch. Leaving Live this way holds the group. The wheel is taken (`preventDefault`, on a non-passive listener of the menu only) so the page does not scroll meanwhile. Elsewhere the wheel keeps its uses (zoom of 2D, 3D and graph views, scrolling the page).
- Not while typing in a field, nor while a joystick view has the focus (it keeps its keys: `TELEPLOT.commands.keyboardCaptured`).

**Focus**: a mouse click no longer leaves the focus on any button of the page (the webapp drops it on `pointerup`, as the top menu does today with `release`), so `Space` never presses a button again (it used to repeat a Help "Send").

## Performance

What the page does on each update (30 per second) must cost no more than live display does today. See [performance.md](performance.md) "Chart display: min/max decimation".

- **Held, nothing moves**: the window of the charts is frozen, so their display key does not change: no `setData`, no redraw. Data keeps being appended to the store, which costs what it costs live.
- **Moving `t` inside a frozen window** (step, wheel, keys, dragging the knob, replay without a span): only the cursor line moves. It is a DOM element over the chart (`u.over`, placed with `u.valToPos`), not something drawn on the canvas: no series is drawn again. The other views update at `t` as they do for a hover today.
- **A window that moves** (replay with a span, a seek out of the window): `setData` and `setScale` once per update, the same work as a live chart whose data moves. The decimator caches buckets aligned on absolute time: moving forward reuses them (`dropCacheBefore`, then only the new samples are scanned); moving back rebuilds the cache over the window only. The bucket width only changes when the span doubles or halves.
- **Wheel and keys are coalesced**: events add to a pending move, applied once in the next update (never one update per event).
- **Previous / next sample**: a binary search (`_lowerBound`) in the timestamps of each telemetry of the group, never a scan.
- **The line of the menu** is drawn only when its key changes (its pixel width, the knob's pixel, the mode, the periods not received): at most one draw per pixel the knob moves. It is not drawn while the menu is away.
- **Replay clock**: `t` advances from `performance.now()`, so a slow update does not slow the replay down: it shows a later time. At 10×, pictures and depth maps skip what they cannot decode in time (one decode in flight, only the latest waits: see [depth.md](depth.md)).
- **Data that keeps coming while held** does not draw the charts again (their window is frozen: `ViewChart.update` only looks at new data while live), and a cursor that moves no longer draws them again either (it used to: the legend values follow it, not the canvas).
- `test-performance.html` has `time` (live / held / replay), `speed` and `span` options. Measured on 2026-10-28 (Chromium, 4 series at 5 kHz, 15 s window, one chart, 60 fps in every case), time of the update of the views: live 3.05 ms, live with a 5 s span 3.72 ms, held 1.09 ms, replay 1× (whole window) 3.04 ms, replay 10× with a 5 s span 3.67 ms; the hook of the time shown takes 0.01 to 0.25 ms. A replay over the whole window still draws the charts again when the data window moves their oldest sample (4 times per second): the cost of live.

## The chart library (uPlot)

What the charts need from uPlot, checked against `111-viewChart.js`:

- **The window**: `setScale("x", {min, max})` inside `batch` with `setData`, as the zoom does today. The `setScale` hook already ignores the chart's own updates (`updateRunning`), so a window placed by the page is never read as a zoom of the user.
- **Drag to zoom**: uPlot's select calls the `setScale` hook, which now holds the group and sets its window and span. A double click resets uPlot's scale to its data; the hook already recognises it and brings the group back to live, as Esc.
- **Two lines**: uPlot has one cursor per chart, and it stays the pointer's (the hover preview, and `syncCursor` on the other charts). The line of `t` is a separate element in `u.over`, styled from the theme (`--teleplot-primary` held, a new `--teleplot-replay`), hidden when `t` is outside the scale. It is placed again on `setScale` and on resize.
- **Data after `t`** is drawn as any other: no series split, nothing dimmed.
- **Breaks at periods not received**: the decimated series of a chart gets an explicit `null` inside each hole of its entry in its window (`ViewChart.breakAt`; decimation keeps samples on both sides). uPlot breaks a line at `null` and spans `undefined` (what `uPlot.join` puts where a series has no sample at a time of another), so the series still join each other's timestamps. A test loads the real uPlot to check it (the tests run on a stub). The period is hatched in the `drawClear` hook, under the series (`drawNotReceived`).
- **Wheel**: uPlot does nothing with the wheel (zooming with it needs a plugin, which Teleplot does not use), so the wheel of the time line does not compete with the charts.

## Where it is

- Library: `010-state.js` (`receiving`, `isPaused` alias), `012-datastore.js` (`setReceiving`, `offPeriods`, the memory policy), `100-views.js` (group state and calls), `998-update.js` (the hook), `111-viewChart.js` (head line, breaks, hatching, no redraw while held, click and zoom), `112` / `116` / `118` (pointer, click), `025-commands.js` (`whyNotIn`), `110` / `115` / `117` (commands not live), `104-theme.js` (`--teleplot-replay`, `.teleplot-js-chart-head`). Tests: `tests/time.test.js`. Demo: `test.html`, section Time.
- Webapp: `components/top-menu.js` (record switch, time line, row, ⋯, tab, keys, wheel; the Paused chip is gone), `main.js` (`ctx.timeGroup`, `Esc` / `Shift + Esc`, no button left focused after a mouse click), `panel-help.js` (shortcuts, the tile "Keep more or less"), `panel-sources.js`, `panel-export.js` (a file's period is a `zoomTo`).
- Not done: per source reception (only the page's switch), and the timeline view does not hatch the periods not received (charts and the time line do).

---

[All documentation](README.md) · [Teleplot](../README.md)
