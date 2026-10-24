# Data files

What Teleplot holds (the samples of the telemetries, and the dashboards) can be written to a file and read back. There is nothing new to learn: **a file is what a device would have sent**, and reading it goes through the parsers of the protocols, the same code that reads a connection.

| | Text file | Binary file (the default) |
|---|---|---|
| Extension | `.teleplot.txt` | `.teleplot` |
| Content | the lines of the text protocol, one after the other | the packets of the binary protocol, each after its length |
| Size, speed | about 34 bytes per number | about 10 bytes per number, read about five times faster |
| Fidelity | what the text protocol can say (see below) | exactly what was stored |
| Made by a device | log the lines it sends to an SD card | write a header, then each packet after its length |
| Readable | yes | no |

Both can hold dashboards (`DASH|` lines, see `dashboard-text.md`): a file can be a whole session.

A third format, **CSV** (`.teleplot.csv`), is for spreadsheets and scripts: it holds less (see below).

The extensions are those Teleplot gives to the files it writes (a dashboard exported alone is a `.teleplot.txt` too). They are not needed to open a file: the format is recognised from its content, so `LOG_0007.TXT` from an SD card opens as well.

## Text file

```
DASH|Robot/Motion:chart:speed,accel|w=4
speed,Robot/Motion:1627551892437:1.2;1627551892537:1.3
state:1627551892437:forward|t
>1627551892437:Motors armed
3D|box:1627551892437:P:1:0:0.5
```

- Every line is a line of the text protocol (see the README): numbers, positions, text, logs, point clouds, images, 3D shapes and cameras, ranges (`ATTR|`) and thresholds (`TH|`), dashboards.
- **Give each line its time** (milliseconds since 1970, or since the start of the device: a file is never dated by the page as live times since boot are, see `doc/sources.md`, so such times are shown at the start of 1970). A line without a time is dated when it is read, like any line received: all of them would get the time of the import.
- A file that was logged from a serial port (telemetry lines start with `>`, the others are logs) is read with the `serial` option.
- Empty lines are skipped; lines that are not understood are counted and reported.

What a text file written by Teleplot does not hold, because the text protocol has no word for it: the color and the data window of a telemetry, clients (telemetries of the same name sent by two clients become one), colors sent as r, g, b (they come back as the text `rgb(r,g,b)`). Samples that cannot be written are **skipped and counted**, never changed: texts that hold `; | §` or a line break, telemetries whose name holds `: , |`, and thresholds whose name or color would not be read back the same (spaces around the name, a line break, a color that holds `: ; |`). Use the binary file for those.

**A period** (`from`, `to`) holds the samples of that period, and one more thing: the thresholds in force when it starts (the last sample of each name before it) are written before its own, at their own time. Without them the limits of the period would be missing from its file.

## Binary file

```
{MAGIC[8 bytes]}  then, until the end:  {LENGTH[32]} {PACKET}
```

- **MAGIC**: `54 50 4C 54 0A 01 00 00` ("TPLT", a line feed, the file version 1, two reserved bytes).
- **LENGTH** (uint32, little-endian): the size of the packet that follows.
- **PACKET**: a packet of the binary protocol, as sent on the network (`binaryProtocol.md`), checksum included.

A device writes the 8 bytes once, then each packet it sends after its length.

What Teleplot writes gives back exactly what was stored:

- values that a float32 (or the integers of some sections) would round are written in `TELEM_DATA_FLOAT64` sections; the others in the section of their data type;
- timestamps are written so that they are read back to the same value;
- telemetries that came from the binary protocol keep their client and their id; telemetries that are identified by their name (text protocol) are written under the client id `0xFFFF`, which means just that (see `binaryProtocol.md`);
- attributes (name, unit, color, autoplot, data window, shape, view label, log, frame, range) and client names are written before the data;
- dashboards are written first, in `DASHBOARD` sections.

Not written, and counted as skipped: texts that hold a zero character (strings end with one), images that are not base64.

## CSV

```
time,left,right,state
2021-07-29T09:44:52.437Z,0.4,0.38,
2021-07-29T09:44:52.457Z,0.41,,"going, fast"
```

A table holds numbers, positions (2D and 3D numbers: a column per coordinate, `name.x`, `name.y`...) and text. Images, shapes, cameras and point clouds are **left out**, and so are attributes and dashboards: the export says how many telemetries and samples that is.

| Option | Values |
|---|---|
| `layout` | `"columns"` (default): a column per telemetry, a line per moment. `"lines"`: `time,name,value`, a line per sample |
| `separator` | `","` (default), `";"` or a tab |
| `time` | `"iso"` (default, `2021-07-29T09:44:52.437Z`, with more decimals when the time is finer than a millisecond), `"ms"` or `"s"` since 1970 |

- **An empty cell means no sample at that very time.** Nothing is filled in, carried over or interpolated. Two samples of a telemetry at the same time are two lines.
- **Numbers are always written with a point** (`1.5`), whatever the separator, so a comma between fields is never mistaken for a decimal. A field that holds the separator, a quote or a line break is quoted, as usual in CSV.

Opening a CSV: the first line names the columns. One column is the time (the one named `time`, `timestamp`, `date`..., else the first; or `timeColumn`), written as a date, milliseconds or seconds (guessed from the first line, or `timeUnit`). The others become telemetries named by the header, with `prefix` in front when given: number telemetries for cells that are numbers, text telemetries for the others, nothing for empty cells. The separator is the one the header uses most (or `separator`). With the header `time,name,value`, each line is one sample. A cell such as `1250,5` is not a number: it is kept as text, not guessed.

## Importing

- The format is recognised from the first bytes: the magic means binary, anything else is text.
- It works while data is paused: pausing is for what flows in.
- Dashboards of the file are created as **new** dashboards ("Robot 2" when the name is taken); nothing that exists is replaced.
- Telemetries are the ones the file names: samples are **added** to those that already exist. Importing twice the same file stores its samples twice.
- **A dry run** (`dryRun` option) reads a file without storing nor creating anything, and returns the same description as a real import: what the file holds, how many telemetries are new, which names its dashboards would get, how long the data window should be. The webapp shows it before opening a file.
- **An import can be taken back**: `TELEPLOT.files.removeImported(result)` removes, in each telemetry, the samples between the oldest and the newest the file gave it. Samples are not marked with where they come from: what else a telemetry holds in that period goes too. Telemetries the file had created and that are left empty are forgotten.
- Old data stays old: a file recorded yesterday shows yesterday's times. The data window (`TELEPLOT.state.dataTimeout`) counts from the newest sample of each telemetry, so a file longer than the window loses its start at the next update unless the window is made longer (`extendWindow` option, or the data menu of the webapp). The memory limit applies as usual.

## Library

`packages/teleplot-js/src/160-files.js`:

| Function | |
|---|---|
| `TELEPLOT.files.exportBinary(options)` | `{ parts, samples, skipped }`: `parts` are `Uint8Array` to put one after the other (`new Blob(parts)`) |
| `TELEPLOT.files.exportText(options)` | the same with strings |
| `TELEPLOT.files.exportCSV(options)` | the same, as a CSV; also returns `leftOut`, the telemetries that have nothing a CSV holds |
| `TELEPLOT.files.previewCSV(options, count)` | the first lines of that CSV as a table: `{ header, rows }` |
| `TELEPLOT.files.estimate(format, options)` | what an export would hold, without writing it: `{ samples, bytes, telemetries, leftOut, skipped }` (`bytes` is an estimate) |
| `TELEPLOT.files.removeImported(result)` | takes back what an import brought; returns the number of samples removed |
| `TELEPLOT.files.importData(data, options)` | reads a whole file (a string, an `ArrayBuffer` or a `Uint8Array`) |
| `TELEPLOT.files.createImport(options)` | reads a file in pieces: `add(piece)` for each, in order (cut anywhere), then `finish()` |
| `TELEPLOT.files.isBinary(bytes)` | whether bytes start a binary file |

Export options: `telemetries` (ids or names; default: all), `from`, `to` (timestamps in seconds, limits included; default: everything), `dashboards` (`true`: all, the default; `false`; or names).

Export options, CSV only: `layout`, `separator`, `time` (see CSV).

Import options: `dryRun`, `data: false` (leave the data of the file out), `dashboards: false` (leave its dashboards out), `extendWindow` (make the data window long enough for the file), `format` (`"text"` or `"csv"`, instead of guessing between the two: a text whose first line has separators and no `:` is a CSV), `serial` (text logged from a serial port), and for a CSV `separator`, `timeColumn`, `timeUnit`, `prefix`.

An import returns `{ format, samples, telemetries, created, createdIds, from, to, ranges, dashboards, dashboardNames, problems, windowExtended, windowNeeded, csv }`: the ids of the telemetries that got data and how many of them are new, the timestamps of the oldest and the newest sample, what each telemetry got (`ranges`, for `removeImported`), the dashboards created and the name each one of the file got, the number of lines or packets that were not understood, the length the data window needs to keep the file whole (the window counts from the newest sample of each telemetry), and for a CSV what was found in its header.

Measured on a million numbers (4 telemetries, Node): binary 10 MB, written in 45 ms, read in 30 ms; text 34 MB, written in 180 ms, read in 180 ms.

## In the webapp

The **Export and import** panel (top menu, shortcut X; it opens on the right, in place of Help; `packages/webapp/components/panel-export.js`) has two sections that cannot be mistaken for one another, then the files of the session.

- **Export**: three questions with their defaults selected, so one click saves everything. *What*: everything, what the displayed dashboard shows, or "Choose…" (the telemetries by label, with what each weighs). *When*: all, what the dashboard is zoomed on, or the last minute. *Format*: binary, text or CSV. CSV unfolds its settings (layout, separator, time) and the first lines of the file as a table, empty cells hatched. Under them, before anything is written: how many samples, the period, about how big, the name of the file, and what the format leaves out.
- **Import**: a file that is chosen (here, or with "Import…" in the dashboard list), or dropped anywhere on the page, is first read without being stored. The panel then shows its receipt: format, period, how many samples in how many telemetries (new, or already here), the dashboards and the names they get, what was not understood, and that the data window will be made longer when the file needs it. When a file holds both data and dashboards, two checkboxes choose what to take from it (its data, its dashboards, or both). Other options appear when they mean something: "logged from a serial port" for a text file; separator, time column and unit, and a prefix for the names for a CSV; "clear the current data first". Then Open, or Cancel; meanwhile the Export section is folded to its header, so the receipt has the room. Large files show their progress and can be cancelled.
- **Files of this session**: what was opened and saved. An opened file can zoom the dashboard on its period (a file from yesterday is far from the live data), open its dashboards, and be taken back ("Remove its data", confirmed in place). A saved file can be saved again with the same choices.

Tests: `tests/files.test.js` (both formats are read back and compared with what was stored); demos: "Data files" in `test.html`.
