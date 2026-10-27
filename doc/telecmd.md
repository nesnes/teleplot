# Commands: writable telemetries (telecmd)

This page is the spec of commands, and where they are built ("Implementation"). The client libraries that speak it: Python
([`clients/python/teleplot.py`](../clients/python/teleplot.py)), C++ and Arduino ([`cpp-client-api.md`](cpp-client-api.md) "5. Settings and actions").

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
- **Editing happens where the value is displayed**, with editors light enough to live in the views that exist. The one control
  that has no home there, the joystick, is a view type of its own.

What it gives:

- **Almost no new protocol.** A few attributes, the existing data in the other direction, one call line, one answer line. Range,
  unit, label, frame, color: what a telemetry already has applies to its writes.
- **No discovery request.** Commands come with the attributes of the telemetries: a page that connects late learns them like the
  rest.
- **Reliability for free.** Setting a value can be repeated, so the page resends until the echo matches: a lossy link is not a
  problem.
- **"Never invent" holds.** A view displays the value the device reported, never the one typed. What was asked is a target only
  until the device answers.
- **What the page sent is telemetry too**: every setting written and call made is a line of the log telemetry `commands.sent`
  (source "page"), shown and exported like the rest; the answers of the devices are log samples of their actions.

## Protocol

### Declaring a setting

An attribute of the telemetry, sent once and again at will (a client library repeats it every few seconds), before or after its
data.

```
ATTR|kp|write|min=0|max=10|step=0.01|desc=Proportional gain     a number, between 0 and 10
ATTR|motors|write=bool                                          a switch (a number, 0 or 1)
ATTR|mode|write=text                                            a text…
mode:idle,auto#on its own,manual|enum                           …among these: its enum (#: a caption shown with a choice)
ATTR|name|write=text                                            a free text
ATTR|goal|write=xy                                              a 2D point, in the frame of the telemetry
ATTR|pose|write=pose2d                                          x, y and yaw (radians, like R of 2D| lines)
ATTR|cmd_vel|write=pose2d|rate=20|hold=200|min=-1|max=1         continuous: velocities (vx, vy, wz) from a pad
ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200           a differential base: no vy, one stick
ATTR|kp|write=                                                  no more writable
```

- **Type.** `write` alone takes the type of the data the telemetry already has; `write=<type>` gives it: `number`, `bool`, `text`,
  `xy`, `xyz`, `pose2d`.
- **Choices.** The texts a setting can take are its **enum** structure ([`graph.md`](graph.md)): a sample `name:a,b,c|enum` (binary
  section 43), sent once and again with the descriptions; `#caption` after a text: words shown with that choice. A text outside them
  is refused before it is sent.
- **Keys.** `step` (what a slider moves by, and the tolerance of the echo), `rate` (writes per second
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
ATTR|robot.goto|arg=avoid|type=text|enum=none,people,all|optional|default=people
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

A call: `!`, the name, `#` and an id (increasing; a page starts from a random one, so that a reloaded page does not reuse the ids of
the previous one), then the arguments **by name**, those left empty not sent. Values of several numbers are separated by `,`; in
the texts of a call, `% : , = |` and line feeds are written `%XX`. A text setting only escapes `%` and line feeds (it is the rest of
its line).

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
ACK|robot.cmd_vel:err:not in manual    a continuous setting (a joystick) it cannot apply, answered to each value
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

A continuous setting has no request to refuse (it is streamed), so a device that cannot apply what it receives (wrong mode, motors
off) answers `ACK|name:err:why` to each value instead of echoing it, and keeps sending what it applies. The page keeps the latest
reason while errs keep coming (1.5 s after the last one: `TELEPLOT.commands.refusal(telem)`) and the joystick shows it, in red,
under the pad. In binary it is the same call answer as a refused setting (`CALL_ID_SETTING`, status error). Zeros, the rest
value sent on release, should always be accepted. The robot sample does this: `cmd_vel` is refused unless it is in manual mode,
motors on.

### Binary

- Attributes: `TELEM_ATTR_WRITE` (11) `{KIND[8]} {TYPE[8]} {FLAGS[8]} {STEP[64]} {RATE[16]} {HOLD[16]} {AXES[8]}` (kind: 0 none,
  1 setting, 2 action; type: 0 = the type of the data, then number, bool, text, xy, xyz, pose2d; flags: bit 0 confirm, bit 1
  longpress; step NaN = none; rate and hold 0 = none; axes: a bit per axis, 0 = all), the choices as a `TELEM_DATA_ENUM` section
  (43, the texts separated by line feeds; attribute 12 is retired), `TELEM_ATTR_ARG` (13) `{INDEX[8]} {TYPE[8]} {FLAGS[8]} {MIN[64]} {MAX[64]} {STEP[64]} {NAME} {UNIT}
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

- **Server** ([`server.md`](server.md)). It learns the address of each sender: text packets become `[time, text, sender]` (`sender` an index,
  its address in `senders`, given once), and the text message before a binary one lists the senders of its packets (`binary`). A
  page is greeted with `{"hello": {readOnly, senders}}`: an older server never says hello, and the page knows it cannot send
  commands through it. The page writes with `{"write": "kp:0.42", "to": sender}` or `{"writeBinary": base64, "to": sender}`.
  `{"cmd": text}` and `--cmd-host` / `--cmd-port` stay for raw messages. Option `--read-only`: writes are refused.
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
exactly as today, with no exception: a joystick view still shows the reported value, without its knob, and says "Commands are
off" under its pad. Action rows keep their last result (it is telemetry).

Touching a command while CMD is off (pressing a joystick, clicking the value or the bar of a setting, pressing a writable pose on a
2D view) sends nothing, and says so where it was touched for 4 s: "Commands are off: nothing is sent." with a **Switch on**
button. `TELEPLOT.commands.blockedWhileOff(telem)` tells the views (true while off) and calls `onBlockedHooks`: the webapp
flashes its CMD button and keeps the top menu visible meanwhile.

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
- A continuous telemetry (`rate` / `hold`) shows its value here; it is driven from a joystick view.

### Joystick view (117)

A view type (`teleplot-joystick`, `"joystick"` in `createView`, `DASH|` lines and the editor menus) for **one** continuous
telemetry (`rate` / `hold`): a pad for `xy`, a rocker that springs back for a number (option `orientation`: horizontal or
vertical), a pad and a rotation rocker for `pose2d` (one stick, up = forward and sideways = turn, when `axes=x,yaw`). Two sticks
are two joystick views side by side in a row. It is a display view too: a ring shows what the device reports, CMD on or off; CMD
on adds the knob, which is what the page sends. Released, the knob springs back. Option `keyboard`: off (default), arrows, or
WASD, read by key position (`event.code`), only while the view has the focus, page shortcuts paused meanwhile.
`suggestViewType` answers `"joystick"` for a writable telemetry with `rate` / `hold`: dragging it, the auto dashboard and
`DASH|Robot/Drive:joystick:robot.cmd_vel` all make one.

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

- **Telemetries**: a pen after the name of writable telemetries, a ▶ after actions, CMD on or off. Controls are a category of their
  own, with their filters: a setting is tagged SET (then the type of its value), an action BUTTON, whatever its answers are stored as
  (log lines of it), with how its last call went as its value ("#12 done", "not called yet"). Dragging works as today (the default
  view of the telemetry, editable in place when CMD is on): no special drag, since in-place editors need no special view.
- **Sources**: a "Commands" section per device (its settings and actions, the last result, the round trip from sending to the
  echo); the console shows what the page sent.
- **Help**: the tiles "Settings", "Buttons", "A joystick" and "A pose on the map", sent by a pretend device of the page that applies
  settings and answers calls, so they can be tried for real ([`webapp-layout.md`](webapp-layout.md) "Help panel").

### Not now

3D view, image and camera views; picking an action's argument on a map (typed in the form for now). Dropped during the design: a
command palette, requests drawn on charts, reserved action names, a toolbar of actions, progress of a call, a special drag for
command views, a "controls" kind of values view (the joystick view replaces it).

## Implementation

Built in five steps, each tested before the next (plan of 2026-10-19). Where things are:

- **Protocol** (`011-protocol.js`): `TELEM_ATTR_WRITE` 11 `{kind, type, step, rate, hold, axes, confirm, longpress}`, the choices
  as an enum structure (`SECTION_TYPE_TELEM_DATA_ENUM` 43, `telem.getEnum()`; attribute 12 retired on 2026-10-27), `TELEM_ATTR_ARGS` 13 (the list of arguments), `TELEM_ATTR_DESC` 14, `TELEM_ATTR_TITLE` 15, `SECTION_TYPE_CALL` 41,
  `SECTION_TYPE_CALL_ANSWER` 42, `WRITE_TYPES`, `WRITE_AXES`. Parsing: `ATTR|` keys and `ACK|` lines in `040`, the attributes and
  section 42 in `041`.
- **Path back**: telemetries remember the sender they came from (`telemetry.endpoint`, set through `datastore.withSource(source, fn,
  endpoint)` / `connection.receive(fn, bytes, endpoint)`); connections have `canWrite()`, `whyNotWritable()`, `write({telemetry,
  text, bytes})` (`020`; server `021`, serial `022`); `023-connectionLocal.js`: `TELEPLOT.connection.addConnectionLocal(name,
  onWrite)` for sources of the page (`sendText`, `sendBinary`). The server: [`packages/server/main.js`](../packages/server/main.js) (senders, hello, `write` /
  `writeBinary`, `--read-only`).
- **`025-commands.js`** (`TELEPLOT.commands`): `declaration(telem)`, `isWritable`, `isAction`, `isContinuous`, `args`, `whyNot`,
  `canWrite`, `setEnabled` (the state is `TELEPLOT.state.commands`), `summary()`, `deviceName`; settings: `write(telem, value)`
  (returns "" or why not), `request(telem)` (`{target, status, reason, reported}`), `dismiss`, `reported`, `history(telem)`;
  actions: `validate(telem, inputs)`, `call(telem, inputs)` (`{id, reason, errors}`), `calls(telem)` / `lastCall(telem)` (read back
  from the answers, completed with what this page sent); continuous: `hold(telem, getValue)`, `release`, `isHeld`, `restValue`;
  encoders `settingLine`, `callLine`, `settingPacket`, `callPacket`; `keyboardCaptured` (a joystick drives with the keys). The
  work is done by `__update` in the update loop (`998`), never on the ingestion path. What the page sent is logged as
  `commands.sent`; the requests of the settings are kept in memory (`history`, for timelines: not exported).
- **Views**: values view (`110`: `commandState`, `valueAt`, the editors, the action row and form, `commandsUI` false in a chart
  legend), joystick (`117-viewJoystick.js`: `modeOf`, `toValue`, `toPlace`, `fromKeys`), timeline (`116`: lane kind "calls",
  `buildCalls`, `buildRequests`), 2D view (`115`: `isPose`, a "pose" item, the ghost: `ghostValue`, `yawOf`, `__commandDown`...).
  `suggestViewType`: actions and settings "values", continuous ones "joystick", pose2d / xy settings "2d"; the auto dashboard puts
  settings and actions without label in one values view titled "Commands". A telemetry that only declares something is announced
  (`hasContent`) and is not "empty" for views.
- **Webapp**: CMD button (`top-menu.js`), pens (`panel-telemetries.js`), commands of each source (`panel-sources.js`), Help tiles
  (`panel-help.js`), joystick in the editor menus, the robot sample (`sample-robot.js`: a local connection that declares its
  commands, reads them like a device and answers).
- **Tests**: [`packages/teleplot-js/tests/commands.test.js`](../packages/teleplot-js/tests/commands.test.js) (parsing, settings, actions, binary, continuous, server and serial
  connections, views), `parseDataText.test.js`, `dashboards.test.js`; [`packages/server/tests/server.test.js`](../packages/server/tests/server.test.js) (senders, writes back,
  read-only); [`packages/webapp/tests/help.test.js`](../packages/webapp/tests/help.test.js); [`clients/python/tests/test_teleplot.py`](../clients/python/tests/test_teleplot.py); [`clients/cpp/tests/test_client.cpp`](../clients/cpp/tests/test_client.cpp).
  `test.html` has a section "Commands".
- **Clients**: Python `clients/python/teleplot.py` (binary or text: `param`, `action`, `Arg`, `poll`; see [`python-client-api.md`](python-client-api.md)), C++ [`clients/cpp/Teleplot.h`](../clients/cpp/Teleplot.h)
  (binary: `param`, `action`, `poll`, `handlePacket`, `answer`; see [`cpp-client-api.md`](cpp-client-api.md)), Arduino library [`clients/arduino/Teleplot`](../clients/arduino/Teleplot/)
  (`param`, `action`, `poll`; text on a serial port or UDP), and [`clients/arduino/commands`](../clients/arduino/commands/) (by hand, without the library). The V1 `Telecmd.h` is removed.

Not done: commands in 3D and image views; picking an action's argument on a map.

## Open questions

1. **Pause.** Pause ignores data, so a write cannot be confirmed while paused. For now: writing is disabled while paused. Or pause
   could freeze the display only, data still stored.
2. **Requests of other pages**: should the server relay them, so every page sees who changed what?
3. **Requests in exports**: `commands.sent` is exported (a log); the state of each request (applied, kept...) is not. Is that enough?
4. **Initial values**: is the periodic publishing enough, or should the page ask for all attributes and values at once (useful for
   ranges and frames too)?
5. **Section lengths**: a version 2 of the binary protocol with a length per section would make every future addition safe.
6. **Persistence**: proposed: the page never re-applies values by itself; at most "copy the settings as text".
7. **Exclusive control**: a lease (one page drives, the others see it) if several pages driving at once is a real case.

---

[All documentation](README.md) · [Teleplot](../README.md)
