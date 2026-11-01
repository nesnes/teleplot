# Moments

Periods of time that a device declares: a cycle, an operation, a phase. They give context on the time line and on charts, and they are what you step through, replay and export. Decided with the user over six rounds of mock-ups (2026-10-31).

A moment is not a new kind of data: it is a state with a flag. Everything that works on states and stacks works on it (times, dating, files, the timeline view), and the page only displays what the device said: an end or a result it did not send is never made up.

## What a device sends

The `mom` flag on a text telemetry. It sets `TELEM_ATTR_MOMENT` (17) and `TELEM_ATTR_STACK`: a moment telemetry is a stack.

```
cycle:run 7/pick#41|mom            pick 41 starts, inside run 7
cycle:run 7/pick#41/approach|mom   a phase inside it
cycle:run 7/pick#41=ok|mom         it ends, with its result
cycle:run 7/pick#42|mom            the next one starts
cycle:|mom                         nothing runs any more
vision:detect#9,ocr#3|mom          two at once
```

| Part | Meaning |
| --- | --- |
| `/` | Nesting: a moment inside another |
| `,` | Parallel: several moments at once |
| `#42` | The number of this occurrence. The text before it is the kind (`pick`). Needed because the same text sent again continues a state: without a number, two cycles in a row are one |
| `=ok` | The result, which ends the moment. The word lists of logs give its color (`=failed` is red) |
| a new text | Ends what is no longer in it, with no result |
| an empty text | Ends everything |

As with any stack, the time is the first numeric field, and the last flag used on a telemetry tells what it is. In binary: the attribute `TELEM_ATTR_MOMENT` (17, one byte) on a text telemetry, which also needs `TELEM_ATTR_STACK`.

A result belongs to the level it was given to: a phase that fails does not make its pick fail unless the device says so.

## Unfinished moments

| Case | Shown as |
| --- | --- |
| Still running | Open: it lasts up to the newest sample, its name ends with `…` |
| Ended by another text | Its end is known, it has no result (`–`) |
| Reception stopped during it (a hole, see [time.md](time.md)) | It ends where the hole starts, marked unknown (`?`); the hole stays hatched |
| The device rebooted | Like "ended by another text": the page cannot tell a reboot from the next text |

## The model (`TELEPLOT.moments`, `119-moments.js`)

Built from `TELEPLOT.stackRuns`, cached per entry and completed as samples are appended. A moment is `{telem, path, name, kind, number, depth, parent, children, from, to, open, result, unknown}`.

- `telemetries()`: the moment telemetries, in the order they first came.
- `of(telem)`: its moments by start time, with `levels`: the rows of each depth (parallel moments of a depth get rows of their own only while they overlap).
- `at(t, telem)`: the deepest moment running at a time.
- `restLevel(telem)`: the first depth with more than one moment.
- `primary`: the telemetry the line shows at rest (default: the first one); `hidden`: names kept off the line.

The boundaries of moments are kept: the text of a moment telemetry is neither thinned nor forgotten by the memory policy. Only the data window removes it.

## The line (`TELEPLOT.TimeLine`, `120-timeLine.js`)

One component, in the library, used at the bottom of the top menu and at the very bottom of charts: the map of time to pixels, the drawing, the tracks, the pointer. Only its width, its time range and what it draws under the moments differ.

At rest it is one thin line: the moments of the primary telemetry at the level that has several of them in the period shown (so zooming on a moment shows what is inside it), cut one from the other, plus the failures of every telemetry. Depth shows as stacked opacities: each level adds a layer, so a moment gets darker where something runs inside it.

Open, it shows every track: one block per telemetry, a small gap between them, one row per level, and extra rows only where parallel moments overlap. It opens over what is above it, and it never moves a curve.

- With the pointer on a track, the moment is named and the other telemetries dim.
- A click holds the time group at the start of that moment and zooms to it.

### In the top menu

Drawn at rest as soon as moments exist, as well as held, replaying or with a hole in view. It opens with the row (pointer on the menu). The row writes the path of the moment shown (`patrol › leg #4 › drive – 5.4 s`), each part a button that shows that level; when it is too narrow, the end of the path stays. `‹` `›` stay on its telemetry and level, then a loop button and an export button. Tooltips of the line go under it, never over the tracks. `PageUp` and `PageDown` do the same as `‹` `›`.

The ⋯ menu lists the moment telemetries: which ones are on the line, and which one is shown at rest.

### On charts

Nothing while the group is live. Otherwise a 4 px line at the very bottom of the chart, aligned on the plot. It opens only when the pointer is on the line (a zone of 10 px), never for the rest of the chart. It takes its own gestures: a drag moves through time, as does the wheel (with Ctrl or a trackpad pinch: zoom), and it follows what the chart shows at every step. A caption over its left end says which moment is shown (its path, duration and result), and open, the tracks are tall enough to carry their names. A finger has no hover: a swipe or a pinch on the line works like the drag and the zoom, a tap on the line (a zone of 24 px) opens it, a tap on a track shows that moment, a tap elsewhere closes it, and a press there never selects the view. The chart shows the moments of its own labels when it has any, otherwise all of them. Chart option `moments`: `show` (default) or `hide`.

## Other views

| View | Moments |
|---|---|
| Timeline | A moment telemetry is a stack, added to a timeline like any other. Not live, it takes the gestures of a chart, and a click on a section shows it (`showPeriod`), on a moment as the top menu does (`showMoment`); a click on what is shown already only moves the time |
| Log | When not live, a rule above the first line of each moment with its name at the right end, in red when it failed. No extra row. A mark beside the lines was tried and given up: next to the color of the telemetries it could not be read. With the pointer on the name, the other lines dim. A click shows that moment. Option `moments`: `show` (default) or `hide` |
| Values, scenes, images, graphs, joystick | They show one instant: no line. See below |

**Tag.** A view that is not live, in a time group other than the one chosen in the menu, shows a small tag in its corner: the moment it is on, and its time group on hover. Views of the chosen group never show it: the menu already names the moment. `TELEPLOT.view.chosenGroup` tells the library which group that is.

## Replay

`TELEPLOT.view.showMoment(group, moment)` holds at its start, with the window on the moment, which gets there in a blink (`ANIMATION_MS`, 220 ms, none with reduced motion) so that nobody is lost. `play` then stops at its end instead of going on to live, or starts again with `setLoop(group, true)`. The window stays still during that replay and the head moves across it. `stepMoment(group, dir)` goes to the previous or next moment of the same telemetry and level. Moving the time out of the moment ends the selection.

A click in a chart or a timeline does not move the window (`pointAt`). While a moment is shown, a click in the room around it stays in it; further away, it is another time and the moment ends.

While a group is not live, its charts and timeline views move through time: the wheel and a drag pan (`panBy`), a trackpad pinch or the wheel with Ctrl zoom around the pointer (`zoomAround`). With a finger, a swipe sideways pans (up and down still scrolls the page) and two fingers pinch, as they always do. Live, a drag selects a period and the wheel scrolls the page, as usual. A timeline taller than its view goes in two dimensions while not live: sideways the time, up and down its lanes, with the wheel, a drag or a finger.

The time of a group includes the moment telemetries, even when no view shows them.

## Export

The Export panel gets a "Moments" choice for the period: filters by kind and result, and a list grouped by telemetry, as a tree. Ticking a moment takes its whole period, so what is inside it is ticked with it; unticking something inside it unticks the moment around it (shown as partly ticked). Periods that overlap are written once. Then, whose data: All telemetries (default), Same source or Same label. The moment telemetries are always written.

Above the recap, a box that scrolls past 9 rem writes out what the file will hold: its periods, its telemetries with what each brings, its dashboards.

`TELEPLOT.files.exportText`, `exportBinary`, `exportCSV` and `estimate` take `ranges: [{from, to}]` as well as `from` and `to`. A moment does not own data: it marks a period.

## Not in this version

- A Moments panel to browse them outside of Export.
- Laying the cycles of a kind over each other on a chart.

---

[All documentation](README.md) · [Teleplot](../README.md)
