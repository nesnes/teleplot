# Dashboard editing

Target design: `doc/dashboard-edit-prototype.html` (interactive mockup, open it in a browser). The implementation follows it.

## Principles

- Dashboards keep their layouts: **row**, **column**, **grid** and **stack** containers. A view's **width** is its flex-grow weight among its siblings (1 to 12), or the number of columns it takes in a grid; its **height** is a step: minimum height of `4 × h` em, linear (0 to 12). Containers have both too (height 0 = the content decides).
- **Grid** is what a new dashboard and the automatic one are made of: views flow line after line on columns of equal width, so they spread over the page without any arranging. The number of columns follows the width of the grid (`layout.columnWidth`, 16 em by default, is the minimum width of a column) and goes by pairs (1, 2, 4, 6...), so that views two columns wide always fill the lines. A chart or a log starts 2 columns wide, a values view 1; a view never takes more columns than there are. A line is as tall as its tallest view. Library feature (`ViewLayout`, `layout.type = "grid"`), demo in `packages/teleplot-js/test.html`.
- Edit mode is toggled with the **Edit** button of the top menu (see `doc/top-menu.md`; shortcut `E`) or the pencil of a dashboard in the dashboard list. Views are inert while editing (no cursor, zoom or hover) but keep showing live data, and still accept telemetries dropped from the Telemetries panel.
- **Pills** are the only selectors. Blue for views, orange for containers (purple when nested), at the top left of the element, labelled with the element type (Chart, Values, Log, 3D, Image, Row, Column, Grid, Stack - never the content title). Click selects, drag moves.
- The selected pill unfolds a connected second line `w - n +` / `h - n +`. Small views unfold it beside the pill.
- Every container reserves a band at its top while editing, so its pill never covers its children. The dashboard itself has no pill: nothing selected means "dashboard settings".
- Drag a pill: a blue insertion line shows where it lands in the hovered container (empty containers accept drops too, a container never goes into itself or its descendants). `Esc` cancels.
- Keyboard (an element selected): `Left`/`Right` width, `Up`/`Down` height, `Alt` + arrows move inside the parent, `Esc` deselects (then leaves edit mode).

## Right panel (follows the selection)

| Selection | Panel |
|---|---|
| nothing | name (not for the automatic dashboard), time window (reset zoom), theme, layout of the dashboard (grid / row / column, column width of a grid), views appearance (cards / flat) and top color (on / off) for the whole dashboard, structure counts |
| container | direction (row / column / grid / stack), column width of a grid, align, gap, appearance (inherit / cards / flat) and top color (inherit / on / off) for everything inside, children list |
| view | header (duplicate, delete), breadcrumb (clickable ancestors), tab **Data** (title, telemetries with remove + add) and tab **Display** (the view's options, from `getOptionsSchema()`) |

## Adding views

- **"+" slots.** In edit mode a small "+" sits at every seam between two views, at both ends of every container and inside empty containers (a row that wraps gets them at the end of each line). Click one: a menu offers *Chart*, *Values*, *Log*, *3D*, *Image* and the containers *Row*, *Column*, *Grid*, *Stack*; the new element is created right there and selected. With the keyboard: focus a slot, `Enter`, arrows, `Enter` (`Esc` closes).
- **Dragging a telemetry** from the Telemetries panel (a single tile, or a group header) shows the same slots, larger, even **outside** edit mode: they only exist while the drag lasts. Dropping on a slot creates the view(s) at that place, dropping on a view still adds the telemetry to it as a series, and dropping anywhere else on the dashboard (free room of a container, around or under the views) adds the view(s) at the end of the container under the pointer, so there is no need to aim. Numbers go together in one chart, shapes and 3D points together in one 3D view, each image in its own image view (drop shapes on it to draw them over the picture, see `doc/3d.md`), anything else together in one values view (`TELEPLOT.view.suggestViewType` / `createView`, also used by the automatic dashboard). Undo is the delete button of the panel.
- Code: `E.addView`, `E.dropTelemetries`, `E.slotLayout` (geometry, unit tested) and the slots layer in `components/dashboard-editor.js`; the style is in `css/editor.css` (`.tp-slot`, `.tp-menu`).

## Look of the views (library feature, edited here)

The library draws every view as an *instrument panel* card: thin border, rounded corners, a 2 px top edge in the color of the view's first telemetry (the "top color"), monospace numerals, colored log levels. Two settings live on layouts (`layout.appearance`, `layout.accent`) and are inherited by everything inside, a child layout can override them:

- `appearance`: `"card"` (default at the top), `"flat"` (no card, hairlines between views, no gap) or `"inherit"`.
- `accent`: `"on"`, `"off"` or `"inherit"`.

Colors come from CSS variables (`--teleplot-*`, see `src/104-theme.js`), so dark mode is a matter of `data-theme="dark"` on the page (or the OS preference). Views without anything to show explain why (no telemetry, waiting for data, not displayable by this view) instead of staying blank.

## Where the code lives

The edit mode is a GUI feature: `packages/webapp/`.

- `components/dashboard-editor.js`: `initDashboardEditor(TP)`. Structure commands (`select`, `setSize`/`resize`, `moveView`, `moveBy`, `duplicateView`, `removeView`, `setContainerType`), the chrome drawn over the dashboard (pills, shield over views, placeholder of empty containers), pointer drag and drop, keyboard. State in `editor.state` (`enabled`, `rootId`, `selectedId`, `dragging`, `revision`, reactive). `editor.refresh()` is called every 100 ms by `main.js`: the chrome is plain DOM added next to what each view's own Vue app renders, so it follows views as they mount, move and resize.
- `components/panel-edit.js`: the right panel.
- `css/editor.css`: style of both (`tp-` classes, `--tp-edit-*` variables, light and dark).
- `tests/dashboard-editor.test.js`: the structure commands (`packages/webapp/test.sh`). The DOM part is checked in a browser.

What an application needs from the library to edit dashboards is generic and lives in `packages/teleplot-js/`:

- `view.clone()` (layouts and stacks copy their children), `view.dispose()` (unmounts: the view mounts again by itself when it gets a new element, which is what happens when it moves to another parent or another stack tab), `TELEPLOT.view.removeView(view)` / `disposeView(view)`.
- `ViewTelemetries.addTelemetry()`, `removeTelemetry()`, a reactive `telemetryIdOrNameList`, the `title` option (written in a corner of the view, in every mode) and `getOptionsSchema()` (`[{key, label, type: "bool" | "int", min, max, step}]`) to build option forms.
- `TELEPLOT.dashboards.renameDashboard(old, new)`, `TELEPLOT.dashboards.removeDashboard(name)` (also forgets its views; the auto dashboard is kept).
- Containers have a minimum height (`layout.height`, default 0) like views; `setSize(width, height)` ignores `undefined`.

## Known limits

- The pill covers the top left corner of a view (very small views unfold the size line beside the pill). Content there is still visible once the view is not selected, or by making the view bigger.
- No undo yet: delete is immediate (duplicate first when unsure).
- Chart axes (range, unit) are not editable: the library has no such options yet.

## Chart legend (library feature)

The legend of a chart is one row, entries start at the left. Each entry shows the series name and its value; the value has a fixed slot (it only grows), so entries never shake as values change. Entries that do not fit are folded behind a "+N" chip. The chip opens a list of all the series: a regular Values view (`ViewCurrentValue`) in a popover, which scrolls when the chart is too short for it. Click an entry (or a row of the list) to hide or show its series, hover it to highlight the series; Esc or a click outside closes the list. `ViewCurrentValue` has `rowHandlers` (`click/enter/leave`) and `dimmed` for this, usable by any view that embeds one. Hover highlighting replaces the old "closest series" highlight of the cursor. Demo: "Legend" views in `test.html`.

## Appending and tabs (webapp)

While a telemetry is dragged from the panel, a large dashed drop zone shows in the room always kept under the dashboard (`.dashboard-layout::after` in `dashboard.js`, so the layout never jumps): dropping there appends the view at the end of the root container. Views created by the editor start at height 6 (`NEW_VIEW_HEIGHT`, the library default is 4). In edit mode, clicking a tab of a stack selects the view that tab shows.
