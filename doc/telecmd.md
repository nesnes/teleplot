# Commands: writable telemetries (telecmd)

**Status: designed, not implemented.** This page is the spec and the implementation plan. Reference design:
`telecmd-reference.html` (one design per element, with what the device sends for each screen). The design studies that led to it:
`telecmd-mockups.html` (round 1) and `telecmd-mockups-2.html` (round 2).

Teleplot shows what a device sends. Telecmd is the other direction: the page changes something on the device (a gain, a mode, a
pose) or asks it to do something (reset, go to). It replaces the "telecmd" of V1 (`clients/cpp/Telecmd.h`: `|name|params|` over
UDP 47268, untyped, no reply, one device), which never matured: nothing of it is kept.

## The idea

- **A setting is a writable telemetry.** The device keeps publishing `kp:0.40` and declares once `ATTR|kp|write|min=0|max=10`.
  The page writes it with the line the device would send: `kp:0.42`. **The device's echo is the acknowledgement**: the value is
  applied when the device publishes it.
- **An action is a call**, like an RPC: several typed arguments, optional ones with defaults, a description for the action and
  for each argument. The device answers `run` when it starts, then `ok` or `err`: the page knows how long it ran.
- **CMD is off by default.** Nothing is sent and no command UI is drawn: a wall screen needs no setting.
- **Editing happens where the value is displayed**, with editors light enough to live in any view. A *controls* view (an option of
  the values view) is there for driving: pads, rockers, bigger targets.

What it gives:

- **Almost no new protocol.** A few attributes, the existing data in the other direction, one call line, one answer line. Range,
  unit, label, frame, color: what a telemetry already has applies to its writes.
- **No discovery request.** Commands come with the attributes of the telemetries: a page that connects late learns them like the
  rest.
- **Reliability for free.** Setting a value can be repeated, so the page resends until the echo matches: a lossy link is not a
  problem.
- **"Never invent" holds.** A view displays the value the device reported, never the one typed. What was asked is a target only
  until the device answers.
- **What the page sent is telemetry too**: kept, shown on timelines and in logs, exported.

## Protocol

### Declaring a setting

An attribute of the telemetry, sent once and again at will (a client library repeats it every few seconds), before or after its
data.

```
ATTR|kp|write|min=0|max=10|step=0.01|desc=Proportional gain     a number, between 0 and 10
ATTR|motors|write=bool                                          a switch (a number, 0 or 1)
ATTR|mode|write|choices=idle,auto,manual                        a text among these
ATTR|name|write=text                                            a free text
ATTR|goal|write=xy                                              a 2D point, in the frame of the telemetry
ATTR|pose|write=pose2d                                          x, y and yaw (radians, like R of 2D| lines)
ATTR|cmd_vel|write=pose2d|rate=20|hold=200|min=-1|max=1         continuous: velocities (vx, vy, wz) from a pad
ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200           a differential base: no vy, one stick
ATTR|kp|write=                                                  no more writable
```

- **Type.** `write` alone takes the type of the data the telemetry already has; `write=<type>` gives it: `number`, `bool`, `text`,
  `xy`, `xyz`, `pose2d`.
- **Keys.** `step` (what a slider moves by, and the tolerance of the echo), `choices` (separated by `,`), `rate` (writes per second
  of a continuous control), `hold` (ms: the device stops when nothing came for that long), `axes` (the axes of an `xy` or `pose2d`
  that exist), `desc` (a short description, shown in tooltips; any telemetry may have one). `min` / `max` are the range attribute
  that exists; `unit=` and `color=` set the unit and color attributes that exist.
- In the values of `ATTR|` lines, `% | , = :` and line feeds are written `%XX`.

### Declaring an action

One line for the action, then one line per argument, in their order. An argument is declared with the keys of a setting.

```
ATTR|robot.goto|action|title=Go to|desc=Drive to a pose on the map, avoiding obstacles.
ATTR|robot.goto|arg=target|type=pose2d|desc=Where to go, in the map frame.
ATTR|robot.goto|arg=speed|type=number|optional|default=0.5|min=0|max=2|unit=m/s|desc=Top speed.
ATTR|robot.goto|arg=avoid|type=text|choices=none,people,all|optional|default=people
ATTR|robot.stop|action|title=Stop|color=red
ATTR|imu.calibrate|action|title=Calibrate|confirm
ATTR|robot.dock|action|title=Dock|longpress
ATTR|robot.goto|arg=avoid|type=                         removes that argument
```

- `title`: the text of the button (default: the name). Not `label`, which already means "the view a telemetry goes to".
- `desc`: shown when hovering the button and at the top of its form.
- `confirm`: the button asks in place before sending; `longpress`: it must be held 1 s; `color`: the button's color. There is no
  reserved name (no built-in emergency stop): a stop is an action like the others.
- An argument line with the name of an existing argument replaces it. `optional` arguments may be left out of a call; `default`
  is only shown to the user (the device applies its own default).

### What the page sends

A setting: the line the device would send, without a timestamp (the page does not know the device's clock).

```
kp:0.42
motors:1
mode:auto
pose:3.2:2.3:0.61
```

A call: `!`, the name, `#` and an id (increasing per action), then the arguments **by name**, those left empty not sent. Values of
several numbers are separated by `,`; texts escape `% : , = |` as `%XX`.

```
!robot.odometry.reset#17
!robot.goto#21:target=3.8,2.0,0.5:avoid=people
```

### What the device answers

```
ACK|robot.goto#21:run                  started
ACK|robot.goto#21:ok                   done (an instant action may skip run)
ACK|robot.map.save#4:ok:map-12.pgm     done, with a short result text
ACK|robot.goto#21:err:unreachable      failed, or refused (bad or missing argument)
ACK|robot.mode:err:motors off          a setting refused (optional: the echo already tells)
```

- The answers are stored as log samples of the action's telemetry. A call's duration is measured on them, from `run` to its end:
  never guessed.
- The page resends a call until it is answered (every 250 ms, for 2 s, then "no answer"). The device remembers the last ids it ran
  (a few per action) and answers again without running an id twice.

### When a setting is applied

A request is **pending** from the moment it is sent. It is:

- **applied** when the device reports a sample equal to it after the request: exactly for texts and choices, within `step / 2`
  for numbers that have a step, otherwise as equal as a float32 can be;
- **not applied** when, after the resends (every 250 ms for 2 s), the device still reports something else (it clamped, rounded,
  ignored): the page shows what the device kept;
- **refused** when the device answered `err`;
- **no answer** when nothing came back at all.

A newer request for the same telemetry replaces the pending one. Sliders and continuous controls send at most `rate` per second
(20 when not given), the latest value only.

### Continuous control

A writable with `rate` and `hold`: while it is held, the page sends the current value `rate` times per second; released, the rest
value (0) a few times, then nothing. **The device stops when nothing came for `hold` ms**: the safety is on the device, the only
place where it can be trusted. The page also stops sending when it is hidden, loses the focus, or CMD is switched off.

### Binary

- Attributes: `TELEM_ATTR_WRITE` (11) `{KIND[8]} {TYPE[8]} {FLAGS[8]} {STEP[64]} {RATE[16]} {HOLD[16]} {AXES[8]}` (kind: 0 none,
  1 setting, 2 action; type: 0 = the type of the data, then number, bool, text, xy, xyz, pose2d; flags: bit 0 confirm, bit 1
  longpress; step NaN = none; rate and hold 0 = none; axes: a bit per axis, 0 = all), `TELEM_ATTR_CHOICES` (12, a string, choices
  separated by line feeds), `TELEM_ATTR_ARG` (13) `{INDEX[8]} {TYPE[8]} {FLAGS[8]} {MIN[64]} {MAX[64]} {STEP[64]} {NAME} {UNIT}
  {DEFAULT} {CHOICES} {DESC}` (strings null terminated; flags: bit 0 optional; type 0 removes the argument), `TELEM_ATTR_DESC` (14,
  a string), `TELEM_ATTR_TITLE` (15, a string).
- A setting: a packet with the **client id of the device** in its header and the usual data section with **the telemetry id the
  device gave** (a device never looks a name up). Time reference 0, ignored.
- A call: `SECTION_TYPE_CALL` (41) `{TELEM_ID[16]} {CALL_ID[16]} {COUNT[8]}` then per argument `{INDEX[8]} {VALUE}` (number: float64;
  bool: uint8; text: null terminated; xy, xyz, pose2d: 2 or 3 float64).
- An answer: `SECTION_TYPE_CALL_ANSWER` (42) `{TELEM_ID[16]} {CALL_ID[16]} {STATUS[8]} {TEXT}` (status 0 ok, 1 error, 2 running;
  for a setting, call id 0xFFFF).
- Sections have no length, so a viewer that does not know these codes stops reading the packet there: devices send them last in a
  packet, or in a packet of their own.

## Where it goes: the way the data came

A write goes back through the source of its telemetry (`telemetry.sourceId`), to the device that sent it (the client id in binary,
the sender address for text), in the protocol that device speaks.

| Source | Return path |
|---|---|
| Serial port | Written to the port. No server. |
| UDP, through the server | Sent back to the address and port the device's packets came from. |
| Imported file | None: telemetries of a file are not writable. |

- **Server.** It learns the address of each sender: text packets become `[time, text, sender]` (`sender` an index in a `senders`
  table, sent when it grows), binary batches carry it in their framing. The page writes with `{"write": "kp:0.42", "to": sender}`
  (text) or a binary message with its sender. `{"cmd": text}` and `--cmd-host` / `--cmd-port` stay, as a forced destination for
  devices that cannot receive where they send from. New option `--read-only`: writes are refused.
- **Devices** receive on the socket they send from (across NAT and firewalls, several devices on one machine). The client
  libraries do it by default.
- **Several pages** can write: the last write wins, every page sees it through the echo.

## User interface

### The CMD button

In the top menu island, **only when a device declared something writable**. Two lines: `CMD` over a shaded `OFF`; on, tinted and
outlined in green, `ON` in green. Off at every page load (never remembered); shortcut `C`. Its tooltip counts the settings and
actions per device. Switching it off releases every continuous control at once; the island does not fade out while it is on.
The lib holds the state (`TELEPLOT.state.commands`) and refuses writes when it is off: the lock does not depend on the GUI.

### CMD off

Nothing is sent, and what was added for commands is not drawn: pens, carets, switches, choice lists, action buttons. Views look
exactly as today. The one exception: **controls views** keep their controls, dimmed (they were made for that; the layout does not
jump). Action rows keep their last result (it is telemetry).

### Editing in place (values view, 110)

CMD on, any values view: a pen after the name of what can be written, and an editor that appears when used, without moving the
layout. The value shown is always the reported one.

- **Number with a range**: the bar is the slider. A **caret above the bar** is the target: faint under the pointer, solid while
  dragged, moving while waiting, amber when the device kept something else. No caret = nothing asked. Clicking the number types a
  value instead.
- **Number without range, text**: the value is underlined; a click makes it a field (Enter sends, Esc cancels).
- **Bool**: a switch at the right of the written value, striped on its new side until the echo.
- **Choices**: a click on the value opens them under it (buttons up to 5, a list beyond), closed once one is picked.
- **Action**: one line, the button at the right and the last result (icon and duration) before it. Without arguments a click sends
  (or `confirm` asks in place, or `longpress` fills); with arguments it opens a **form**: the description, one field per argument
  in order (by type: number with unit and range, switch, choice buttons, text, 2 or 3 number fields for `xy` / `xyz` / `pose2d`),
  each with its description, optional ones showing the default as a placeholder. The button stays off until required fields are
  valid. While the call runs, the button shows a spinner until `run`, then the running time.
- **State of a request: icons only**, next to the value: spinner (sent), check (applied, for 2 s), amber (not applied), red
  (refused, no answer). The reason in a tooltip.
- A continuous telemetry (`rate` / `hold`) shows its value here; it is driven from a controls view.

### Controls view

The option `controls` of the values view (Edit panel "Controls", `DASH|…|controls=1` from a device): tiles with editors always
drawn and bigger targets. Pads for continuous telemetries: a pad for `xy`, a rocker for a number, a pad and a rotation rocker for
`pose2d` (one stick, up = forward and sideways = turn, when `axes=x,yaw`). The knob is what the page sends, a ring what the device
reports. Option `keyboard`: off (default), arrows, or WASD, read by key position (`event.code`), only while the view has the
focus, page shortcuts paused meanwhile.

### 2D view (115)

A writable `pose2d` or `xy` drawn in a 2D view: CMD on, hovering it shows a ghost with a move handle (center) and a turn handle
(on a ring); nothing goes out before Send (or Enter), Esc drops the ghost. The ghost stays dashed until the echo. In the frame of
the telemetry.

### Timeline (116) and log (112)

- Timeline: a tick above the lane of a writable telemetry per request (filled: applied; hollow amber: not applied; hollow red:
  refused). A lane per action: a band per call from `run` to its end, colored by result, with its duration; a dotted line from
  the call to `run`; a running call grows. Hover: the call, its arguments, its times, the result.
- Log view: what the page sent (in its own color, with the arguments of a call) between what the devices said; results as icons,
  a call with its duration.

### Panels

- **Telemetries**: a pen after the name of writable telemetries, a ▶ after actions, CMD on or off. Dragging works as today (the
  default view of the telemetry, editable in place when CMD is on): no special drag, since in-place editors need no special view.
- **Sources**: a "Commands" section per device (its settings and actions, the last result, the round trip from sending to the
  echo); the console shows what the page sent.
- **Help**: a step "Settings and actions" (`ATTR|…|write`, then an action with an argument).

### Not now

3D view, image and camera views; picking an action's argument on a map (typed in the form for now). Dropped during the design: a
command palette, requests drawn on charts, reserved action names, a toolbar of actions, progress of a call, a special drag for
command views.

## Implementation plan

Five steps, each one usable and tested before the next. Every step: lib tests (`packages/teleplot-js/test.sh`), a `test.html`
demo, the performance page still fine (`test-performance.html`: commands must cost nothing to ingestion when nobody writes), docs
and `CLAUDE.md` updated, then checked in the webapp in a browser while data flows (inputs use `v-value`, never `:value`).

### Step 1: the path back

The page can send something to the device that sent a telemetry. Nothing visible yet.

- **Protocol** (`011-protocol.js`): attribute codes 11 to 15, sections 41 and 42, the types, `CLIENT_ID_PAGE`.
- **Server** (`packages/server/main.js`): senders table, `[time, text, sender]`, sender in binary framing, `{write, to}`,
  `--read-only` (and announced to the page). Tests in `packages/server/test.sh`; `doc/server.md`.
- **Connections** (`020`, `021`, `022`): `connection.canWrite`, `connection.write(target, payload)`; the server connection reads
  senders and remembers, per client, the sender it came from (`telemetry.sourceId` + sender); serial writes to the port. A new
  **local connection** (`023-connectionLocal.js`): a source living in the page, with a handler for writes, for `test.html`, the
  tests and the robot sample (which then sends its data through it).
- **Encoding**: a write in the protocol the device speaks (text if its telemetries came as text, binary otherwise).
- Tests: `connection.test.js`, `connectionSerial.test.js` (fake port receives the lines), new `commands.test.js` (local
  connection round trip).

### Step 2: settings

- **Parsing** (`040`, `041`): the `ATTR|` keys `write`, `choices`, `step`, `rate`, `hold`, `axes`, `desc`, `unit`, `color`;
  `ACK|` lines (a setting's `err`); the binary attributes. Tests in `parseDataText.test.js`, `parseDataBinary.test.js`.
- **Datastore** (`012`): `telemetry.getWrite()`, `isWritable()`, `getDescription()`; the requests of the page stored as samples of
  telemetries of `CLIENT_ID_PAGE` with the same name (exported with the rest).
- **Commands** (new `025-commands.js`, `TELEPLOT.commands`): `TELEPLOT.state.commands` (off), `write(telemetry, value)`,
  `request(telemetry)` (state, target, reason), resends, throttling, the echo check (only for telemetries with a pending request,
  run from the update loop in `998`, never on the ingestion path), "no answer", not writable from files or a `--read-only` server.
- **Values view** (`110`): pen, caret on the bar, click-to-edit, switch, choices list, status icons and tooltips.
- **Webapp**: the CMD button in `top-menu.js` (shown when something is writable, green, tooltip with counts, `C`, no fade while
  on); pens in `panel-telemetries.js`; Commands section in `panel-sources.js`; Help step and its tests (`tests/help.test.js`).
- **Samples**: `test.html` section "Commands" (a simulated device on a local connection that clamps one value and refuses
  another); robot sample: speed limit, motors, mode.

### Step 3: actions

- **Parsing**: `action`, `arg` lines (and binary 13), `title`, `confirm`, `longpress`; `ACK|` with run / ok / err and result
  text; section 42.
- **Commands**: `call(telemetry, args)` (validated against the declaration; a promise of the answer), call ids, resends, the calls
  of an action (`TELEPLOT.commands.calls(telemetry)`: id, arguments, sent, run, end, status, text; cached like `textRuns` and
  completed as answers come).
- **Values view**: the action row, the form (fields by type, descriptions, optional / default, validation), confirm, longpress,
  color, the running button.
- **Timeline** (`116`): request ticks on a setting's lane; the action lane with a band per call. **Log** (`112`): requests and
  answers. Tests in `viewTimeline.test.js`, `viewLog.test.js`.
- **Samples**: reset odometry (confirm), go to (target + optional speed and avoid), dock (longpress), stop (red).

### Step 4: driving

- **Commands**: `hold(telemetry, getValue)` / `release(telemetry)`, rest value, stop on hidden / blur / CMD off.
- **Controls option** of the values view: tiles, pad, rocker, pad + rocker (`axes`), dimmed when CMD is off; `keyboard` option
  (and a flag the webapp's shortcut handler checks). `DASH|…|controls=1` works through the option schema (`151`).
- **2D view** (`115`): the ghost of a writable `pose2d` / `xy`, move and turn handles, Send / Enter / Esc, dashed until the echo.
  Tests in `viewScene2D.test.js` (`buildItems` with a ghost).
- **Samples**: robot `cmd_vel` (pad + rocker) in a Drive controls view, and "set pose" on the Map.

### Step 5: clients and documents

- **C++** (`clients/cpp/Teleplot.h`): `param`, `action` with arguments, `poll`, text and binary; `clients/cpp/Telecmd.h` (V1) is
  removed.
- **Python**: a small client library (`clients/python/teleplot.py`, none exists yet: the folder holds examples) with `param`,
  `action`, `poll`.
- **Arduino**: an example over serial.
- What a client library does: declares at start and every few seconds; publishes the applied value after each write and
  periodically (the echo); clamps to the range and rounds to the step before applying; runs a call id once and answers again when
  it comes back; stops a continuous control after `hold`; ignores names it did not declare.
- Docs: `binaryProtocol.md`, `sources.md`, `README.md` (V2 part), this page.

## Open questions

1. **Pause.** Pause ignores data, so a write cannot be confirmed while paused. For now: writing is disabled while paused. Or pause
   could freeze the display only, data still stored.
2. **Requests of other pages**: should the server relay them, so every page sees who changed what?
3. **Names of the requests in exports**: in binary they are telemetries of `CLIENT_ID_PAGE`; in text they need a name of their own
   (`kp.requested`?).
4. **Initial values**: is the periodic publishing enough, or should the page ask for all attributes and values at once (useful for
   ranges and frames too)?
5. **Section lengths**: a version 2 of the binary protocol with a length per section would make every future addition safe.
6. **Persistence**: proposed: the page never re-applies values by itself; at most "copy the settings as text".
7. **Exclusive control**: a lease (one page drives, the others see it) if several pages driving at once is a real case.
