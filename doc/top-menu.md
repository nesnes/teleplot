# Top menu

The top menu is a GUI feature (`packages/webapp/components/top-menu.js`): a floating island centred above the dashboard. It fades out when the mouse rests (see Auto-hide), to leave the whole stage to the data. The library only provides what it shows (`TP.state.isPaused`, `TP.datastore.telemetries`, `TP.connection.connections`, `TP.dashboards`). The side panels stay docked on each side of the workspace, and the island takes the room that is left between them (it drops the logo, the shortcut hints, then the "Editing" prefix when that room is small).

```
[logo] [Dashboard v] | [pause | rate v] | [Telemetries 24] [Sources 2] [Export] [Help] | [Edit]
```

## Controls

- **Dashboard**: the dashboard list (the auto "Live" dashboard first, then the others, "New dashboard" at the bottom, a pencil to edit one, a bin to delete one). Deleting is confirmed in place: the row turns into `Delete "name"? [Cancel] [Delete]`, the list stays open, and a deleted dashboard that was displayed gives its place to the first of the list. The auto dashboard cannot be deleted. While editing, the name is prefixed with "Editing".
- **Pause / resume**: toggles `TP.state.isPaused`. While paused the library ignores incoming data, so every view freezes and nothing is recorded. The control turns amber and shows "paused".
- **Rate**: samples received per second, all telemetries together (estimated from the latest timestamps, see `components/telemetry-rate.js`, shared with the Telemetries panel). "idle" when the data stopped coming, "no data" before anything arrived. The caret opens the data menu (see below).
- **Panels**: Telemetries, Sources, Export (not available yet, shown disabled), Help. They are exclusive (`ctx.sidePanel`), so they are one segmented control, icon only, with a hint of the content next to the icon: number of telemetries, number of sources plus a dot (green all connected, amber some lost, red all lost). A tooltip (hover and keyboard focus) gives the name, the shortcut and a summary (the list of sources and their state for Sources).
- **Edit** (turns into **Done** while editing): see `doc/dashboard-editing.md`. Disabled until a dashboard is displayed.

## Shortcuts

Not active while typing in a field. `Space` pause/resume (a focused button keeps its own use of Space), `T` Telemetries, `S` Sources, `H` or `?` Help, `E` Edit, `Esc` closes the popup, then the open panel, then Edit mode (`main.js`).

## State

## Data menu (the popup of the rate)

Next to the rate, a **ring** shows how much of the memory allowed for the data is used: it fills clockwise, green, amber from 70 %, red from 90 %. While data flows a mark turns around it (a still halo when the system asks for reduced motion). The popup (design study: `doc/data-menu-mockups.html`, `doc/data-menu-mockups-2.html`) has:

- **Data window**: how long data is kept per telemetry (`TP.state.dataTimeout`): 15 s, 1 min, 5 min (the default), 1 h, All, or a number of seconds. A telemetry that asked for its own duration keeps it. Under the choices, a **timeline** shows how much of that window is filled (design study: `doc/data-menu-mockups-3.html`): its width is the window, its right edge is now, and the filled part is the time covered by the telemetry that goes the furthest back (`TP.datastore.getTimeSpan()`, measured on the timestamps of the stored data, not on the computer's clock). The part where at least one telemetry was thinned out to save memory is hatched in amber, whichever telemetry it is (the tooltip names them), and for as long as there is one the word **thinned** shows under the rate of the button, in the same amber (design studies: `doc/data-menu-mockups-4.html`, `doc/data-menu-mockups-5.html`); while paused, the time that passes without data opens a gap at the right, in the color of the pause. With "All", the bar is the data itself and its left label says how far back it starts.
- **Memory**: what the data takes against the limit (`TP.state.memoryLimit`, 1 GB by default, editable, 0 for none), as one bar split between the heaviest telemetries (the rest of the bar is the room left), and **what is done when the limit is reached** (`TP.state.memoryPolicy`): thin out the oldest data (the default), forget the oldest data, or pause. The library does it (see `doc/performance.md`, "Memory"); the menu says so for a few seconds when it happens.
- **Heaviest telemetries**: the four that take the most room, in the colors of the bar, with a cross to clear just that one.
- **Clear**: all the data; what the displayed dashboard does not show; or "Forget everything" (data and telemetries, confirmed in place). Dashboards and views always stay.

The memory figure is an estimate counted by the library from its own data: browsers do not give one that works everywhere.

`ctx.topPanel` is the open popup (`"dashboard"` or `"rate"`), `ctx.sidePanel` the open side panel. A click anywhere else closes the popup.

## Look

While the island is clear of the data (the band above the dashboard is scrolled into view, or no dashboard is displayed) it is solid, held together by its outline alone. Over the dashboard, which is where it starts, it turns to glass (half transparent, blurring what is behind) and casts a shadow. Popups always stay solid: a list of choices needs full contrast. Shadows use `--color-shadow`, which is dark in the dark theme (a shadow lighter than the page reads as a glow).

## Auto-hide

After `IDLE_MS` (3 s) without mouse or keyboard activity the island fades out (it never takes room: it floats over the dashboard, so nothing reflows). Any mouse movement, click, touch or key (except typing in a field) brings it back. It stays while:

- a popup is open, or the pointer or the keyboard focus is on the island;
- the band above the dashboard is scrolled into view (see below), or the dashboard is being edited (entering Edit scrolls the band into view);
- no dashboard is displayed yet (welcome screen).

When the display is paused and the island is away, a small amber **Paused** chip stays at the top (click or `Space` to resume): a frozen display must never look like a stalled robot.

## The band (scroll up for a clear menu)

The workspace scrolls by itself and starts scrolled past a band of free room at its top (`--tm-h`, `style.css`; `main.js` does the initial scroll): the dashboard has the whole stage and the menu floats over it. Scroll up to reveal the band, the menu then sits clear of the data and stays visible. Scroll down to get the stage back. The scroll never rests half way through the band (it settles on one side). The top menu is `position: sticky` above the scrolling content.
