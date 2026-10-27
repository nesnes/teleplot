/*
 * Help panel (right dock): what Teleplot can show, how to get it, and how it works.
 * The first screen a newcomer sees (nothing displayed yet) is welcome.js.
 *
 * A gallery of results ("What do you want to see?"): a tile per thing Teleplot displays (HELP_TILES), in families (HELP_FAMILIES).
 * A tile opens its sheet in place of the gallery, about the text protocol: each message large, its parts named under it (helpParts;
 * pointing at a part says what it accepts: HELP_PART_TIPS), and under it, small, the command that sends it from the language chosen
 * once at the top of the panel (HELP_SENDERS, helpLine; remembered), with Send / Edit / Copy; then how it works and more ways. A
 * message that was sent has its numbers nudged (helpVary), so that sending it again shows a change. Tiles of the family "In the page"
 * are what is done with the mouse and the keyboard: no message, a button that opens the right place. "How Teleplot works"
 * (HELP_CONCEPTS) explains the ideas with schematics. A field at the bottom sends a message to the page itself, to try without a
 * device (helpDescribe says what was understood). See doc/webapp-layout.md "Help panel".
 */

// Families of tiles, in the order of the gallery
const HELP_FAMILIES = [
    { id: "numbers", title: "Numbers", sub: "the basics" },
    { id: "text", title: "Text over time", sub: "states, logs, what runs, graphs" },
    { id: "space", title: "Space", sub: "positions, shapes, meshes, scans" },
    { id: "pictures", title: "Pictures", sub: "images and cameras" },
    { id: "dashboards", title: "Dashboards", sub: "where things go" },
    { id: "control", title: "Control", sub: "from the page to your device" },
    { id: "page", title: "In the page", sub: "with the mouse and the keyboard" },
];

// The picture of the help: 64 x 48 pixels, a cone on a floor (a camera of the scene "scene")
const HELP_PICTURE = "PNG|camera,scene:iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAMAAACWlYwtAAAAD1BMVEXP6P+Kj5jmfiLAOSv///9A9kpQAAAAVElEQVR42u3MQQrAIBBDUfud+5+5uChF6BQhIgTmb0Nea1VVGYY9AJgDIAoyECP1rwgqECEKPG0HrrV4mwcbADLBBYBUOANALiwA/aujwH8FFDC6AfBCBoyP9FOtAAAAAElFTkSuQmCC";

// The same picture as a JPEG (optimized tables, no metadata: about 500 bytes)
const HELP_PICTURE_JPG = "JPG|camera,scene:/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//wAARCAAwAEADASIAAhEAAxEA/8QAGgABAAIDAQAAAAAAAAAAAAAAAAMFAgQGAf/EACsQAAIBAgQEBAcAAAAAAAAAAAABAgMRFWSj4QQFEhMUITHRIkFRYWOS8P/EABgBAAMBAQAAAAAAAAAAAAAAAAABBAID/8QAIxEAAgIBBAEFAQAAAAAAAAAAAQIAAxEEEjFRBRMUISJBYf/aAAwDAQACEQMRAD8A70AFUmgABCADFzipqDfxNNpfZW90IkDkxgE8TIADigFLj2V1Nhj2V1NjO9e5rY3UugUuPZXU2GPZXU2DevcNjdS6NOrw/Hy5nTr06MnQium/cSun6u396Gjj2V1NiBc75klZcRpx9iHyWrpq9NHazO4P9MfneZb4/S22+o6rXjaU++f3rE6EFJHnslFKfD9UkvOXXa7+trHuPZXU2LK7ksrV1PwwyJI9T1uyMPlTgylABibgABCRSr9E3HtVZW+cY3Q8X+Cv+hKCTUaCvUWmyx2zwP4Jbp/Ie3qFaUr2Tk/JkS4nqkl2ayu7XcfIlAO9FQoqFYYlRxn8k+puF9ps2BCecHmf/9k=";
// The same picture in two parts, as a device sends a picture too big for one message
const HELP_PICTURE_PARTS = (() => { const b64 = HELP_PICTURE.slice(HELP_PICTURE.indexOf(":") + 1), half = Math.ceil(b64.length / 2); return ["PNG|camera,scene:1/2:" + b64.slice(0, half), "PNG|camera,scene:2/2:" + b64.slice(half)]; })();
// A picture that is shown in its own place on a map (see the tile "A picture in the scene")
const HELP_SNAPSHOT = HELP_PICTURE.replace("PNG|camera,scene:", "PNG|snapshot,field:");
// A depth map of 8 x 6 pixels in millimetres (gray16): a wall at 4 m, the ground coming closer, a box at 1.5 m; the top left pixel has no measure
const HELP_DEPTH = "RAW|depth,scene:CAAGAAAAAAAAAKAPoA+gD6APoA+gD6APoA+gD6APoA+gD6APoA+gD6APoA+gD9wF3AXcBaAPoA+gD6APoA/cBdwF3AWgD6APKAooCigK3AXcBdwFKAooCtAH0AfQB9AH0AfQB9AH0Ac=";

// Every result Teleplot gives, and the reference of the text protocol: the Help is also the documentation, so a tile says everything
// about its kind of message. A sheet reads from the top: `format` (the general form of the messages), `fields` (every part of them:
// [part, what it is]), `examples` (the lines to send, in order, a recipe: "Send all" sends them), `more` (other examples, shown too),
// `notes` (good to know, short points). Every example has a `title` (what this message is for). Each tile is complete by itself (it
// never needs what another tile sent), every line shows something on a dashboard when it can, and sending it again shows a change
// (numbers are nudged by helpVary, texts go through `cycle`). In a `code`, {now} is the time of the page in ms (helpFill), so that
// times given by a message are recent. `code` is exactly what to send (checked against the library's parser in tests/help.test.js,
// which also checks that the fields name every property, flag and key the parser knows). `cpp` is the same with the C++ client.
// Tiles of the page have no message: `notes`, `keys` and `action` (what their button opens).
const HELP_TILES = [
    { id: "curve", family: "numbers", title: "A curve", sub: "a number over time", picture: "chart",
      format: ["name:value", "name[,label]:[time:]value[;[time:]value…][§unit][|flags]"],
      fields: [
          ["name", "What the telemetry is called: any text without : | , §. The same name again adds a sample to it."],
          [",label", "Optional: telemetries with the same label share a view (see Shown together)."],
          ["time:", "Optional: milliseconds since 1970, decimals allowed, or since the boot of a board that has no date (dated by the page). Without it, the sample is dated when it arrives."],
          ["value", "A number, with a point for decimals: 25.3, -4, 1e3."],
          [";", "Several samples in one message, each with its own time."],
          ["§unit", "Optional: shown after the value. Kept: sending it once is enough."],
          ["|np", "Flag: not put on the Live dashboard by itself (it stays in the Telemetries panel)."],
          ["|clr", "Flag: what the telemetry held before this message is forgotten (a new run)."],
          ["|t |log |stack |xy |xyz |pc |enum |edges", "Flags of other kinds of data: a text, a log line, a stack, a position, a point in space, a point cloud, the states and the transitions of a graph (their own tiles)."],
      ],
      examples: [
        { title: "A value", code: "temperature:25.3", note: "Charted as it arrives, at the time it arrives. Send it again: a new point.", expect: { name: "temperature", type: "number" },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [");"]] },
      ], more: [
        { title: "A unit", code: "temperature:25.3§°C", note: "After §: displayed next to the value.", expect: { name: "temperature", type: "number", unit: "°C" },
          cpp: [["Teleplot::instance().telemetry(\""], ["temperature", "name"], ["\").unit(\""], ["°C", "unit"], ["\").update("], ["25.3", "value"], [");"]] },
        { title: "Your own time", code: "temperature:{now}:25.3", note: "Before the value, in milliseconds since 1970 (here the time of this page).", expect: { name: "temperature", type: "number", timestamp: 1627551892.437 },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [", Teleplot::ms("], ["timestamp", "time"], ["));  // ms since 1970, or any std::chrono time"]] },
        { title: "Several values", code: "temperature:{now-200}:25.1;{now-100}:25.4;{now}:25.2", note: "Three samples in one message: nothing is lost between two sends.", expect: { name: "temperature", type: "number", samples: 3 } },
        { title: "Start again", code: "temperature:25.3|clr", note: "Forgets what the telemetry held before this value.", expect: { name: "temperature", type: "number", samples: 1 } },
      ],
      notes: [
          "One message is one line. Several lines can travel in one UDP packet, or one after the other on a serial port.",
          "The Live dashboard charts every new number by itself.",
          "A board without a date can send its time since boot (millis(), micros() / 1000): times before 1973 are dated by the page from when they arrive, and a reboot is noticed (Times since boot, in the Sources panel).",
          "A line Teleplot does not understand is ignored: paste it in the field at the bottom of this panel to know why.",
      ] },
    { id: "together", family: "numbers", title: "Shown together", sub: "a label groups them", picture: "chart2",
      format: ["name,label:value"],
      fields: [
          [",label", "After the name, behind a comma: any text without : | §. Telemetries with the same label share a view of the Live dashboard (one per kind of view), titled with the label."],
          ["Robot/Motion", "A label with a slash is a path: it chooses the dashboard and the view (see Choose where)."],
      ],
      examples: [
        { title: "A first one", code: "left,motors:0.4", note: "The label is motors: a chart titled motors.", expect: { name: "left", type: "number", label: "motors" } },
        { title: "Same label", code: "right,motors:0.38", note: "This one joins the chart of the first.", expect: { name: "right", type: "number", label: "motors" } },
      ], more: [
        { title: "Kept apart", code: "debug:42|np", note: "The np flag: it stays out of the Live dashboard (it is in the Telemetries panel) until you add it to a view.", expect: { name: "debug", type: "number", autoplot: false } },
      ],
      notes: [
          "Every kind of message takes a label: numbers, texts, shapes, pictures.",
          "A label is kept: it can come with the first sample only.",
          "It decides where a telemetry first goes; you can move it afterwards.",
          "In the Telemetries panel a label is one card: drop it on a view to add all its telemetries, and the view takes the ones to come.",
          "A label also ties a camera to its 3D scene (see Through a camera).",
      ] },
    { id: "describe", family: "numbers", title: "Its description", sub: "unit, color, text", picture: "describe",
      format: ["ATTR|name|key=value|key=value…"],
      fields: [
          ["ATTR|", "Describes a telemetry: no sample, what does not change. Sent once (again at will), before or after its data."],
          ["unit=", "Its unit, shown after its values (like §unit)."],
          ["color=", "Its color in every view: a color name or #rrggbb. color= alone gives it back its own."],
          ["desc=", "A sentence about it: the tooltip of its name wherever it is shown (legends, values, logs, timelines, panels)."],
          ["min= max=", "The values it is expected between (see A gauge)."],
          ["write, action, arg=…", "What the page may change or call (see Settings and Buttons)."],
          ["%XX", "In the values, % | , = : and line breaks are written %XX, their code in hexadecimal (%7C for |)."],
      ],
      examples: [
        { title: "Its unit", code: "ATTR|tank|unit=L", note: "Liters: nothing shows yet, it describes the values to come.", expect: { name: "tank", attrs: { unit: "L" } } },
        { title: "Its color", code: "ATTR|tank|color=teal", note: "Its curve and its value are teal.", expect: { name: "tank", attrs: { color: "teal" } } },
        { title: "Its value", code: "tank:42.5", note: "The number itself: a teal curve, in liters.", expect: { name: "tank", type: "number" } },
      ], more: [
        { title: "All at once", code: "ATTR|tank|unit=L|color=teal|desc=Water left in the tank", note: "Keys can come together on one line. Point at the name tank: its description.", expect: { name: "tank", attrs: { unit: "L", color: "teal", desc: "Water left in the tank" } } },
      ],
      notes: [
          "A library repeats ATTR| lines every few seconds: a page opened later learns them too.",
          "A line with a key Teleplot does not know is not understood, and nothing of it is applied.",
      ] },
    { id: "gauge", family: "numbers", title: "A gauge", sub: "a range and limits", picture: "gauge",
      format: ["ATTR|name|min=value|max=value", "TH|name:[time:]limit<value:limit>value[,color][;time:…]"],
      fields: [
          ["min= max=", "The values the number is expected between. One side alone is fine; empty (min=) forgets it."],
          ["TH|", "Thresholds: limits with a name, from their time on."],
          ["limit<value", "Past the limit when the number is below the value."],
          ["limit>value", "Past the limit when the number is above the value."],
          [",color", "Optional: a color name or #rrggbb (else the theme's)."],
          ["time:", "Optional, before the limits: when they start to hold (ms). ; separates groups with other times."],
          ["limit<", "Without a value: that limit is removed from then on. The same name again replaces it."],
          ["%XX", "In limit names, % : ; | < > , are written %XX."],
      ],
      examples: [
        { title: "Its range", code: "ATTR|battery|min=9|max=12.6", note: "From 9 to 12.6. Nothing shows yet: it describes the values to come.", expect: { name: "battery", range: [9, 12.6] } },
        { title: "Its value", code: "battery:10.2§V", note: "The number itself: shown as a gauge.", expect: { name: "battery", type: "number", unit: "V" } },
        { title: "Its limits", code: "TH|battery:low<10.5:empty<9.9,red", optional: true, note: "Past one, the value says which one, in its color.", expect: { name: "battery", thresholds: ["empty<9.9,red", "low<10.5"] } },
      ], more: [
        { title: "A limit that changes", code: "TH|battery:{now}:low<10.8", note: "From this time on; what was drawn before keeps the limit it had.", expect: { name: "battery", thresholds: ["low<10.8"] } },
        { title: "Remove a limit", code: "TH|battery:empty<", note: "No value: empty is no longer a limit.", expect: { name: "battery", thresholds: [] } },
        { title: "Only a maximum", code: "ATTR|load|max=100", note: "One end is enough for a chart's scale; a gauge needs both.", expect: { name: "load", range: [undefined, 100] } },
      ],
      notes: [
          "A number with both ends of its range, given before its first value, is a gauge on the Live dashboard; otherwise a chart.",
          "A chart can take the range as its scale (option scale=range) and draws the limits as dashed lines (option thresholds).",
          "On a timeline, a number with limits gets a lane of bands: where it is past one.",
          "Limits are kept by the data window and written in exports.",
      ] },
    { id: "state", family: "text", title: "A state", sub: "the latest text", picture: "text",
      format: ["name[,label]:[time:]text|t"],
      fields: [
          ["text", "Any text, colons included. The same text again continues the state; a different one starts another."],
          ["time:", "Optional: a first field that is a number (ms). A text that starts with a number and a colon needs its time."],
          ["|t", "The flag of a state: its latest value matters (a mode, a status)."],
          ["name:|t", "An empty text is a state too: nothing (a hole in a timeline)."],
      ],
      examples: [
        { title: "A state", code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "Shown as a value. Send again: the next state.", expect: { name: "mode", type: "text", text: "driving", logText: undefined, view: "values" } },
      ], more: [
        { title: "Your own time", code: "mode:{now}:turning|t", cycle: ["mode:{now}:parked|t", "mode:{now}:driving|t"], note: "With its own time, like a number.", expect: { name: "mode", type: "text", timestamp: 1627551892.437 } },
        { title: "Nothing", code: "mode:|t", note: "An empty text: no state.", expect: { name: "mode", type: "text", text: "" } },
      ],
      notes: [
          "A state is a value on the Live dashboard, a band on a timeline, a mark on a chart.",
          "t, log and stack are the same data: the last flag used decides how it is shown by default.",
      ] },
    { id: "log", family: "text", title: "A log", sub: "lines to read in order", picture: "log",
      format: ["name[,label]:[time:]text|log", ">:text", ">time:text"],
      fields: [
          ["|log", "The flag of a log line: lines to read one after the other, each an instant."],
          [">:text", "A line of the general log, without a name."],
          [">time:", "Its time (ms), when it has one."],
          ["Serial port", "There, a line that does not start with > is a log line of the port; telemetry starts with >."],
      ],
      examples: [
        { title: "A named log", code: "nav,logs:Path clear|log", cycle: ["nav,logs:Obstacle ahead|log", "nav,logs:Turning left|log"], note: "A line of the log of nav, label logs: a Log view titled logs.", expect: { name: "nav", type: "text", logText: true, view: "log", label: "logs" } },
        { title: "The general log", code: ">:Motors armed", cycle: [">:Motors disarmed"], note: "A line starting with >: the general log.", expect: { log: true } },
      ], more: [
        { title: "Your own time", code: "nav:{now}:Battery low|log", cycle: ["nav:{now}:Battery charged|log"], note: "Its time first, as for a state.", expect: { name: "nav", type: "text", logText: true, timestamp: 1627551892.437 } },
      ],
      notes: [
          "Logs without a label share one Log view on the Live dashboard; with a label, several parts of a system are read together.",
          "Lines with error or warning words are colored. Hover a line: every view goes to its time.",
          "Log view options: maxLines, displayTimestamp, displayTelemetryName, displayTelemetryColor.",
      ] },
    { id: "timeline", family: "text", title: "A timeline", sub: "when states changed", picture: "timeline",
      format: ["DASH|dashboard/view:timeline:telemetry,telemetry…"],
      fields: [
          ["a state", "A band per state, from its sample to the next different one."],
          ["a log", "A tick per line."],
          ["a stack", "A row per level; what runs at the same time has a row each, under what holds it (see What runs)."],
          ["a number with limits", "A band where it is past a limit (see A gauge)."],
          ["another number", "A small line of its values; numbers=text shows them as states."],
      ],
      examples: [
        { title: "The timeline", code: "DASH|Robot/States:timeline:mode", note: "A Timeline view States in the dashboard Robot, with a lane for mode.", expect: { dashboard: "Robot" } },
        { title: "A state", code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "A band from now until the state changes. Send again: the next band.", expect: { name: "mode", type: "text", text: "driving" } },
      ],
      notes: [
          "A timeline is asked for: in Edit mode (+), or with a DASH| line (see Your dashboard). Stacks get one by themselves.",
          "Drag to zoom, as on a chart; double click to go back to live.",
          "Options: displayTelemetryName, stackDepth, numbers (auto, text).",
      ] },
    { id: "marks", family: "text", title: "Marks on a chart", sub: "events over curves", picture: "marks",
      format: ["DASH|dashboard/view:chart:number,text…"],
      fields: [
          ["a state", "A mark where it changes to a text, with the text next to it."],
          ["a log", "A mark per line."],
          ["close marks", "Closer than a few pixels: folded into short ticks without text (zoom to read them)."],
      ],
      examples: [
        { title: "The chart", code: "DASH|Robot/Drive:chart:velocity,mode", note: "A chart Drive in the dashboard Robot, for velocity and mode.", expect: { dashboard: "Robot" } },
        { title: "The curve", code: "velocity:1.2", note: "A number: the curve.", expect: { name: "velocity", type: "number" } },
        { title: "A state", code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "A mark where the state changes. Send again: a new mark.", expect: { name: "mode", type: "text", text: "driving" } },
      ],
      notes: [
          "A text telemetry has no curve: in a chart it is drawn as marks. Drop one on a chart, or name it in a DASH| line.",
      ] },
    { id: "stack", family: "text", title: "What runs", sub: "a profiler of your code", picture: "stack",
      format: ["name:[time:]level/level/level|stack"],
      fields: [
          ["level/level", "What is running: a path, outer level first, separated by /."],
          ["time:", "The time of the device (ms, with decimals when it measures finer). Short calls need it."],
          ["|stack", "The flag of a stack: still a state, read as a path."],
          ["name:|stack", "Empty: nothing runs."],
          ["path,path", "Several things at once, separated by commas (see A behavior tree)."],
          ["path=status", "A result: what ended so (failure, success...); a path without status runs."],
      ],
      examples: [
        { title: "One level", code: "task:loop|stack", note: "loop is running.", expect: { name: "task", type: "text", text: "loop", stack: true, view: "timeline" } },
        { title: "Deeper", code: "task:loop/plan|stack", note: "plan starts, in loop: loop stays one band, plan under it.", expect: { name: "task", type: "text", text: "loop/plan", stack: true } },
        { title: "Deeper still", code: "task:loop/plan/search|stack", note: "As deep as needed. When search ends, send loop/plan again.", expect: { name: "task", type: "text", text: "loop/plan/search", stack: true } },
        { title: "Nothing runs", code: "task:|stack", note: "An empty text.", expect: { name: "task", type: "text", text: "", stack: true } },
      ], more: [
        { title: "Your own time", code: "task:{now}.25:loop/plan|stack", note: "The time of the device, before the path.", expect: { name: "task", type: "text", timestamp: 1627551892.43725, stack: true } },
        { title: "Two at once", code: "task:nav/follow,arm/idle|stack", note: "Two things run at the same time: a row each in the timeline, under what holds them.", expect: { name: "task", type: "text", text: "nav/follow,arm/idle", stack: true } },
        { title: "Where you want", code: "DASH|Robot/Tasks:timeline:task|stackDepth=4", note: "A timeline in the dashboard Robot; stackDepth: rows of full height before they get thinner.", expect: { dashboard: "Robot" } },
      ],
      notes: [
          "Send a message each time something starts or ends. Hover a band: what it is, what it runs in, for how long.",
          "Stacks without a label share one timeline on the Live dashboard.",
      ] },
    { id: "statemachine", family: "text", title: "A state machine", sub: "its states, where it is", picture: "statemachine",
      format: ["name:[time:]state,box/state,…|enum", "name:[time:]from>to[=event],…|edges", "name:[time:]box/state|stack       (where it is)"],
      fields: [
          ["state,box/state", "Its states, separated by commas. box/state: a state inside another one, drawn as a box around it."],
          ["from>to=event", "A transition, and what makes it happen. from and to are states or boxes."],
          ["|enum |edges", "The flags of its structure. The same time again (yours) adds to it: a big one in several lines; a newer time replaces it."],
          ["#kind", "After a state: free text written above it."],
          ["|stack", "Where it is: the path of the current state (a |t state works too)."],
      ],
      examples: [
        { title: "Its states", code: "mode:idle,mission/goto,mission/grasp,error|enum", note: "mission holds goto and grasp.", expect: { name: "mode", enum: ["idle", "mission", "mission/goto", "mission/grasp", "error"] } },
        { title: "Its transitions", code: "mode:idle>mission=start,mission/goto>mission/grasp=arrived,mission>error=fault,error>idle=reset|edges", note: "Each with the event that makes it happen.", expect: { name: "mode", edges: 4 } },
        { title: "Where it is", code: "mode:mission/goto|stack", cycle: ["mode:mission/grasp|stack", "mode:error|stack", "mode:idle|stack"], note: "The current state, in blue; the transition it came by, in bold. Send again: the next state.", expect: { name: "mode", type: "text", text: "mission/goto", stack: true } },
      ], more: [
        { title: "A state with a kind", code: "mode:idle#waiting for a mission,mission/goto,mission/grasp,error|enum", note: "Words written above the state.", expect: { name: "mode", enum: ["idle", "mission", "mission/goto", "mission/grasp", "error"] } },
        { title: "Where you want", code: "DASH|Robot/Mode:graph:mode|trail=false", note: "A graph view Mode in the dashboard Robot, without its recent path.", expect: { dashboard: "Robot" } },
      ],
      notes: [
          "A graph view draws it on the Live dashboard: a state that holds others is a box; under it, the recent path (the last states, how long, the event between them).",
          "Its stack also gets a lane in the timeline. Hover a state: how many times it ran, for how long.",
          "A state that was not declared is drawn dashed. Graph view options: trail, events, kinds.",
      ] },
    { id: "behaviortree", family: "text", title: "A behavior tree", sub: "what ran, what failed", picture: "behaviortree",
      format: ["name:[time:]node#kind,node/child#kind,…|enum", "name:[time:]path=status,path,…|stack       (a tick)"],
      fields: [
          ["node/child", "Its nodes, a path each: the tree is drawn from the paths (no |edges)."],
          ["#kind", "Free text above the node: fallback, sequence, condition, action..."],
          ["path=status", "A result of the tick, any word: failure, error, fail (red), timeout, warning (yellow), success, ok, done (green); another word is gray."],
          ["path", "Without status: it runs, and so do the nodes that hold it (blue)."],
          ["a,b", "Several paths in one tick. A tick too long for one message: several lines with the same time (yours) are one."],
      ],
      examples: [
        { title: "Its nodes", code: "bt:root#fallback,root/patrol#sequence,root/patrol/battery_ok#condition,root/patrol/goto#action,root/dock#action|enum", note: "A fallback over a sequence and an action.", expect: { name: "bt", enum: ["root", "root/patrol", "root/patrol/battery_ok", "root/patrol/goto", "root/dock"] } },
        { title: "A tick", code: "bt:root/patrol/battery_ok=success,root/patrol/goto|stack", cycle: ["bt:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack"], note: "The check passed, goto runs. Send again: the check fails, the fallback docks.", expect: { name: "bt", type: "text", text: "root/patrol/battery_ok=success,root/patrol/goto", stack: true } },
      ], more: [
        { title: "A tick in two lines", code: "bt:{now}:root/patrol/battery_ok=success|stack", cycle: ["bt:{now}:root/patrol/goto|stack"], note: "With your time: two lines with the same time are one tick.", expect: { name: "bt", type: "text", stack: true } },
      ],
      notes: [
          "The active path (what runs, from the root down) is emphasized; a result off it is quieter.",
          "Its stack gets a lane in the timeline too: a row per node that runs beside another one.",
      ] },
    { id: "trail", family: "space", title: "A trail", sub: "x and y over time", picture: "xy",
      format: ["name[,label]:x:y[:time][;x:y[:time]…]|xy", "name[,label]:x:y:z[:time][;…]|xyz"],
      fields: [
          ["x:y", "A position, in your units: x forward, y to the left."],
          ["x:y:z", "A point in space, z up."],
          [":time", "Optional, after the coordinates (ms)."],
          ["|xy |xyz", "The flags: a position on a map (2D view), a point in a 3D view, each with the trail of where it went."],
      ],
      examples: [
        { title: "A position", code: "position:12.5:4.2|xy", note: "Send again: it moves, its trail follows.", expect: { name: "position", type: "2d", view: "2d" } },
      ], more: [
        { title: "Your own time", code: "position:12.5:4.2:{now}|xy", note: "The time comes after the coordinates.", expect: { name: "position", type: "2d", timestamp: 1627551892.437 } },
        { title: "In space", code: "drone:1.5:0.2:3|xyz", note: "Three numbers and xyz: a point in space.", expect: { name: "drone", type: "3d" } },
      ],
      notes: [
          "The trail is the last positions received (option trailLength, 200 by default, 0 for none).",
          "A point can be in the frame of another telemetry: 2D|position:F:robot (see Moving together).",
      ] },
    { id: "map", family: "space", title: "A map", sub: "2D shapes", picture: "map",
      format: ["2D|name[,label]:[time:]property:values:property:values…[;time:…][|flags]"],
      fields: [
          ["S:kind", "rect (default), circle, line, polygon, arrow, text; cube, sphere, cylinder, stl are seen from above."],
          ["P:x:y", "Position of its center (of the start of a line or an arrow), in your units."],
          ["R:angle", "Rotation in radians, counterclockwise."],
          ["SC:x:y", "Its size along its x and y (a shape is 1 by default). SC:s alone: the same on both."],
          ["RA:r", "Radius of a circle (SC of twice that)."],
          ["C:color", "A color name or #rrggbb."],
          ["O:opacity", "From 0 (invisible) to 1."],
          ["PT:x:y:x:y…", "The points of a line or a polygon, as many as needed, in the frame of the shape."],
          ["V:x:y", "The vector of an arrow, from its position."],
          ["TX:\"text\"", "The text of a text shape; quotes let it hold : and |."],
          ["TS:size", "Height of a text in your units (else a steady size on screen)."],
          ["LW:width", "Width of lines in your units (else as thin as the screen draws)."],
          ["T:…", "A picture on a rect (see A picture in the scene)."],
          ["F:name", "In the frame of another telemetry (see Moving together); FPX:name in the pixels of a picture."],
          ["shape, position…", "Long names work too: shape, position, rotation, scale, radius, color, opacity, points, vector, text, textsize, linewidth, texture, frame, pixels."],
          ["P::2", "An empty value keeps what the shape had: here only y changes."],
          ["W:x H:y", "Teleplot V1 sizes, still understood: SC:x:y is the same."],
          ["|np |clr", "Flags, as for numbers."],
      ],
      examples: [
        { title: "A rectangle", code: "2D|robot,field:S:rect:P:1.2:0.8:R:0.5:SC:0.3:0.2:C:blue", note: "Turned by 0.5 rad. The label field puts the shapes on one map.", expect: { name: "robot", shape: "rect", position: [1.2, 0.8, 0], label: "field", view: "2d" } },
        { title: "A line", code: "2D|route,field:S:line:PT:0:0:1:0.5:2:2:3:2:C:green", note: "Through these points. Add LW:0.2 for a real width.", expect: { name: "route", shape: "line", label: "field", view: "2d" } },
        { title: "Move it", code: "2D|robot:P:1.5:1:R:0.8", note: "Later: only what changes. Send again: it moves.", expect: { name: "robot", shape: "rect", position: [1.5, 1, 0] } },
      ], more: [
        { title: "A surface", code: "2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3", note: "A polygon is the surface inside its points.", expect: { name: "zone", shape: "polygon", label: "field", view: "2d" } },
        { title: "A circle", code: "2D|spot,field:S:circle:P:2.5:1.5:RA:0.3:C:orange:O:0.5", note: "RA: its radius.", expect: { name: "spot", shape: "circle", position: [2.5, 1.5, 0], label: "field", view: "2d" } },
        { title: "An arrow", code: "2D|wind,field:S:arrow:P:0.5:2:V:0.8:0.3:C:purple", note: "From its position, along V.", expect: { name: "wind", shape: "arrow", position: [0.5, 2, 0], label: "field", view: "2d" } },
        { title: "A text", code: "2D|goal,field:S:text:P:3:2:TX:\"Goal A\"", note: "TS:0.2 would give it a height in your units.", expect: { name: "goal", shape: "text", position: [3, 2, 0], label: "field", view: "2d" } },
      ],
      notes: [
          "Send everything once, then only what changes.",
          "A 2D| line is a 3D| line with z = 0: flat shapes also lie on the ground of 3D views, and the same properties work in both.",
          "What is higher is drawn over what is lower. Without a label, everything flat shares one 2D view on the Live dashboard.",
          "2D view options: displayGrid, displayAxes, axisRight / axisUp (how the scene is looked at), displayLegend, trailLength.",
      ] },
    { id: "scene", family: "space", title: "A 3D scene", sub: "shapes in space", picture: "3d",
      format: ["3D|name[,label]:[time:]property:values:property:values…[;time:…][|flags]"],
      fields: [
          ["S:kind", "cube (default), sphere, cylinder, stl (see A mesh); the flat kinds of A map lie on the ground."],
          ["P:x:y:z", "Position of its center, in your units: x forward, y to the left, z up."],
          ["R:roll:pitch:yaw", "Rotation in radians, around x, y, z."],
          ["Q:x:y:z:w", "Or a quaternion, w last. The latest of R and Q is used."],
          ["SC:x:y:z", "Its size along its own x, y, z: every shape is 1 by default (a cube 1 per side, a sphere 1 across, a cylinder 1 across and 1 high). SC:x:y keeps z, SC:s alone is the same on every axis."],
          ["RA:r", "Radius of a sphere or a cylinder (SC of twice that)."],
          ["C:color", "A color name or #rrggbb."],
          ["O:opacity", "From 0 (invisible) to 1."],
          ["T:…", "A picture on its faces (see A picture in the scene)."],
          ["F:name", "In the frame of another telemetry (see Moving together)."],
          ["shape, position…", "Long names work too: shape, url, position, rotation, quaternion, scale, radius, color, opacity, texture, frame."],
          ["P::2:", "An empty value keeps what the shape had: here only y changes."],
          ["time:…;time:…", "Several updates with their times (ms) in one line."],
          ["W:x D:y H:z", "Teleplot V1 sizes, still understood: SC:x:y:z is the same. PR (precision) is accepted and ignored."],
          ["|np |clr", "Flags, as for numbers."],
      ],
      examples: [
        { title: "A box", code: "3D|box,scene:S:cube:P:1:0:0.5:SC:1:1:1:C:orange", note: "1 along x, y and z.", expect: { name: "box", shape: "cube", position: [1, 0, 0.5], label: "scene" } },
        { title: "A ball", code: "3D|ball,scene:S:sphere:P:0:1:0.3:RA:0.3:C:red:O:0.5", note: "RA: radius. The same label puts both shapes in one scene.", expect: { name: "ball", shape: "sphere", position: [0, 1, 0.3], label: "scene" } },
        { title: "Move it", code: "3D|box:P:2:0:0.5:R:0:0:1.57", note: "Later: only the position and the rotation. Send again: it moves.", expect: { name: "box", shape: "cube", position: [2, 0, 0.5] } },
      ], more: [
        { title: "A cylinder", code: "3D|can,scene:S:cylinder:P:-1:0:0.4:SC:0.4:0.4:0.8:C:green", note: "It stands along z: 0.4 across, 0.8 high.", expect: { name: "can", shape: "cylinder", position: [-1, 0, 0.4], label: "scene" } },
        { title: "A quaternion", code: "3D|box:Q:0:0:0.38:0.92", cycle: ["3D|box:Q:0:0:0.71:0.71", "3D|box:Q:0:0:0:1"], note: "45° around z; send again: 90°, then not turned.", expect: { name: "box", quaternion: [0.92, 0, 0, 0.38] } },
        { title: "Stretch it", code: "3D|box:SC:2:1:0.5", cycle: ["3D|box:SC:1:1:1"], note: "2 long, 1 wide, 0.5 high.", expect: { name: "box", size: [2, 1, 0.5] } },
        { title: "Two times in a line", code: "3D|ball:{now-500}:P:0:1:0.3;{now}:P:0:1.5:0.3", note: "Where it was, then where it is.", expect: { name: "ball", position: [0, 1.5, 0.3] } },
      ],
      notes: [
          "Send everything once, then only what changes.",
          "Shapes without a label share one 3D view on the Live dashboard.",
          "3D view options: displayGrid, displayAxes, displayLegend, trailLength, pointSize, pointColorByHeight, cloudCount, cloudInterval.",
      ] },
    { id: "mesh", family: "space", title: "A mesh", sub: "an STL file", picture: "mesh",
      format: ["3D|name[,label]:S:stl:U:\"url\":property:values…"],
      fields: [
          ["S:stl", "The shape is a file: STL, binary or text, as CAD tools export them."],
          ["U:\"url\"", "Where the browser fetches it, in quotes: relative to this page (a file next to it), or on a site that allows it (CORS)."],
          ["SC:s", "The file is drawn in its own units, multiplied by SC (SC:0.001 turns millimeters into meters). SC:x:y:z per axis."],
          ["P, R, Q, C, O, F", "Moved, turned, colored like any shape (see A 3D scene)."],
      ],
      examples: [
        { title: "The pawn", code: "3D|pawn,scene:S:stl:U:\"media/pawn.stl\":P:0:0:0:C:orange", note: "1 high: media/pawn.stl comes with this page.", expect: { name: "pawn", shape: "stl", url: "media/pawn.stl", label: "scene" } },
        { title: "Move it", code: "3D|pawn:P:1:0.5:0:R:0:0:0.8", note: "Later: only where it is. Send again: it moves.", expect: { name: "pawn", shape: "stl", position: [1, 0.5, 0] } },
      ], more: [
        { title: "Its size", code: "3D|pawn:SC:2", cycle: ["3D|pawn:SC:1"], note: "Twice as big; send again: back to its size.", expect: { name: "pawn", size: [2, 2, 2] } },
      ],
      notes: [
          "A file that cannot be loaded is not drawn, and the view says why in a note at its bottom.",
      ] },
    { id: "frames", family: "space", title: "Moving together", sub: "relative to another", picture: "frames",
      format: ["2D|name:…:F:other", "3D|name:…:F:other"],
      fields: [
          ["F:other", "The positions and rotations are relative to the telemetry named other: when it moves or turns, this one follows."],
          ["F:", "Empty: back in the scene."],
          ["a frame in a frame", "Up to 16 levels."],
          ["what can have one", "Shapes, points (2D|name:F:robot on an xy telemetry), point clouds, cameras."],
      ],
      examples: [
        { title: "The body", code: "2D|robot,field:S:rect:P:1.2:0.8:R:0.5:SC:0.3:0.2:C:blue", note: "The body of a robot, on a map.", expect: { name: "robot", shape: "rect", position: [1.2, 0.8, 0], label: "field", view: "2d" } },
        { title: "An arrow on it", code: "2D|heading,field:S:arrow:V:0.4:0:F:robot", note: "In the frame of the robot: it starts at the robot and points where it looks.", expect: { name: "heading", shape: "arrow", label: "field", frame: "robot", view: "2d" } },
        { title: "A bumper", code: "2D|bumper,field:S:rect:P:0.2:0:SC:0.05:0.25:C:black:F:robot", note: "0.2 in front of the robot.", expect: { name: "bumper", shape: "rect", label: "field", frame: "robot", view: "2d" } },
        { title: "Move the body", code: "2D|robot:P:1.5:1:R:0.8", note: "The arrow and the bumper follow. Send again: it moves again.", expect: { name: "robot", shape: "rect", position: [1.5, 1, 0] } },
      ],
      notes: [
          "Describe the parts once, then move only the body.",
          "The pose of the frame is the one at the time shown: a trail follows where the frame was at each of its samples.",
      ] },
    { id: "cloud", family: "space", title: "A lidar scan", sub: "a cloud of points", picture: "cloud",
      format: ["name[,label]:[time;]x:y:z;x:y:z;…|pc"],
      fields: [
          ["x:y:z", "A point, in the frame of the sensor. A flat scan sets z to 0: it goes to a 2D view."],
          ["x:y:z:i", "With an intensity: points are colored from the lowest to the highest."],
          ["x:y:z:r:g:b", "With a color: red, green, blue, from 0 to 255 each (x:y:z:i:r:g:b: both). Every point of a line has as many values."],
          ["time;", "A field alone first: the time of the scan (ms)."],
          ["|pc", "The flag: all the points of the line are one sample, a whole scan."],
          ["3D|name:P…:R…", "Where the sensor is, sent like the position of a shape under the same name."],
      ],
      examples: [
        { title: "A scan", code: "lidar:1:0:0;0.7:0.7:0;0:1:0;-0.7:0.7:0;-1:0:0|pc", note: "Five points. Send again: a new scan.", expect: { name: "lidar", cloud: 5, view: "2d" } },
        { title: "The sensor", code: "3D|lidar:P:1:2:0.2:R:0:0:1.57", note: "Where it is: the scan moves with it.", expect: { name: "lidar", position: [1, 2, 0.2] } },
      ], more: [
        { title: "Intensities", code: "lidar:1:0:0:0.9;0.7:0.7:0:0.4;0:1:0:0.1|pc", note: "A fourth value per point.", expect: { name: "lidar", cloud: 3, intensity: true, view: "2d" } },
        { title: "Colors", code: "lidar:1:0:0:255:0:0;0:1:0:0:200:0;-1:0:0:0:0:255|pc", note: "r:g:b after x:y:z, from 0 to 255: a red, a green and a blue point.", expect: { name: "lidar", cloud: 3, view: "2d" } },
        { title: "Your own time", code: "lidar:{now};1:0:0;0:1:0|pc", note: "A field alone, first.", expect: { name: "lidar", cloud: 2, view: "2d" } },
      ],
      notes: [
          "Each scan is drawn where the sensor was at its time.",
          "View options: pointSize, pointColorByHeight, cloudCount and cloudInterval (several scans drawn together).",
      ] },
    { id: "picture", family: "pictures", title: "A picture", sub: "an image, as text", picture: "image",
      format: ["PNG|name[,label]:[time:]base64", "PNG|name:[time:]i/n:base64-part"],
      fields: [
          ["PNG| JPG|", "The format of the file."],
          ["base64", "The file itself (the bytes of the .png or .jpg), in base64."],
          ["time:", "Optional (ms), as for a number."],
          ["i/n:", "Part i of n, from 1: a picture cut in parts, each in a message of its own."],
          ["|np |clr", "Flags, as for numbers."],
      ],
      examples: [
        { title: "A picture", code: HELP_PICTURE, note: "64 x 48 pixels: a cone on a floor.", expect: { name: "camera", image: true, label: "scene" } },
      ], more: [
        { title: "A JPEG", code: HELP_PICTURE_JPG, note: "The same picture as a JPEG, the usual format of a camera.", expect: { name: "camera", image: "jpg", label: "scene" } },
        { title: "In parts: 1 of 2", code: HELP_PICTURE_PARTS[0], note: "The first half of the base64: nothing shows yet.", expect: { name: "camera", part: [1, 2] } },
        { title: "In parts: 2 of 2", code: HELP_PICTURE_PARTS[1], note: "The second half: the picture is complete and shows. The other order works too.", expect: { name: "camera", part: [2, 2] } },
      ],
      notes: [
          "An image view shows the picture of the time shown: drag on a chart, the picture follows.",
          "Why parts: a UDP packet holds 65 kB at most and is more likely lost above about 1.4 kB (one network frame); a serial line or the buffer of a microcontroller holds even less.",
          "Parts can come in any order; the picture shows when all n are there, and a lost part only loses that picture.",
          "With a time, give every part of a picture the same one: a part with another time starts a new picture.",
      ] },
    { id: "depth", family: "pictures", title: "A depth map", sub: "a distance per pixel", picture: "depth",
      format: ["RAW|name[,label]:[time:]base64", "ATTR|name|scale=0.001|nodata=0|depth=1"],
      fields: [
          ["RAW|", "Plain pixels: width and height (2 bytes each), the format (1 byte: 0 gray16, 1 float32), 3 bytes at 0, then the numbers row after row, little-endian. All of it in base64."],
          ["PNG|", "A 16-bit grayscale PNG works too (what OpenCV writes for a depth image): its numbers are read, not its 8-bit look."],
          ["scale=", "What a number is worth: number x scale, in the unit of the telemetry (0.001 shows millimetres in metres). 1 by default."],
          ["nodata=", "The number of a pixel without measure: 0 by default. nodata= (empty): every number is a measure. NaN never is one."],
          ["depth=", "1 by default: distances along the axis of the camera, placed in 3D and 2D views when the picture has a camera (K). depth=0 for other values (a temperature...)."],
          ["unit=", "The unit of the values, written after them."],
          ["time:, i/n:, |np |clr", "As for a picture."],
      ],
      examples: [
        { title: "How to read it", code: "ATTR|depth|scale=0.001|unit=m", note: "Its numbers are millimetres: shown in metres.", expect: { name: "depth", scale: 0.001 } },
        { title: "A depth map", code: HELP_DEPTH, note: "8 x 6 pixels: a box 1.5 m away in front of a wall at 4 m; the top left pixel has no measure. Point at the picture: the value of a pixel.", expect: { name: "depth", image: "raw", label: "scene" } },
        { title: "Its camera", code: "3D|depth:K:6:6:3.5:2.5:8:6:P:0:0:1", note: "1 m above the ground, looking along x. Send again: it moves.", expect: { name: "depth" } },
        { title: "A wall to compare", code: "3D|wall,scene:S:cube:P:4.06:0:1.5:SC:0.1:6:2.6:C:gray:O:0.3", note: "A 3D view of scene shows the camera and each pixel where it was measured: the top rows lie on the face of this wall, 4 m away.", expect: { name: "wall", shape: "cube", label: "scene" } },
      ], more: [
        { title: "Every number a measure", code: "ATTR|depth|nodata=", note: "0 is a value too: the top left pixel shows.", expect: { name: "depth", scale: 1 } },
        { title: "Not distances", code: "ATTR|thermal|scale=0.01|unit=°C|depth=0", note: "A thermal camera in hundredths of a degree: colored, never placed in 3D.", expect: { name: "thermal", scale: 0.01 } },
      ],
      notes: [
          "The page decodes the numbers itself (a browser only gives 8 bits of a picture) and keeps what was received as it is.",
          "Colors go from the 1st to the 99th percentile of each picture, or between min= and max= when the telemetry has both. Image view options: colormap, valueRange, displayColorScale.",
          "In 3D and 2D views each pixel is placed along its ray (lens distortion followed back) at its distance along the axis of the camera. View option depthPoints caps how many.",
      ] },
    { id: "pixels", family: "pictures", title: "Boxes on a picture", sub: "in its pixels", picture: "pixels",
      format: ["2D|name:…:FPX:picture"],
      fields: [
          ["FPX:picture", "Positions are pixels of the pictures of that image telemetry: u to the right, v down, 0:0 the center of the top left pixel."],
          ["SC, TS, LW", "In pixels too."],
          ["any 2D shape", "rect, circle, line, polygon, arrow, text (see A map)."],
      ],
      examples: [
        { title: "The picture", code: HELP_PICTURE, note: "A cone on a floor, 64 x 48 pixels.", expect: { name: "camera", image: true, label: "scene" } },
        { title: "A box", code: "2D|found:S:rect:P:44:26:SC:22:28:C:red:O:0.25:LW:1:FPX:camera", note: "Around the cone: its center at pixel 44, 26, 22 wide and 28 high.", expect: { name: "found", shape: "rect", pixels: "camera" } },
        { title: "A text", code: "2D|found.name:S:text:P:33:8:TX:\"cone 0.92\":C:red:FPX:camera", note: "TS:6 would make it 6 pixels high.", expect: { name: "found.name", shape: "text", pixels: "camera" } },
      ],
      notes: [
          "What a detector finds is drawn on the picture with no knowledge of the camera; the picture itself is never changed.",
          "Only the image views of that picture draw it, and they take it by themselves (option pixelDrawings).",
      ] },
    { id: "camera", family: "pictures", title: "Through a camera", sub: "the scene over the picture", picture: "camera",
      format: ["3D|picture:K:fx:fy:cx:cy:width:height:P:x:y:z:R:…", "3D|picture:DC:k1:k2:p1:p2:k3"],
      fields: [
          ["3D|picture", "Sent to the name of the image telemetry: it describes its camera."],
          ["K:fx:fy:cx:cy:width:height", "Intrinsics in pixels: focal lengths, principal point, and the size of the picture they are given for."],
          ["DC:k1:k2:p1:p2:k3", "Optional: the distortion of the lens, as OpenCV gives it."],
          ["P, R or Q", "Where the camera is in the scene, looking along its x (y to the left of the picture, z up)."],
          ["SC:depth", "How far its pyramid is drawn in 3D views (1 by default)."],
          ["intrinsics, distortion", "The long names of K and DC; position, rotation, quaternion, scale too."],
      ],
      examples: [
        { title: "The picture", code: HELP_PICTURE, note: "In the scene scene (its label).", expect: { name: "camera", image: true, label: "scene" } },
        { title: "Something to see", code: "3D|marker,scene:S:sphere:P:3:0:0.3:RA:0.3:C:red", note: "3 in front of the camera.", expect: { name: "marker", shape: "sphere", position: [3, 0, 0.3], label: "scene" } },
        { title: "The camera", code: "3D|camera:K:55:55:32:24:64:48:P:0:0:1", note: "1 above the ground: the sphere is drawn over the picture. Send again: it moves.", expect: { name: "camera", camera: true } },
        { title: "Its lens", code: "3D|camera:DC:-0.26:0.07:0:0:0", note: "What is drawn follows the curves of the picture.", expect: { name: "camera", distortion: [-0.26, 0.07, 0, 0, 0] } },
      ],
      notes: [
          "The picture is never undistorted: what is drawn over it is bent like the lens bends the scene.",
          "The scene is drawn as it was when the picture was taken. The 3D view of the label shows the camera.",
          "Image view options: outline, outlineWidth, overlayOpacity, pixelDrawings.",
      ] },
    { id: "onscene", family: "pictures", title: "A picture in the scene", sub: "a floor plan, a screen", picture: "texture",
      format: ["2D|name:S:rect:…:T:url:\"url\"", "2D|name:S:rect:…:T:telem:picture", "2D|picture:P:…:SC:…"],
      fields: [
          ["T:url:\"url\"", "An image file on the shape, fetched by the browser like a mesh."],
          ["T:telem:picture", "The pictures of an image telemetry: the one of the time shown."],
          ["C:white", "The picture is multiplied by the color: white shows it as it is."],
          ["2D|picture or 3D|picture", "A shape line under the name of an image telemetry (not a camera) gives it a place: it shows its own pictures there."],
      ],
      examples: [
        { title: "A floor plan", code: "2D|plan,field:S:rect:P:2:1.5:SC:4:3:C:white:T:url:\"media/floor-plan.png\"", note: "4 by 3, under what the map shows. media/floor-plan.png comes with this page.", expect: { name: "plan", shape: "rect", texture: "url", label: "field", view: "2d" } },
        { title: "A place for pictures", code: "2D|snapshot,field:S:rect:P:3.2:2.4:SC:0.8:0.6", note: "Named after the image telemetry to come. Send again: it moves.", expect: { name: "snapshot", shape: "rect", label: "field", view: "2d" } },
        { title: "The picture", code: HELP_SNAPSHOT, note: "It shows in its rectangle; zoom on a chart: the picture of that time.", expect: { name: "snapshot", image: true, label: "field", view: "2d" } },
      ], more: [
        { title: "On a 3D screen", code: "3D|screen,scene:S:cube:P:0:0:0.6:SC:1.6:0.05:1.2:C:white:T:telem:snapshot", note: "A box 1.6 wide, 0.05 thin, 1.2 high, showing the pictures of snapshot.", expect: { name: "screen", shape: "cube", texture: "telem", label: "scene" } },
      ],
      notes: [
          "Give the rectangle the proportions of the picture: it is stretched to it, never cut.",
          "A picture that has camera parameters (K) stays a camera (see Through a camera).",
      ] },
    { id: "dashboard", family: "dashboards", title: "Your dashboard", sub: "views where you want", picture: "dashboard", viewOptions: true,
      format: ["DASH|dashboard/layout/…/view[:type[:telemetry,telemetry…]][|option=value…]"],
      fields: [
          ["dashboard/…/view", "The path: the dashboard, the layouts, the view. Missing layouts are created (grids). The last name is the title of the view; #1 is a name without title."],
          ["type", "chart, values, log, timeline, graph, 2d, 3d, image, joystick; row, column, grid, stack (layouts); none removes it. Left out: what suits its first telemetry."],
          ["telemetries", "Their names, separated by commas: they do not have to exist yet."],
          ["w= h=", "Width (columns of a grid, a share of a row) and height (steps of 4 em)."],
          ["title=", "The text in the corner, when it is not the name."],
          ["time=", "Its time group: inherit, dashboard, or a name shared by the views that zoom together."],
          ["follow=", "Labels it follows: their telemetries join it, those received and those to come."],
          ["justify= align= gap=", "Of a layout: start, center, end, space-between, space-around; start, center, end, stretch; the gap in em."],
          ["columnWidth=", "Of a grid: the minimum width of a column, in em."],
          ["appearance= accent=", "Of a layout: card, flat or inherit; the top color on, off or inherit."],
          ["DASH|dashboard:type", "The dashboard alone: its top layout."],
          ["%XX", "In names and values, % / : , | = and line breaks are written %XX."],
      ],
      examples: [
        { title: "A chart", code: "DASH|Robot/Power:chart:voltage|w=4|h=3", note: "Power, in the dashboard Robot, 4 columns wide and 3 high.", expect: { dashboard: "Robot" } },
        { title: "Its data", code: "voltage:12.1", note: "A number for it.", expect: { name: "voltage", type: "number" } },
        { title: "A log in a layout", code: "DASH|Robot/side/Events:log:events|maxLines=50", note: "The layout side is created on the way.", expect: { dashboard: "Robot" } },
        { title: "Its data", code: "events:Started|log", cycle: ["events:Docked|log", "events:Charging|log"], note: "A log line for it.", expect: { name: "events", type: "text", logText: true } },
      ], more: [
        { title: "A layout", code: "DASH|Robot/side:column", note: "Layouts have lines too. Lines can come in any order.", expect: { dashboard: "Robot" } },
        { title: "Follow a label", code: "DASH|Robot/Motors:chart|follow=motors", note: "The telemetries labelled motors join the chart.", expect: { dashboard: "Robot" } },
        { title: "A time of its own", code: "DASH|Robot/Camera:image:camera|time=Live", note: "Stays on the latest picture while the others zoom.", expect: { dashboard: "Robot" } },
        { title: "Remove a view", code: "DASH|Robot/Power:none", note: "The type none.", expect: { dashboard: "Robot" } },
      ],
      notes: [
          "A device can send its dashboard again and again: a line only does something when it changed, and what you changed by hand stays.",
          "A received dashboard is shown, unless you are on one of your own or editing.",
          "The dashboard menu exports any dashboard as these lines, and imports them.",
          "The options of each type of view are listed below.",
      ] },
    { id: "place", family: "dashboards", title: "Choose where", sub: "a label that is a path", picture: "place",
      format: ["name,dashboard/layout/…/view:value", "name,dashboard/:value"],
      fields: [
          ["dashboard/view", "The dashboard, then the view: both are created if needed, and the telemetry stays off the Live dashboard."],
          ["one view per kind", "Numbers share a chart, texts a values view next to it (Motion#values)…"],
          ["dashboard/", "A path that ends with /: only the dashboard; the telemetry gets a view of its own."],
      ],
      examples: [
        { title: "Into a chart", code: "speed,Robot/Motion:1.2", note: "speed goes to the chart Motion of the dashboard Robot.", expect: { name: "speed", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
        { title: "The same chart", code: "accel,Robot/Motion:0.3", note: "Same path: the same chart.", expect: { name: "accel", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
      ], more: [
        { title: "Only the dashboard", code: "temp,Robot/:21", note: "A view of its own in Robot.", expect: { name: "temp", type: "number", label: "Robot/", dashboard: "Robot" } },
      ],
      notes: [
          "With DASH| lines too, the lines win: a telemetry they list goes where they say, whichever comes first.",
          "Since / has a meaning in a label, a Teleplot V1 label that held one is read as a path.",
      ] },
    { id: "settings", family: "control", title: "Settings", sub: "values the page can change", picture: "controls",
      format: ["ATTR|name|write[=type][|min=…|max=…|step=…|desc=…]", "name:a,b,c|enum     (the texts it can take)", "name:value          (what the page sends, then your device)", "ACK|name:err:why    (your device refuses)"],
      fields: [
          ["write", "The page may change it. Alone: the type of its data."],
          ["write=type", "number, bool (a switch: 0 or 1), text, xy, xyz, pose2d (x, y and an angle in radians)."],
          ["min= max= step=", "A slider, and what it moves by (also how close the echo must be)."],
          ["name:a,b#caption,c|enum", "A text among these (its enum, see A state machine); #caption: words shown with a choice."],
          ["desc=", "A sentence: the tooltip of its name, and of its control."],
          ["write=", "Empty: no longer writable."],
          ["name:value", "What the page sends: the line your device would send, without a time."],
          ["ACK|name:err:why", "Your device refuses (optional: its value already tells)."],
      ],
      examples: [
        { title: "A slider", code: "ATTR|speed_limit|write|min=0|max=2|step=0.1", note: "A number from 0 to 2. The page sends speed_limit:1.5.", expect: { name: "speed_limit", write: "number" } },
        { title: "Its value", code: "speed_limit:1.2", note: "Your device keeps sending it, as any value.", expect: { name: "speed_limit", type: "number" } },
        { title: "You move the slider", from: "page", code: "speed_limit:1.5", note: "The page sends the line your device would send, without a time: it asks 1.5. Resent every 250 ms for 2 s until it comes back.", expect: { name: "speed_limit", input: "1.5" } },
        { title: "Applied", code: "speed_limit:1.5", note: "Your device applies it and sends its value: the page sees it applied.", expect: { name: "speed_limit", type: "number" } },
      ], more: [
        { title: "A text", code: "ATTR|drive_mode|write=text", note: "The page may change it…", expect: { name: "drive_mode", write: "text" } },
        { title: "Among choices", code: "drive_mode:auto#follows the line,manual,idle|enum", note: "…to one of these: a click on its value opens them.", expect: { name: "drive_mode", enum: ["auto", "manual", "idle"] } },
        { title: "Its value", code: "drive_mode:auto|t", cycle: ["drive_mode:manual|t", "drive_mode:idle|t"], note: "The choice that is applied.", expect: { name: "drive_mode", type: "text", text: "auto" } },
        { title: "You pick one", from: "page", code: "drive_mode:manual", note: "The text alone; in it, % and line breaks are written %XX.", expect: { name: "drive_mode", input: "manual" } },
        { title: "A switch", code: "ATTR|motors|write=bool", note: "On or off.", expect: { name: "motors", write: "bool" } },
        { title: "You switch it on", from: "page", code: "motors:1", note: "1 for on, 0 for off.", expect: { name: "motors", input: "1" } },
        { title: "Refused", code: "ACK|drive_mode:err:motors off", cycle: ["ACK|drive_mode:err:not in manual"], note: "Your device says why it did not apply it.", expect: { name: "drive_mode" } },
      ],
      notes: [
          "With commands on (CMD, in the top menu) the value is edited where it is displayed.",
          "The page resends every 250 ms for 2 s. It is applied when your device sends it back; not applied when your device keeps another value; refused on err; no answer when nothing comes back.",
          "Commands go back the way the data came: to the sender of the UDP packets (through the server), or on the serial port.",
          "What the page sends is logged in the telemetry commands.sent.",
      ] },
    { id: "actions", family: "control", title: "Buttons", sub: "functions of your device", picture: "actions",
      format: ["ATTR|name|action[|title=…|confirm|longpress|color=…|desc=…]", "ATTR|name|arg=argument|type=…[|optional|default=…|min|max|step|unit|enum|desc]", "!name#id[:argument=value:…]    (what the page sends)", "ACK|name#id:run | ok[:result] | err:why"],
      fields: [
          ["action", "A button. action= removes it."],
          ["title=", "The text of the button (else the name)."],
          ["confirm", "It asks before calling."],
          ["longpress", "It must be held 1 s."],
          ["color=", "The color of the button."],
          ["arg=argument", "One line per argument, in order: the button opens a form. type= (number, bool, text, xy, xyz, pose2d), optional, default=, min=, max=, step=, unit=, enum= (the texts it can take, separated by commas), desc=. type= empty removes the argument."],
          ["!name#id", "The call: an id that grows, then the arguments by name; several numbers are separated by commas (target=1.5,2)."],
          ["run, ok, err", "Your answer: started, done (with a short result), failed."],
      ],
      examples: [
        { title: "A button", code: "ATTR|reset|action|title=Reset odometry|confirm", note: "It asks first.", expect: { name: "reset", action: true } },
        { title: "You press it", from: "page", code: "!reset#12", note: "The page calls it: ! the name, # the number of this call.", expect: { name: "reset", call: 12, args: {} } },
        { title: "Your answer", code: "ACK|reset#12:ok", cycle: ["ACK|reset#13:ok", "ACK|reset#14:err:not now"], note: "Done: the answer to the call #12.", expect: { name: "reset", answer: "#12 ok" } },
      ], more: [
        { title: "Another action", code: "ATTR|goto|action|title=Go to", note: "A button Go to…", expect: { name: "goto", action: true } },
        { title: "Its argument", code: "ATTR|goto|arg=target|type=xy|desc=Where to go", note: "…which opens a form.", expect: { name: "goto", args: ["target"] } },
        { title: "You fill it and press", from: "page", code: "!goto#13:target=1.5,2", note: "The arguments by name; the numbers of an xy are separated by a comma.", expect: { name: "goto", call: 13, args: { target: "1.5, 2" } } },
        { title: "Started, then done", code: "ACK|goto#13:run", cycle: ["ACK|goto#13:ok:arrived"], note: "run when it starts, then ok: the page shows how long it ran.", expect: { name: "goto", answer: "#13 run" } },
      ],
      notes: [
          "The page resends a call every 250 ms for 2 s until it is answered: remember the last ids and answer again without running one twice.",
          "In the texts of a call, % : , = | and line breaks are written %XX.",
          "Answers are log lines of the action: a timeline shows its calls.",
      ] },
    { id: "joystick", family: "control", title: "A joystick", sub: "drive it", picture: "joystick",
      format: ["ATTR|name|write=type|rate=per second|hold=ms[|axes=…|min=…|max=…]", "DASH|dashboard/view:joystick:name[|orientation=vertical][|keyboard=arrows]", "ACK|name:err:why    (your device cannot apply it)"],
      fields: [
          ["write=pose2d", "The velocities of a robot (forward x, sideways y, turn yaw): a pad and a rotation rocker."],
          ["axes=x,yaw", "A base that cannot go sideways: one stick, up to go forward, left to turn left. axes= says what moves among x, y, yaw."],
          ["write=xy", "A pad: right for +x, up for +y (a camera head, a gimbal)."],
          ["write=number", "A rocker that springs back (a lift, a gripper): right for +."],
          ["rate=", "While it is held, the page sends the value that many times per second."],
          ["hold=", "Your device stops by itself when nothing came for that long (ms): the safety is on the device."],
          ["min= max=", "The values at the ends of the pad or the rocker."],
          ["orientation=", "Option of the view: the rocker of a number horizontal (default) or vertical (up for +)."],
          ["keyboard=", "Option of the view: off (default), arrows or wasd: drive it with the keyboard while the view has the focus."],
          ["ACK|name:err:why", "Answered to each value your device cannot apply now (another mode, motors off), instead of applying it: the joystick says why, in red, while it keeps coming. Zeros (released) should always be fine."],
      ],
      examples: [
        { title: "The joystick", picture: "joy-stick", code: "ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200", note: "Forward and turn, 20 times per second: one stick.", expect: { name: "cmd_vel", write: "pose2d", view: "joystick" } },
        { title: "You hold the pad", from: "page", code: "cmd_vel:0.3:0:0.2", note: "Forward speed, sideways (0: no y axis), turn: 20 times per second while held, then 0:0:0 a few times when released.", expect: { name: "cmd_vel", input: "0.3, 0, 0.2" } },
        { title: "What it applies", code: "cmd_vel:0.3:0:0.2|xyz", note: "Shown on the pad. Send again: it moves.", expect: { name: "cmd_vel", type: "3d" } },
        { title: "Refused", optional: true, code: "ACK|cmd_vel:err:not in manual mode", cycle: ["ACK|cmd_vel:err:motors off"], note: "What it answers instead when it cannot apply it: shown in red under the pad (with commands on) while it keeps coming.", expect: { name: "cmd_vel" } },
      ], more: [
        { title: "A pad and a rotation", picture: "joy-padrocker", code: "ATTR|base_vel|write=pose2d|rate=20|hold=200|min=-1|max=1", note: "A robot that can also go sideways: the pad moves it, the rocker turns it.", expect: { name: "base_vel", write: "pose2d", view: "joystick" } },
        { title: "Its velocities", code: "base_vel:0.2:0.1:0.3|xyz", note: "Forward, sideways, turn: shown on the pad and the rocker.", expect: { name: "base_vel", type: "3d" } },
        { title: "A pad", picture: "joy-pad", code: "ATTR|gimbal|write=xy|rate=10|hold=300|min=-1|max=1", note: "Two axes, x and y: a camera head.", expect: { name: "gimbal", write: "xy", view: "joystick" } },
        { title: "Where it is", code: "gimbal:0.2:-0.4|xy", note: "Shown on the pad.", expect: { name: "gimbal", type: "2d" } },
        { title: "A rocker", picture: "joy-rocker", code: "ATTR|lift|write=number|rate=10|hold=300|min=-1|max=1", note: "One axis that springs back: a lift.", expect: { name: "lift", write: "number", view: "joystick" } },
        { title: "Its speed", code: "lift:0.5", note: "Shown on the rocker.", expect: { name: "lift", type: "number" } },
        { title: "Upright", picture: "joy-vrocker", code: "DASH|Robot/Lift:joystick:lift|orientation=vertical", note: "The same rocker standing: up for +.", expect: { dashboard: "Robot" } },
        { title: "With the keyboard", code: "DASH|Robot/Drive:joystick:cmd_vel|keyboard=arrows", note: "Click the view, then the arrows drive it.", expect: { dashboard: "Robot" } },
      ],
      notes: [
          "Released, the pad sends the rest value (0) a few times, then nothing. Hidden page, lost focus or CMD off: it stops too.",
          "Joystick view options: keyboard (off, arrows, wasd), orientation of the rocker.",
      ] },
    { id: "pose", family: "control", title: "A pose on the map", sub: "move it, turn it", picture: "pose",
      format: ["ATTR|name|write=pose2d", "name:x:y:angle|xyz"],
      fields: [
          ["write=pose2d", "x, y and an angle in radians, drawn as a pose on a 2D view."],
          ["write=xy", "A point only: it can be moved, not turned."],
          ["name:x:y:angle|xyz", "The pose your device has (and what the page sends: name:x:y:angle)."],
      ],
      examples: [
        { title: "A pose to set", code: "ATTR|target|write=pose2d", note: "A map.", expect: { name: "target", write: "pose2d" } },
        { title: "The pose it has", code: "target:1.2:0.8:0.5|xyz", note: "x, y, angle. Send again: it moves.", expect: { name: "target", type: "3d" } },
        { title: "You move it and Send", from: "page", code: "target:1.5:1:0.8", note: "x, y and the angle you gave it.", expect: { name: "target", input: "1.5, 1, 0.8" } },
        { title: "Applied", code: "target:1.5:1:0.8|xyz", note: "Your device takes it and sends its pose.", expect: { name: "target", type: "3d" } },
      ],
      notes: [
          "With commands on, drag its ghost to move it and its handle to turn it, then Send (or Enter); Esc cancels.",
      ] },
    { id: "telemetries", family: "page", title: "Your telemetries", sub: "find them, drag them", picture: "telemetries", keys: ["T"], action: "telemetries", actionLabel: "Open the Telemetries panel",
      notes: ["The Telemetries panel lists what was received, with its rate.", "Drag a telemetry (or the card of a label) onto a view to add it, or between views to make a new one."] },
    { id: "edit", family: "page", title: "Arrange", sub: "Edit mode", picture: "edit", keys: ["E", "Esc"], action: "edit", actionLabel: "Edit this dashboard",
      notes: ["Press E (or Edit): drag views by their handle, resize them.", "Add views and layouts with +; change their options in the panel on the right.", "Esc leaves."] },
    { id: "zoom", family: "page", title: "Zoom and compare", sub: "a moment, a time range", picture: "zoom", keys: ["Esc"],
      notes: ["Drag across a chart or a timeline: every view of the dashboard shows that range.", "The cursor shows the same moment everywhere, 3D scenes and pictures included.", "Double click (or Esc) goes back to live.", "Time groups (Edit mode) keep some views apart."] },
    { id: "files", family: "page", title: "Save and open", sub: "export, import", picture: "files", keys: ["X"], action: "export", actionLabel: "Open Export and import",
      notes: ["Export data, dashboards or both: a binary file, lines of text or CSV, all of it or a time range.", "Drop a file on the page to open it."] },
    { id: "memory", family: "page", title: "Keep more or less", sub: "data window, memory", picture: "memory", keys: ["Space"], action: "rate", actionLabel: "Open the data menu",
      notes: ["The rate in the top menu opens the data menu: how long data is kept (5 minutes by default), how much memory it may take, what happens when it is full.", "Space pauses: data that comes meanwhile is ignored."] },
    { id: "serial", family: "page", title: "A serial port", sub: "no server needed", picture: "serial", keys: ["S"], action: "sources", actionLabel: "Open Sources",
      notes: ["Sources, Add a source, Serial port (Chrome, Edge).", "Lines starting with > are telemetry, the others a log of the port.", "Its console sends text back."] },
    { id: "cmd", family: "page", title: "Commands on", sub: "the CMD button", picture: "cmd", keys: ["C"], action: "cmd", actionLabel: "Switch commands on or off",
      notes: ["Shown in the top menu when a device declares settings or actions.", "Off at every start: nothing is sent and no control is drawn, so a screen on a wall stays a screen.", "C switches it."] },
];

// The messages a device sends (those the panel can send). Examples `from: "page"` are what the page sends to the device (commands): they
// are shown, in their place in the conversation, and never sent by the panel.
const HELP_EXAMPLES = HELP_TILES.flatMap((tile) => [...(tile.examples || []), ...(tile.more || [])]).filter((e) => e.from != "page");

// How Teleplot works: a schematic and a few paragraphs each
const HELP_CONCEPTS = [
    { id: "flow", title: "From your device to this page", sub: "and back", schema: "flow", text: [
        "Your device sends lines of text (or binary packets) over UDP, to port 47269 of the computer that runs the Teleplot server. The server passes them on to this page, which can be on another computer. A device on a serial port talks to the page directly (Chrome, Edge): no server.",
        "The page keeps what it receives for a while (the data window, 5 minutes by default) and draws it: nothing is sent anywhere else. Files are the same lines, saved.",
        "Commands go the other way, only when you switch them on (CMD): the server sends them back to where the packets came from." ] },
    { id: "telemetry", title: "A telemetry", sub: "a name, samples, what it is", schema: "telemetry", text: [
        "Everything that has a name is a telemetry: a temperature, a mode, a position, a shape, a picture. Each message adds a sample to it: a time and a value.",
        "What it is (a number, a text, a position, a shape...) comes from the message: the flags (|t, |xy...) and the prefixes (2D|, 3D|, PNG|). What does not change is said once and kept: its unit, its label, its range, its thresholds, whether the page may change it." ] },
    { id: "time", title: "Time", sub: "what a view shows", schema: "time", text: [
        "A sample is dated when it arrives, unless the message gives its own time. A time since the boot of a board (before 1973) is dated by the page: the spacing the board measured, placed when it arrives. Views show live data, or, while you zoom or point at a moment, that moment.",
        "Teleplot never invents data: at a given time a view shows the last sample at or before it, never a value between two samples. A state lasts until the next different one; a log line is an instant.",
        "The views of a dashboard share their time: zoom on a chart, and the timeline, the map and the pictures show the same range. Time groups (Edit mode) keep views apart." ] },
    { id: "views", title: "Views and dashboards", sub: "what draws what", schema: "views", text: [
        "A view draws one or more telemetries: a chart, values, a log, a timeline, a map (2D), a 3D scene, a picture, a joystick. A dashboard is a grid of views, in rows, columns and stacks.",
        "The Live dashboard builds itself: each new telemetry gets the view that suits it, and telemetries with the same label share one. Your own dashboards are arranged in Edit mode, or described by your device with DASH| lines." ] },
    { id: "space", title: "Space and frames", sub: "where things are", schema: "axes", text: [
        "Positions are in your units, x forward, y to the left, z up. 2D is 3D seen from above: a 2D| line is a 3D| line with z = 0, and the same shapes show in both views.",
        "A frame makes positions relative to another telemetry: the wheels of a robot are described in the frame of its body, and follow it. The pixels of a picture are a frame too." ] },
    { id: "commands", title: "Commands", sub: "the page asks, the device decides", schema: "commands", text: [
        "A device declares what the page may change (settings) and call (actions). The page sends the line the device would send; the device applies it, or not, and keeps sending its value: what comes back is what is true.",
        "Nothing is sent while commands are off (CMD), while data is paused, or to data read from a file." ] },
];

// Pictures of the tiles and schematics of the concepts: SVG, colored by the variables of .help-layout (theme aware)
const helpSvg = (W, H, content) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-hidden="true"><defs><marker id="hp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--hp-muted)"/></marker></defs>${content}</svg>`;
// A text of a picture: 10 units high in the color of the text, unless `attributes` say otherwise
const helpSvgText = (x, y, text, attributes = "") => `<text x="${x}" y="${y}" ${/font-size/.test(attributes) ? "" : 'font-size="10"'} ${/fill=/.test(attributes) ? "" : 'fill="var(--hp-text)"'} ${attributes}>${text}</text>`;
function helpPicture(kind, W = 240, H = 100) {
    if (kind.startsWith("joy-") && W == 240) W = 140; // (a shape of a joystick view, on a card: round, it needs no wide frame)
    const grid = `<g stroke="var(--hp-grid)">${[0.25, 0.5, 0.75].map((f) => `<line x1="0" y1="${H * f}" x2="${W}" y2="${H * f}"/>`).join("")}</g>`;
    const curve = (f, color, width = 2) => { const p = []; for (let i = 0; i <= 40; i++) p.push(`${(i / 40 * W).toFixed(1)},${(H / 2 - f(i) * H * 0.3).toFixed(1)}`); return `<polyline points="${p.join(" ")}" fill="none" stroke="${color}" stroke-width="${width}"/>`; };
    const t = helpSvgText;
    let s = "";
    if (kind == "chart") s = grid + curve((i) => Math.sin(i / 5), "var(--hp-1)");
    else if (kind == "chart2") s = grid + curve((i) => Math.sin(i / 5), "var(--hp-1)") + curve((i) => Math.sin(i / 5 + 0.6) * 0.8 - 0.1, "var(--hp-4)", 1.5) + `<rect x="${W - 74}" y="4" width="70" height="14" rx="7" fill="var(--hp-bg)"/>` + t(W - 68, 14, "motors", 'font-size="9" fill="var(--hp-muted)"');
    else if (kind == "gauge") {
        s = t(10, H * 0.38, "battery", 'fill="var(--hp-muted)"') + `<text x="${W - 30}" y="${H * 0.42}" font-size="24" font-weight="700" text-anchor="end" fill="var(--hp-text)">10.2</text>` + t(W - 26, H * 0.42, "V", 'fill="var(--hp-muted)"')
            + `<rect x="${W - 62}" y="${H * 0.5}" width="52" height="14" rx="7" fill="var(--hp-warn)"/>` + t(W - 36, H * 0.5 + 10.5, "low", 'font-size="9" text-anchor="middle" fill="#fff"')
            + `<rect x="10" y="${H * 0.78}" width="${W - 20}" height="6" rx="3" fill="var(--hp-grid)"/><rect x="10" y="${H * 0.78}" width="${(W - 20) * 0.33}" height="6" rx="3" fill="var(--hp-warn)"/>`
            + [0.24, 0.42].map((f) => `<rect x="${10 + (W - 20) * f}" y="${H * 0.78 - 3}" width="2" height="12" fill="var(--hp-muted)"/>`).join("");
    }
    else if (kind == "text") s = t(10, H * 0.5, "mode", 'fill="var(--hp-muted)"') + `<text x="${W - 10}" y="${H * 0.55}" font-size="22" font-weight="700" text-anchor="end" fill="var(--hp-text)">driving</text>`;
    else if (kind == "log") s = ["12:00:01  Path clear", "12:00:03  [WARN] motor current 1.9 A", "12:00:04  Turning left", "12:00:06  Battery 24.8 V"].map((line, i) => `<text x="8" y="${20 + i * 20}" font-size="10" font-family="ui-monospace, monospace" fill="${/WARN/.test(line) ? "var(--hp-warn)" : "var(--hp-text)"}">${line}</text>`).join("");
    else if (kind == "timeline") {
        s = [[0, 0.3, "--hp-1", "idle"], [0.31, 0.62, "--hp-2", "driving"], [0.63, 0.75, "--hp-5", "error"], [0.76, 1, "--hp-2", "driving"]].map(([a, b, c, text]) => `<rect x="${a * W}" y="${H * 0.18}" width="${(b - a) * W}" height="${H * 0.28}" fill="var(${c})" opacity="0.45"/>` + t(a * W + 4, H * 0.36, text, 'font-size="9"')).join("")
            + [0.1, 0.35, 0.5, 0.66, 0.9].map((x) => `<rect x="${x * W}" y="${H * 0.6}" width="1.5" height="${H * 0.24}" fill="var(--hp-muted)"/>`).join("");
    }
    else if (kind == "marks") s = grid + curve((i) => Math.sin(i / 6), "var(--hp-1)") + [[0.3, "turning"], [0.62, "forward"]].map(([x, text]) => `<line x1="${x * W}" y1="4" x2="${x * W}" y2="${H}" stroke="var(--hp-3)" stroke-dasharray="3 2"/>` + t(x * W + 3, 13, text, 'font-size="9" fill="var(--hp-3)"')).join("");
    else if (kind == "stack") s = [[0, 1, 0.08, "loop"], [0.04, 0.46, 0.36, "plan"], [0.5, 0.92, 0.36, "act"], [0.08, 0.3, 0.64, "search"]].map(([a, b, y, text], i) => `<rect x="${a * W}" y="${H * y}" width="${(b - a) * W}" height="${H * 0.24}" fill="var(--hp-${i + 1})" opacity="0.45"/>` + t(a * W + 4, H * y + 15, text, 'font-size="9"')).join("");
    else if (kind == "statemachine") { // States in boxes, the current one in blue, the transition it came by in bold
        const node = (x, y, w, text, on) => `<rect x="${x}" y="${y}" width="${w}" height="16" rx="4" fill="${on ? "var(--hp-1)" : "none"}" fill-opacity="${on ? 0.35 : 1}" stroke="${on ? "var(--hp-1)" : "var(--hp-muted)"}" stroke-width="${on ? 1.6 : 1}"/>` + t(x + w / 2, y + 11.5, text, 'font-size="9" text-anchor="middle"' + (on ? ' font-weight="700"' : ""));
        s = `<rect x="${W * 0.36}" y="${H * 0.1}" width="${W * 0.3}" height="${H * 0.8}" rx="7" fill="none" stroke="var(--hp-1)" stroke-width="1.4"/>` + t(W * 0.36 + 4, H * 0.1 + 10, "mission", 'font-size="8" fill="var(--hp-1)" font-weight="700"')
            + node(6, H * 0.42, W * 0.22, "idle") + node(W * 0.4, H * 0.3, W * 0.22, "goto") + node(W * 0.4, H * 0.62, W * 0.22, "grasp", true) + node(W * 0.74, H * 0.42, W * 0.22, "error")
            + `<path d="M${6 + W * 0.22} ${H * 0.42 + 8} L${W * 0.36} ${H * 0.42 + 8}" stroke="var(--hp-muted)"/><path d="M${W * 0.51} ${H * 0.3 + 16} L${W * 0.51} ${H * 0.62}" stroke="var(--hp-1)" stroke-width="2"/><path d="M${W * 0.66} ${H * 0.5} L${W * 0.74} ${H * 0.5}" stroke="var(--hp-muted)"/>`;
    }
    else if (kind == "behaviortree") { // A tree: the running path in blue, a failure in red
        const node = (x, y, text, color) => `<rect x="${x - 22}" y="${y}" width="44" height="14" rx="4" fill="${color || "none"}" fill-opacity="0.35" stroke="${color || "var(--hp-muted)"}" stroke-width="${color ? 1.5 : 1}"/>` + t(x, y + 10.5, text, 'font-size="8.5" text-anchor="middle"');
        const link = (x1, y1, x2, y2, color) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color || "var(--hp-muted)"}" stroke-width="${color ? 1.8 : 1}"/>`;
        s = link(W / 2, 18, W * 0.3, H * 0.42) + link(W / 2, 18, W * 0.72, H * 0.42, "var(--hp-1)") + link(W * 0.3, H * 0.42 + 14, W * 0.17, H * 0.72) + link(W * 0.3, H * 0.42 + 14, W * 0.43, H * 0.72)
            + node(W / 2, 4, "root", "var(--hp-1)") + node(W * 0.3, H * 0.42, "patrol", "var(--hp-5)") + node(W * 0.72, H * 0.42, "dock", "var(--hp-1)") + node(W * 0.17, H * 0.72, "check", "var(--hp-5)") + node(W * 0.43, H * 0.72, "goto");
    }
    else if (kind == "xy") { const p = []; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; p.push(`${(W / 2 + Math.sin(a * 2) * W * 0.3).toFixed(1)},${(H / 2 + Math.sin(a * 3) * H * 0.32).toFixed(1)}`); } s = grid + `<polyline points="${p.join(" ")}" fill="none" stroke="var(--hp-3)" stroke-width="1.5"/><circle cx="${W / 2}" cy="${H / 2}" r="4" fill="var(--hp-3)"/>`; }
    else if (kind == "map" || kind == "pose") {
        const p = []; for (let i = 0; i < 30; i++) p.push(`${W * 0.2 + i * 3},${(H * 0.7 - Math.sin(i / 6) * 20).toFixed(1)}`);
        const x = W * 0.2 + 90, y = H * 0.7 - Math.sin(29 / 6) * 20;
        s = `<rect x="${W * 0.08}" y="${H * 0.1}" width="${W * 0.84}" height="${H * 0.8}" fill="none" stroke="var(--hp-2)" stroke-width="2"/>` + (kind == "map" ? `<polyline points="${p.join(" ")}" fill="none" stroke="var(--hp-1)" stroke-width="1.5" opacity="0.7"/>` : "")
            + `<g transform="translate(${x},${y}) rotate(-20)"><rect x="-10" y="-7" width="20" height="14" rx="2" fill="var(--hp-1)"/><path d="M10 0 h8" stroke="var(--hp-text)" stroke-width="2"/></g>`;
        if (kind == "pose") s += `<g transform="translate(${x - 70},${y - 28}) rotate(15)" opacity="0.55"><rect x="-10" y="-7" width="20" height="14" rx="2" fill="none" stroke="var(--hp-1)" stroke-width="2" stroke-dasharray="3 2"/><path d="M10 0 h8" stroke="var(--hp-1)" stroke-width="2"/></g><circle cx="${x - 50}" cy="${y - 23}" r="4" fill="var(--hp-1)"/>`;
    }
    else if (kind == "3d") s = `<path d="M${W * 0.12} ${H * 0.72} L${W * 0.5} ${H * 0.45} L${W * 0.88} ${H * 0.64} L${W * 0.5} ${H * 0.94} Z" fill="var(--hp-grid)" stroke="var(--hp-2)"/>`
        + `<path d="M${W * 0.44} ${H * 0.64} l16 -9 l16 7 l-16 9 z" fill="var(--hp-4)"/><path d="M${W * 0.44} ${H * 0.64} v-18 l16 -9 v18 z M${W * 0.44 + 16} ${H * 0.64 + 7} v-18 l16 -7 v18z" fill="var(--hp-4)" opacity="0.7"/><circle cx="${W * 0.68}" cy="${H * 0.5}" r="9" fill="var(--hp-5)" opacity="0.8"/>`;
    else if (kind == "mesh") { // A pawn made of facets, lit from the left
        const cx = W / 2, base = H * 0.92, h = H * 0.84;
        const profile = [[0.36, 0], [0.36, 0.06], [0.3, 0.12], [0.22, 0.18], [0.15, 0.3], [0.12, 0.5], [0.12, 0.6], [0.2, 0.63], [0.12, 0.68], [0.15, 0.74], [0.16, 0.84], [0.14, 0.92], [0.08, 0.98], [0, 1]];
        const k = H * 1.1;
        for (let i = 0; i + 1 < profile.length; i++) {
            const [r0, z0] = profile[i], [r1, z1] = profile[i + 1];
            for (let j = -3; j < 3; j++) { // Facets of a band: narrower and darker towards the edges
                const x = (r, a) => (cx + r * k * Math.sin(a)).toFixed(1), a0 = j / 3 * Math.PI / 2, a1 = (j + 1) / 3 * Math.PI / 2;
                const light = 70 - Math.abs(j + 0.5 + 1) * 9;
                s += `<path d="M${x(r0, a0)} ${(base - z0 * h).toFixed(1)} L${x(r0, a1)} ${(base - z0 * h).toFixed(1)} L${x(r1, a1)} ${(base - z1 * h).toFixed(1)} L${x(r1, a0)} ${(base - z1 * h).toFixed(1)}Z" fill="hsl(28 80% ${light}%)" stroke="hsl(28 60% 35%)" stroke-width="0.5"/>`;
            }
        }
        s = `<path d="M${W * 0.12} ${H * 0.97} L${W * 0.88} ${H * 0.97}" stroke="var(--hp-2)"/>` + s + t(8, 14, "pawn.stl", 'font-size="9" fill="var(--hp-muted)"');
    }
    else if (kind == "texture") { // A floor plan on a map, with a picture in its own place
        const x0 = W * 0.1, y0 = H * 0.08, w = W * 0.62, h = H * 0.84, wall = "var(--hp-text)";
        s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="var(--hp-grid)" stroke="${wall}" stroke-width="3"/>`
            + `<path d="M${x0 + w * 0.6} ${y0} v${h * 0.4} M${x0 + w * 0.6} ${y0 + h * 0.6} v${h * 0.4} M${x0 + w * 0.6} ${y0 + h * 0.5} h${w * 0.15} M${x0 + w * 0.88} ${y0 + h * 0.5} h${w * 0.12}" stroke="${wall}" stroke-width="2"/>`
            + `<rect x="${x0 + w * 0.15}" y="${y0 + h * 0.3}" width="${w * 0.25}" height="${h * 0.35}" fill="#c4a070"/><rect x="${x0 + w * 0.68}" y="${y0 + h * 0.08}" width="${w * 0.26}" height="${h * 0.12}" fill="#96be8c"/>`
            + `<g transform="translate(${x0 + w * 0.45},${y0 + h * 0.8}) rotate(-25)"><rect x="-9" y="-6" width="18" height="12" rx="2" fill="var(--hp-1)"/></g>`
            + `<defs><linearGradient id="hp-sky-texture" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa3b3"/><stop offset="0.5" stop-color="#c9d1d8"/><stop offset="0.52" stop-color="#6d747b"/><stop offset="1" stop-color="#4c5156"/></linearGradient></defs>`
            + `<rect x="${W * 0.66}" y="${H * 0.5}" width="${W * 0.3}" height="${H * 0.42}" fill="url(#hp-sky-texture)" stroke="var(--hp-4)" stroke-width="2"/><path d="M${W * 0.79} ${H * 0.84} l${W * 0.025} -${H * 0.2} l${W * 0.025} ${H * 0.2} z" fill="#e67e22"/>`;
    }
    else if (kind == "describe") { // A teal curve and its value in liters, with its description as a tooltip
        s = grid + curve((i) => Math.sin(i / 7) * 0.6 + 0.2, "teal", 2.5) + `<rect x="${W - 92}" y="6" width="86" height="18" rx="9" fill="var(--hp-bg)"/>`
            + `<circle cx="${W - 82}" cy="15" r="4" fill="teal"/>` + t(W - 74, 19, "tank 42.5", 'font-size="10" font-weight="700"') + t(W - 24, 19, "L", 'font-size="9" fill="var(--hp-muted)"')
            + `<rect x="8" y="${H - 26}" width="150" height="18" rx="4" fill="var(--hp-bg)" stroke="var(--hp-grid)"/>` + t(14, H - 13, "Water left in the tank", 'font-size="9" fill="var(--hp-muted)"');
    }
    else if (kind == "frames") s = `<g transform="translate(${W * 0.45},${H * 0.55}) rotate(-15)"><rect x="-32" y="-15" width="64" height="30" rx="4" fill="var(--hp-1)" opacity="0.85"/>${[[-26, -21], [12, -21], [-26, 15], [12, 15]].map(([x, y]) => `<rect x="${x}" y="${y}" width="14" height="6" rx="2" fill="var(--hp-text)"/>`).join("")}<path d="M32 0 h24" stroke="var(--hp-4)" stroke-width="2"/><path d="M56 0 l-7 -4 v8z" fill="var(--hp-4)"/></g>` + t(6, H - 6, "wheels and arrow: in the frame of the body", 'font-size="9" fill="var(--hp-muted)"');
    else if (kind == "cloud") { for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, r = 22 + (i % 7) * 2 + Math.abs(Math.cos(a * 2)) * 12; s += `<circle cx="${(W / 2 + Math.cos(a) * r * 1.7).toFixed(1)}" cy="${(H / 2 + Math.sin(a) * r * 0.9).toFixed(1)}" r="1.3" fill="hsl(${i * 3} 70% 55%)"/>`; } s += `<circle cx="${W / 2}" cy="${H / 2}" r="4" fill="var(--hp-text)"/>`; }
    else if (kind == "depth") { // A depth map in colors: far at the top, the ground coming closer, a box, and its color scale
        const turbo = ["#30123b", "#4686fb", "#1ae4b6", "#a2fc3c", "#fabb39", "#e4460a", "#7a0403"];
        s = `<defs><linearGradient id="hp-depth" x1="0" y1="1" x2="0" y2="0">${turbo.map((c, i) => `<stop offset="${i / 6}" stop-color="${c}"/>`).join("")}</linearGradient>`
            + `<linearGradient id="hp-depth-bar" x1="0" y1="0" x2="1" y2="0">${turbo.map((c, i) => `<stop offset="${i / 6}" stop-color="${c}"/>`).join("")}</linearGradient></defs>`
            + `<rect width="${W}" height="${H}" fill="url(#hp-depth)"/><rect x="${W * 0.55}" y="${H * 0.3}" width="${W * 0.22}" height="${H * 0.45}" fill="#4686fb"/>`
            + `<rect x="${W - 84}" y="${H - 16}" width="78" height="11" rx="5" fill="var(--hp-bg)"/><rect x="${W - 64}" y="${H - 13}" width="38" height="5" rx="2" fill="url(#hp-depth-bar)"/>`
            + t(W - 80, H - 7.5, "0.5", 'font-size="7"') + t(W - 24, H - 7.5, "4 m", 'font-size="7"')
            + `<rect x="${W * 0.2}" y="${H * 0.18}" width="54" height="13" rx="3" fill="var(--hp-bg)"/>` + t(W * 0.2 + 4, H * 0.18 + 9.5, "1.50 m (5, 3)", 'font-size="7.5"');
    }
    else if (kind == "image" || kind == "pixels" || kind == "camera") {
        s = `<defs><linearGradient id="hp-sky-${kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa3b3"/><stop offset="0.5" stop-color="#c9d1d8"/><stop offset="0.52" stop-color="#6d747b"/><stop offset="1" stop-color="#4c5156"/></linearGradient></defs>`
            + `<rect width="${W}" height="${H}" fill="url(#hp-sky-${kind})"/><path d="M${W * 0.44} ${H * 0.7} l${W * 0.05} -${H * 0.36} l${W * 0.05} ${H * 0.36} z" fill="#e67e22"/>`;
        if (kind == "pixels") s += `<rect x="${W * 0.4}" y="${H * 0.28}" width="${W * 0.18}" height="${H * 0.48}" fill="rgba(231,76,60,0.25)" stroke="#e74c3c" stroke-width="2"/><text x="${W * 0.4}" y="${H * 0.24}" font-size="10" fill="#e74c3c">cone 0.92</text>`;
        if (kind == "camera") s += `<path d="M0 ${H} L${W * 0.36} ${H * 0.52} M${W} ${H} L${W * 0.64} ${H * 0.52}" stroke="#2ecc71" stroke-width="2"/><path d="M${W * 0.36} ${H * 0.52} Q${W / 2} ${H * 0.49} ${W * 0.64} ${H * 0.52}" fill="none" stroke="#2ecc71" stroke-width="2" stroke-dasharray="3 2"/>`;
    }
    else if (kind == "dashboard" || kind == "edit") {
        s = [[0, 0, 2, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 2, 1]].map(([x, y, w, h], i) => `<rect x="${4 + x * W / 3}" y="${4 + y * H / 2}" width="${w * W / 3 - 8}" height="${h * H / 2 - 8}" rx="3" fill="var(--hp-grid)" stroke="var(--hp-${i + 1})"/>`).join("");
        if (kind == "edit") s += `<rect x="4" y="4" width="${2 * W / 3 - 8}" height="${H / 2 - 8}" rx="3" fill="none" stroke="var(--hp-4)" stroke-width="2" stroke-dasharray="4 2"/><circle cx="${2 * W / 3 - 4}" cy="${H / 2 - 4}" r="4" fill="var(--hp-4)"/>` + t(W / 3, H / 4 + 4, "drag · resize", 'text-anchor="middle" fill="var(--hp-4)"');
    }
    else if (kind == "place") s = `<rect x="4" y="4" width="${W - 8}" height="16" rx="3" fill="var(--hp-grid)"/>` + t(10, 15.5, "Robot  ▸  Motion", 'font-size="9"') + [[4, 0.6], [W * 0.62, 0.36]].map(([x, f], i) => `<rect x="${x}" y="26" width="${W * f}" height="${H - 30}" rx="3" fill="var(--hp-grid)" stroke="var(--hp-${i + 1})"/>`).join("");
    else if (kind == "controls") s = t(10, 20, "speed_limit ✎", 'fill="var(--hp-muted)"') + `<text x="${W - 10}" y="20" font-size="14" font-weight="700" text-anchor="end" fill="var(--hp-text)">1.20</text>`
        + `<rect x="10" y="32" width="${W - 20}" height="6" rx="3" fill="var(--hp-grid)"/><rect x="10" y="32" width="${(W - 20) * 0.6}" height="6" rx="3" fill="var(--hp-2)"/><path d="M${10 + (W - 20) * 0.75 - 5} 23 h10 l-5 7z" fill="var(--hp-1)"/>`
        + t(10, 66, "mode ✎", 'fill="var(--hp-muted)"') + `<text x="${W - 10}" y="66" font-size="13" font-weight="700" text-anchor="end" fill="var(--hp-text)">auto ▾</text>`;
    else if (kind == "actions") s = t(10, 24, "reset", 'fill="var(--hp-muted)"') + `<rect x="${W - 120}" y="10" width="110" height="22" rx="5" fill="var(--hp-bg)" stroke="var(--hp-line)"/>` + t(W - 65, 25, "Reset odometry", 'text-anchor="middle" font-size="9"')
        + `<circle cx="${W - 134}" cy="21" r="7" fill="var(--hp-ok)"/>` + t(W - 134, 24.5, "✓", 'font-size="9" fill="#fff" text-anchor="middle"')
        + t(10, 60, "stop", 'fill="var(--hp-muted)"') + `<rect x="${W - 120}" y="46" width="110" height="22" rx="5" fill="var(--hp-5)"/>` + t(W - 65, 61, "■ Stop", 'text-anchor="middle" font-size="9" fill="#fff"')
        + `<rect x="10" y="${H - 18}" width="${W * 0.5}" height="12" rx="2" fill="var(--hp-ok)" opacity="0.35"/>` + t(14, H - 9, "#12 ok · 0.4 s", 'font-size="8"');
    else if (kind == "joystick") s = `<circle cx="${W / 2}" cy="${H / 2}" r="${H * 0.42}" fill="var(--hp-bg)" stroke="var(--hp-line)" stroke-width="2"/><line x1="${W / 2}" y1="${H * 0.1}" x2="${W / 2}" y2="${H * 0.9}" stroke="var(--hp-grid)"/><line x1="${W / 2 - H * 0.42}" y1="${H / 2}" x2="${W / 2 + H * 0.42}" y2="${H / 2}" stroke="var(--hp-grid)"/><circle cx="${W / 2 + 10}" cy="${H / 2 - 16}" r="${H * 0.13}" fill="var(--hp-1)"/>`;
    else if (kind.startsWith("joy-")) { // The shapes of a joystick view: pad, pad + rotation rocker, one stick, rocker, upright rocker
        const ring = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--hp-bg)" stroke="var(--hp-line)" stroke-width="2"/><line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="var(--hp-grid)"/><line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="var(--hp-grid)"/>`;
        const knob = (x, y) => `<circle cx="${x}" cy="${y}" r="${H * 0.1}" fill="var(--hp-1)"/>`;
        const track = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="var(--hp-bg)" stroke="var(--hp-line)" stroke-width="2"/>`;
        const label = (x, y, text, anchor = "middle") => t(x, y, text, 'font-size="9" text-anchor="' + anchor + '" fill="var(--hp-muted)"');
        const cx = W / 2, cy = H * 0.48, r = H * 0.38;
        if (kind == "joy-pad") s = ring(cx, cy, r) + knob(cx + r * 0.45, cy - r * 0.35) + label(cx, cy - r - 2, "+y") + label(cx + r + 6, cy + 3, "+x", "start");
        else if (kind == "joy-stick") s = ring(cx, cy, r) + knob(cx - r * 0.3, cy - r * 0.5) + label(cx, cy - r - 2, "forward") + label(cx - r - 6, cy + 3, "turn", "end") + label(cx + r + 6, cy + 3, "turn", "start");
        else if (kind == "joy-padrocker") { const pr = H * 0.3, py = H * 0.36; s = ring(cx, py, pr) + knob(cx + pr * 0.2, py - pr * 0.5) + label(cx, py - pr - 2, "forward") + label(cx - pr - 6, py + 3, "left", "end")
            + track(cx - W * 0.2, H * 0.78, W * 0.4, H * 0.14) + `<circle cx="${cx - W * 0.07}" cy="${H * 0.85}" r="${H * 0.09}" fill="var(--hp-1)"/>` + label(cx + W * 0.22, H * 0.89, "turn", "start"); } // (the rocker under the pad, as in the view)
        else if (kind == "joy-rocker") s = track(W * 0.15, cy - H * 0.08, W * 0.7, H * 0.16) + `<circle cx="${W * 0.64}" cy="${cy}" r="${H * 0.11}" fill="var(--hp-1)"/>` + label(W * 0.12, cy + 3, "−", "end") + label(W * 0.88, cy + 3, "+", "start");
        else s = track(cx - H * 0.08, H * 0.08, H * 0.16, H * 0.8) + `<circle cx="${cx}" cy="${H * 0.3}" r="${H * 0.11}" fill="var(--hp-1)"/>` + label(cx + H * 0.16, H * 0.16, "+", "start") + label(cx + H * 0.16, H * 0.88, "−", "start");
    }
    else if (kind == "telemetries") s = ["temperature", "battery", "mode", "position"].map((n, i) => `<rect x="8" y="${6 + i * 23}" width="${W * 0.55}" height="18" rx="4" fill="var(--hp-bg)" stroke="var(--hp-line)"/><circle cx="18" cy="${15 + i * 23}" r="4" fill="var(--hp-${i + 1})"/>` + t(28, 18.5 + i * 23, n, 'font-size="9"') + t(W * 0.55 - 2, 18.5 + i * 23, (50 / (i + 1)).toFixed(0) + "/s", 'font-size="8" text-anchor="end" fill="var(--hp-muted)"')).join("")
        + `<rect x="${W * 0.66}" y="${H * 0.25}" width="${W * 0.3}" height="${H * 0.6}" rx="3" fill="var(--hp-grid)" stroke="var(--hp-1)" stroke-dasharray="4 2"/><path d="M${W * 0.5} 15 C ${W * 0.62} 15, ${W * 0.7} 30, ${W * 0.78} ${H * 0.5}" fill="none" stroke="var(--hp-muted)" stroke-width="1.5" marker-end="url(#hp-arrow)"/>`;
    else if (kind == "zoom") s = grid + curve((i) => Math.sin(i / 5), "var(--hp-1)") + `<rect x="${W * 0.35}" y="2" width="${W * 0.25}" height="${H - 4}" fill="var(--hp-1)" opacity="0.18"/>` + t(W * 0.475, H - 6, "drag ↔", 'text-anchor="middle" fill="var(--hp-muted)"');
    else if (kind == "files") s = [["teleplot", 0.1], ["teleplot.txt", 0.4], ["teleplot.csv", 0.7]].map(([n, x]) => `<path d="M${x * W} ${H * 0.15} h${W * 0.16} l${W * 0.05} ${H * 0.12} v${H * 0.5} h-${W * 0.21}z" fill="var(--hp-grid)" stroke="var(--hp-line)"/>` + t(x * W, H * 0.92, "." + n, 'font-size="8" fill="var(--hp-muted)"')).join("");
    else if (kind == "memory") s = t(10, 20, "data window: 5 min", 'fill="var(--hp-muted)"') + `<rect x="10" y="32" width="${W - 20}" height="10" rx="4" fill="var(--hp-grid)"/><rect x="10" y="32" width="${(W - 20) * 0.35}" height="10" rx="4" fill="var(--hp-2)"/><rect x="${10 + (W - 20) * 0.35}" y="32" width="${(W - 20) * 0.15}" height="10" fill="var(--hp-4)"/>`
        + `<circle cx="${W - 28}" cy="${H - 26}" r="14" fill="none" stroke="var(--hp-grid)" stroke-width="5"/><circle cx="${W - 28}" cy="${H - 26}" r="14" fill="none" stroke="var(--hp-ok)" stroke-width="5" stroke-dasharray="30 88" transform="rotate(-90 ${W - 28} ${H - 26})"/>` + t(10, H - 22, "memory used", 'fill="var(--hp-muted)"');
    else if (kind == "serial") s = `<rect x="${W * 0.08}" y="${H * 0.3}" width="${W * 0.3}" height="${H * 0.4}" rx="4" fill="var(--hp-1)" opacity="0.7"/><path d="M${W * 0.38} ${H * 0.5} C ${W * 0.55} ${H * 0.5}, ${W * 0.5} ${H * 0.2}, ${W * 0.7} ${H * 0.25}" fill="none" stroke="var(--hp-muted)" stroke-width="3"/><rect x="${W * 0.7}" y="${H * 0.12}" width="${W * 0.22}" height="${H * 0.24}" rx="2" fill="var(--hp-grid)" stroke="var(--hp-line)"/>` + t(W * 0.08, H * 0.9, "&gt;temperature:24.5", 'font-size="9" font-family="ui-monospace, monospace"');
    else if (kind == "cmd") s = `<rect x="${W / 2 - 36}" y="${H / 2 - 24}" width="72" height="48" rx="10" fill="color-mix(in srgb, var(--hp-ok) 20%, transparent)" stroke="var(--hp-ok)" stroke-width="2"/><text x="${W / 2}" y="${H / 2 + 1}" font-size="14" font-weight="700" text-anchor="middle" fill="var(--hp-ok)">CMD</text><text x="${W / 2}" y="${H / 2 + 15}" font-size="9" font-weight="700" text-anchor="middle" fill="var(--hp-ok)">ON</text>`;
    else return helpSchema(kind);
    return helpSvg(W, H, s);
}

// Schematics of the concepts (wider than tall: they fill the width of the panel)
function helpSchema(kind) {
    const W = 360, H = 170;
    const box = (x, y, w, h, title, sub, color = "var(--hp-line)") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="var(--hp-bg)" stroke="${color}" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + (sub ? h / 2 - 2 : h / 2 + 4)}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--hp-text)">${title}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" font-size="9" text-anchor="middle" fill="var(--hp-muted)">${sub}</text>` : ""}`;
    const arrow = (x1, y1, x2, y2, label, o = {}) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${o.color || "var(--hp-muted)"}" stroke-width="1.5" ${o.dash ? 'stroke-dasharray="4 3"' : ""} marker-end="url(#hp-arrow)"/>${label ? `<text x="${(x1 + x2) / 2 + (o.dx || 0)}" y="${(y1 + y2) / 2 + (o.dy || -5)}" font-size="9" text-anchor="middle" fill="${o.color || "var(--hp-muted)"}">${label}</text>` : ""}`;
    const t = helpSvgText;
    let s = "";
    if (kind == "flow") {
        s = box(6, 50, 76, 46, "Your device", "sends lines", "var(--hp-1)") + box(136, 50, 76, 46, "Server", "Teleplot", "var(--hp-line)") + `<rect x="272" y="26" width="82" height="94" rx="8" fill="var(--hp-bg)" stroke="var(--hp-2)" stroke-width="1.5"/>` + t(313, 46, "This page", 'font-size="11" font-weight="700" text-anchor="middle"')
            + t(313, 68, "keeps", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"') + t(313, 84, "draws", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"') + t(313, 108, "5 min window", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"')
            + arrow(82, 66, 134, 66, "UDP 47269") + arrow(212, 66, 270, 66, "WebSocket")
            + arrow(270, 84, 214, 84, "", { dash: true, color: "var(--hp-ok)" }) + arrow(134, 84, 84, 84, "", { dash: true, color: "var(--hp-ok)" }) + t(180, 112, "commands, when CMD is on", 'font-size="9" text-anchor="middle" fill="var(--hp-ok)"')
            + `<path d="M44 96 C 44 150, 313 150, 313 122" fill="none" stroke="var(--hp-muted)" stroke-width="1.5" stroke-dasharray="1 3" marker-end="url(#hp-arrow)"/>` + t(180, 150, "serial port: straight to the page (Chrome, Edge)", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"')
            + t(44, 30, "temperature:25.3", 'font-size="9" text-anchor="middle" font-family="ui-monospace, monospace"');
    }
    else if (kind == "telemetry") {
        s = `<rect x="6" y="8" width="348" height="60" rx="8" fill="var(--hp-bg)" stroke="var(--hp-1)" stroke-width="1.5"/>` + t(18, 30, "battery", 'font-size="13" font-weight="700"') + t(18, 48, "a number", 'font-size="9" fill="var(--hp-muted)"')
            + [["unit: V", 100], ["label: power", 160], ["range: 9 – 12.6", 238]].map(([text, x]) => `<rect x="${x}" y="18" width="${text.length * 5.6 + 12}" height="18" rx="9" fill="var(--hp-grid)"/>` + t(x + 6, 30.5, text, 'font-size="9"')).join("")
            + `<rect x="100" y="42" width="${"thresholds: low, empty".length * 5.6 + 12}" height="18" rx="9" fill="var(--hp-grid)"/>` + t(106, 54.5, "thresholds: low, empty", 'font-size="9"') + t(330, 54, "said once", 'font-size="9" text-anchor="end" fill="var(--hp-muted)"')
            + `<line x1="20" y1="122" x2="344" y2="122" stroke="var(--hp-line)"/>` + [[40, 11.8], [90, 11.6], [130, 11.5], [200, 11.1], [240, 10.9], [300, 10.6], [330, 10.2]].map(([x, v]) => `<circle cx="${x}" cy="${122 - (v - 10) * 18}" r="3.5" fill="var(--hp-1)"/>`).join("")
            + t(20, 140, "samples: a time and a value each, one per message", 'font-size="9" fill="var(--hp-muted)"')
            + `<path d="M120 152 H344" stroke="var(--hp-2)" stroke-width="2"/><path d="M120 147 v10 M344 147 v10" stroke="var(--hp-2)" stroke-width="2"/>` + t(232, 166, "kept: the data window", 'font-size="9" text-anchor="middle" fill="var(--hp-2)"');
    }
    else if (kind == "time") {
        const xs = [30, 90, 150, 250, 310], ys = [70, 50, 80, 40, 60];
        s = `<line x1="16" y1="110" x2="350" y2="110" stroke="var(--hp-line)"/>` + t(350, 126, "time", 'font-size="9" text-anchor="end" fill="var(--hp-muted)"')
            + xs.map((x, i) => `<line x1="${x}" y1="${ys[i]}" x2="${x}" y2="110" stroke="var(--hp-grid)"/><circle cx="${x}" cy="${ys[i]}" r="4" fill="var(--hp-1)"/>`).join("")
            + `<path d="M150 80 H250" stroke="var(--hp-1)" stroke-width="2" stroke-dasharray="4 3"/>`
            + `<line x1="205" y1="22" x2="205" y2="114" stroke="var(--hp-4)" stroke-width="2"/>` + t(205, 16, "the time shown", 'font-size="9" text-anchor="middle" fill="var(--hp-4)"')
            + `<circle cx="150" cy="80" r="8" fill="none" stroke="var(--hp-4)" stroke-width="2"/>` + t(150, 140, "shown: the last sample at or before", 'font-size="9" text-anchor="middle" fill="var(--hp-text)"')
            + t(250, 156, "never a value made up between two", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"');
    }
    else if (kind == "views") {
        s = ["temperature", "battery", "mode", "position"].map((n, i) => `<rect x="6" y="${14 + i * 34}" width="92" height="22" rx="11" fill="var(--hp-bg)" stroke="var(--hp-${i + 1})" stroke-width="1.5"/>` + t(52, 29 + i * 34, n, 'font-size="9" text-anchor="middle"')).join("")
            + box(150, 14, 80, 42, "Chart", "2 telemetries") + box(150, 64, 80, 30, "Values", "") + box(150, 102, 80, 42, "Map", "position")
            + arrow(98, 25, 148, 32) + arrow(98, 59, 148, 40) + arrow(98, 93, 148, 80) + arrow(98, 127, 148, 122)
            + `<rect x="262" y="14" width="92" height="130" rx="8" fill="none" stroke="var(--hp-2)" stroke-width="1.5"/>` + [[268, 22, 80, 40], [268, 68, 38, 34], [310, 68, 38, 34], [268, 108, 80, 30]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--hp-grid)"/>`).join("")
            + arrow(230, 78, 260, 78) + t(308, 162, "a dashboard", 'font-size="9" text-anchor="middle" fill="var(--hp-2)"') + t(52, 162, "telemetries", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"') + t(190, 162, "views", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"');
    }
    else if (kind == "axes") {
        s = `<path d="M20 150 h40" stroke="#e74c3c" stroke-width="2" marker-end="url(#hp-arrow)"/><path d="M20 150 v-40" stroke="#2ecc71" stroke-width="2" marker-end="url(#hp-arrow)"/>` + t(64, 154, "x", 'fill="#e74c3c"') + t(14, 104, "y", 'fill="#2ecc71"') + t(26, 166, "the scene: x forward, y left, z up", 'font-size="9" fill="var(--hp-muted)"')
            + `<g transform="translate(200,80) rotate(-25)"><rect x="-50" y="-26" width="100" height="52" rx="6" fill="var(--hp-1)" opacity="0.8"/>${[[-40, -34], [18, -34], [-40, 26], [18, 26]].map(([x, y]) => `<rect x="${x}" y="${y}" width="22" height="8" rx="2" fill="var(--hp-text)"/>`).join("")}<path d="M0 0 h34" stroke="#e74c3c" stroke-width="2" marker-end="url(#hp-arrow)"/><path d="M0 0 v-22" stroke="#2ecc71" stroke-width="2" marker-end="url(#hp-arrow)"/><path d="M50 0 h30" stroke="var(--hp-4)" stroke-width="2.5" marker-end="url(#hp-arrow)"/></g>`
            + t(250, 150, "robot: its own frame", 'font-size="9" fill="var(--hp-muted)"') + t(250, 164, "wheels, arrow: F:robot", 'font-size="9" fill="var(--hp-muted)" font-family="ui-monospace, monospace"');
    }
    else if (kind == "commands") {
        s = box(6, 20, 90, 120, "This page", "", "var(--hp-2)") + box(264, 20, 90, 120, "Your device", "", "var(--hp-1)")
            + arrow(96, 40, 262, 40, "speed:1.5 (asks)", { color: "var(--hp-ok)" }) + arrow(262, 74, 98, 74, "speed:1.2 (kept: it decides)") + arrow(262, 108, 98, 108, "speed:1.5 (applied ✓)", { color: "var(--hp-text)" })
            + t(180, 160, "what comes back is what is true", 'font-size="9" text-anchor="middle" fill="var(--hp-muted)"');
    }
    return helpSvg(W, H, s);
}

// How the user sends data. `setup` is what a program needs once, before the first line.
const HELP_SENDERS = [
    { id: "sh", name: "Terminal", sub: "UDP, one line", setup: "", setupNote: "Nothing to install: nc comes with Linux and macOS. The Teleplot server receives UDP port 47269 and passes it on to this page (see Sources)." },
    { id: "py", name: "Python", sub: "UDP socket", setup: "import socket\nsock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)", setupNote: "The Teleplot server receives UDP port 47269 and passes it on to this page (see Sources). clients/python/teleplot.py does it for you, commands included." },
    { id: "cpp", name: "C++", sub: "Teleplot.h", setup: "#include \"Teleplot.h\"", setupNote: "One header, in clients/cpp (C++17). What update() gets is sent every 20 ms by itself; poll() reads what the page writes back." },
    { id: "ino", name: "Arduino", sub: "Serial port", setup: "Serial.begin(115200);", setupNote: "Then open the port in the Sources panel (Chrome or Edge). A line that does not start with > is shown as a log." },
];

const HELP_SHORTCUTS = [
    { keys: "Space", label: "Pause or resume" },
    { keys: "T", label: "Telemetries" },
    { keys: "S", label: "Sources" },
    { keys: "X", label: "Export and import" },
    { keys: "H", label: "This help" },
    { keys: "E", label: "Edit the dashboard" },
    { keys: "C", label: "Commands on or off" },
    { keys: "Esc", label: "Close a panel, leave Edit, back to live" },
];

// The properties of a 3D| / 2D| line, by their short and long names: what each is called in the panel, and how many values it takes (as
// the parser: 3D, then 2D; "*": up to the next property)
const HELP_PROPERTIES = (() => {
    const names = [["S", "shape", "kind", 1], ["U", "url", "file", 1], ["P", "position", "position", 3, 2], ["R", "rotation", "rotation", 3, 1], ["Q", "quaternion", "quaternion", 4],
        ["C", "color", "color", 1], ["O", "opacity", "opacity", 1], ["T", "texture", "texture", 2], ["W", "width", "width", 1], ["D", "depth", "depth", 1], ["H", "height", "height", 1],
        ["SC", "scale", "scale", "*"], ["RA", "radius", "radius", 1], ["PR", "precision", "precision", 1], ["K", "intrinsics", "camera", 6], ["DC", "distortion", "distortion", 5], ["PT", "points", "points", "*"],
        ["V", "vector", "vector", 3, 2], ["TX", "text", "text", 1], ["LW", "linewidth", "line width", 1], ["TS", "textsize", "text size", 1], ["F", "frame", "frame", 1], ["FPX", "pixels", "pixels of", 1]];
    const map = {};
    for (const [short, long, label, count, flat] of names) map[short] = map[long] = { label, count, flat: flat || count };
    return map;
})();
// Keys of ATTR| lines
const HELP_ATTRIBUTES = { min: "lowest", max: "highest", write: "writable", action: "action", title: "button text", confirm: "asks first", longpress: "hold to press",
    color: "color", arg: "argument", type: "type", optional: "optional", default: "default", step: "step", unit: "unit", enum: "choices", desc: "description",
    rate: "per second", hold: "stops after (ms)", axes: "axes", scale: "value scale", nodata: "no measure", depth: "distances" };
const HELP_FLAGS = { t: "state", log: "log", xy: "2D point", xyz: "3D point", pc: "point cloud", np: "not charted", clr: "clear first", stack: "stack", enum: "structure", edges: "transitions flag" };

// A message cut in named parts: [{text, kind, label}]. The kind gives the color: "name", "label" (of a view), "value", "time", "unit" or
// "flags" (and prefixes); separators have neither kind nor label. The parts join back to the message, also while it is being typed. For
// display only: it follows the rules of the parser without being it.
function helpParts(message) {
    const parts = [];
    const add = (text, kind = "", label = "") => { if (text !== "") parts.push({ text, kind, label }); };
    const sep = (text) => add(text);
    const split = (text, separator) => { // Outside quotes
        const out = [""]; let quote = "";
        for (const c of text) {
            if (quote) { if (c == quote) quote = ""; }
            else if (c == '"' || c == "'") quote = c;
            else if (c == separator) { out.push(""); continue; }
            out[out.length - 1] += c;
        }
        return out;
    };
    const nameAndLabel = (text) => { const comma = text.indexOf(","); if (comma < 0) { add(text, "name", "name"); return; } add(text.slice(0, comma), "name", "name"); sep(","); add(text.slice(comma + 1), "label", "label"); };
    const isNumber = (text) => /^-?[0-9.]+([eE][+-]?[0-9]+)?$/.test(text);
    let rest = String(message);

    if (rest.startsWith(">")) { // A log line: >:text or >time:text
        add(">", "flags", "log");
        const colon = rest.indexOf(":");
        if (colon < 0) { add(rest.slice(1), "value", "text"); return parts; }
        add(rest.slice(1, colon), "time", "time"); sep(":"); add(rest.slice(colon + 1), "value", "text");
        return parts;
    }
    if (rest.startsWith("DASH|")) { // DASH|path:type:telemetries|option=value...
        add("DASH|", "flags", "dashboard");
        const fields = rest.slice(5).split("|");
        const head = fields[0].split(":");
        add(head[0], "name", "dashboard/view");
        if (head.length > 1) { sep(":"); add(head[1], "value", "view type"); }
        if (head.length > 2) { sep(":"); add(head.slice(2).join(":"), "label", "telemetries"); }
        for (const option of fields.slice(1)) { sep("|"); add(option, "flags", "option"); }
        return parts;
    }
    if (rest.startsWith("ATTR|")) { // ATTR|name|key=value|...
        add("ATTR|", "flags", "attributes");
        const fields = rest.slice(5).split("|");
        add(fields[0], "name", "name");
        for (const field of fields.slice(1)) { sep("|"); add(field, "value", HELP_ATTRIBUTES[field.split("=")[0]] || "attribute"); }
        return parts;
    }
    if (rest.startsWith("TH|")) { // TH|name:[time:]limit:limit,color;...
        add("TH|", "flags", "thresholds");
        rest = rest.slice(3);
        const colon = rest.indexOf(":");
        add(colon < 0 ? rest : rest.slice(0, colon), "name", "name");
        if (colon < 0) return parts;
        sep(":");
        rest.slice(colon + 1).split(";").forEach((group, g) => {
            if (g > 0) sep(";");
            group.split(":").forEach((field, f) => {
                if (f > 0) sep(":");
                if (f == 0 && isNumber(field)) { add(field, "time", "time"); return; }
                const comma = field.indexOf(",");
                if (comma < 0) { add(field, "value", "limit"); return; }
                add(field.slice(0, comma), "value", "limit"); sep(","); add(field.slice(comma + 1), "unit", "color");
            });
        });
        return parts;
    }
    if (rest.startsWith("!")) { // What the page sends to call an action: !name#id[:argument=value...]
        add("!", "flags", "call");
        const fields = rest.slice(1).split(":"), head = fields[0], hash = head.indexOf("#");
        add(hash < 0 ? head : head.slice(0, hash), "name", "name");
        if (hash >= 0) add(head.slice(hash), "time", "call number");
        for (const field of fields.slice(1)) { sep(":"); add(field, "value", "argument=value"); }
        return parts;
    }
    if (rest.startsWith("ACK|")) { // ACK|name[#id]:status
        add("ACK|", "flags", "answer");
        rest = rest.slice(4);
        const colon = rest.indexOf(":");
        const head = colon < 0 ? rest : rest.slice(0, colon);
        const hash = head.indexOf("#");
        add(hash < 0 ? head : head.slice(0, hash), "name", "name");
        if (hash >= 0) add(head.slice(hash), "time", "call number");
        if (colon >= 0) { sep(":"); add(rest.slice(colon + 1), "value", "result"); }
        return parts;
    }
    const prefix = /^(3D|2D|JPG|PNG|RAW)\|/.exec(rest);
    if (prefix) {
        add(prefix[0], "flags", prefix[1] == "3D" ? "3D shape" : (prefix[1] == "2D" ? "2D shape" : prefix[1] + " image"));
        rest = rest.slice(prefix[0].length);
        const colon = rest.indexOf(":");
        nameAndLabel(colon < 0 ? rest : rest.slice(0, colon));
        if (colon < 0) return parts;
        sep(":");
        const body = rest.slice(colon + 1);
        if (prefix[1] == "JPG" || prefix[1] == "PNG" || prefix[1] == "RAW") { // [time:][i/n:]base64 (base64 has no colon)
            const fields = body.split(":");
            for (const field of fields.slice(0, -1)) {
                if (isNumber(field)) add(field, "time", "time");
                else if (/^[0-9]+\/[0-9]+$/.test(field)) add(field, "time", "part");
                else add(field, "value", "");
                sep(":");
            }
            add(fields[fields.length - 1], "value", prefix[1] == "RAW" ? "pixels in base64" : "picture in base64");
            return parts;
        }
        const pieces = split(body, "|");
        const tokens = split(pieces[0], ":");
        const flat = prefix[1] == "2D";
        for (let i = 0; i < tokens.length;) { // A property and its values are one part
            const property = HELP_PROPERTIES[tokens[i]];
            if (i > 0) sep(":");
            if (!property) { add(tokens[i++], "value", ""); continue; }
            const count = flat ? property.flat : property.count;
            let end = i + 1;
            if (count == "*") while (end < tokens.length && HELP_PROPERTIES[tokens[end]] === undefined) end++;
            else end = Math.min(tokens.length, i + 1 + count);
            add(tokens.slice(i, end).join(":"), "value", property.label);
            i = end;
        }
        if (pieces.length > 1) { sep("|"); add(pieces.slice(1).join("|"), "flags", HELP_FLAGS[pieces[pieces.length - 1]] || "flags"); }
        return parts;
    }
    // name[,label]:[time:]value[;...][§unit][|flags]
    let flags = "", unit = "";
    const bar = rest.lastIndexOf("|");
    if (bar >= 0) { flags = rest.slice(bar + 1); rest = rest.slice(0, bar); }
    const section = rest.indexOf("§");
    if (section >= 0) { unit = rest.slice(section + 1); rest = rest.slice(0, section); }
    const colon = rest.indexOf(":");
    nameAndLabel(colon < 0 ? rest : rest.slice(0, colon));
    if (colon >= 0) {
        sep(":");
        const values = rest.slice(colon + 1);
        const isText = /\b(t|log|stack)\b/.test(flags);
        const structure = /\b(enum|edges)\b/.test(flags) ? (flags.includes("edges") ? "transitions" : "nodes") : "";
        const points = flags.includes("xyz") ? 3 : (flags.includes("xy") ? 2 : 0);
        if (structure) { // [time:]items, separated by commas
            const first = values.indexOf(":");
            if (first > 0 && isNumber(values.slice(0, first))) { add(values.slice(0, first), "time", "time"); sep(":"); add(values.slice(first + 1), "value", structure); }
            else add(values, "value", structure);
        }
        else if (isText) { // [time:]text (the text may hold colons)
            const first = values.indexOf(":");
            const label = flags.includes("stack") ? "path" : (flags.includes("log") ? "log line" : "text");
            if (first > 0 && isNumber(values.slice(0, first))) { add(values.slice(0, first), "time", "time"); sep(":"); add(values.slice(first + 1), "value", label); }
            else add(values, "value", label);
        }
        else if (flags.includes("pc")) {
            let named = false;
            values.split(";").forEach((sample, index) => {
                if (index > 0) sep(";");
                if (!sample.includes(":")) { add(sample, "time", "time"); return; }
                // A point: x:y:z, then its intensity and / or its color (named on the first point; never nudged: they have their ranges)
                const fields = sample.split(":");
                add(fields.slice(0, 3).join(":"), "value", named ? "" : "x:y:z");
                if (fields.length > 3) { sep(":"); add(fields.slice(3).join(":"), "unit", named ? "" : ({ 4: "intensity", 6: "r:g:b", 7: "i:r:g:b" }[fields.length] || "")); }
                named = true;
            });
        }
        else values.split(";").forEach((sample, index) => {
            if (index > 0) sep(";");
            const fields = sample.split(":");
            if (points && fields.length == points + 1) { add(fields.slice(0, points).join(":"), "value", points == 2 ? "x:y" : "x:y:z"); sep(":"); add(fields[points], "time", "time"); return; }
            if (points) { add(sample, "value", points == 2 ? "x:y" : "x:y:z"); return; }
            if (fields.length == 2) { add(fields[0], "time", index ? "" : "time"); sep(":"); add(fields[1], "value", index ? "" : "value"); return; }
            add(sample, "value", index ? "" : "value");
        });
    }
    if (section >= 0) { sep("§"); add(unit, "unit", "unit"); }
    if (bar >= 0) { sep("|"); add(flags, "flags", HELP_FLAGS[flags] || "flags"); }
    return parts;
}

// The same message with its numbers nudged a little (values, positions, rotations; never names, times, attributes or texts), to show
// that sending again changes what is displayed. Same number of decimals; integers move by whole steps.
function helpVary(message, random = Math.random) {
    const nudge = (text) => {
        if (!/^-?[0-9]+(\.[0-9]+)?$/.test(text)) return text;
        const decimals = (text.split(".")[1] || "").length, unit = Math.pow(10, -decimals), value = parseFloat(text);
        const step = Math.max(Math.abs(value) * (0.02 + random() * 0.06), unit * (1 + Math.floor(random() * 3)));
        const out = (value + (random() < 0.5 ? -step : step)).toFixed(decimals);
        return out === text || out === "-" + text ? (value + unit).toFixed(decimals) : out;
    };
    const parts = helpParts(message);
    const prefixed = parts.length > 0 && parts[0].kind == "flags" && /\|$/.test(parts[0].text);
    return parts.map((p) => {
        if (p.kind != "value") return p.text;
        if (prefixed && ["position", "rotation", "points", "vector"].includes(p.label)) { const t = p.text.split(":"); return [t[0], ...t.slice(1).map(nudge)].join(":"); }
        if (!prefixed && ["value", "x:y", "x:y:z", ""].includes(p.label)) return p.text.split(":").map(nudge).join(":");
        return p.text;
    }).join("");
}
// The options of each type of view, from what the views say of themselves (getOptionsSchema): [{type, options: [{key, label, values}]}]
function helpViewOptions(TP) {
    return TP.view.VIEW_TYPES.map((type) => {
        const view = TP.view.createView(type, []);
        const options = view.getOptionsSchema().filter((o) => o.key != "title").map((o) => ({ key: o.key, label: o.label,
            values: (o.type == "bool" ? "true or false" : (o.type == "choice" ? o.choices.map((c) => c[0]).join(", ") : (o.type == "int" ? "a whole number from " + o.min + " to " + o.max : o.type))) + " (default " + view.options[o.key] + ")" }));
        return { type, options };
    });
}
// A part of a message as it is displayed: a long one (a picture in base64) by its start and its end. Copy and Send take the whole message.
function helpShort(text, max = 120) {
    return text.length <= max ? text : text.slice(0, max - 24) + " … " + text.slice(-16);
}
// A message with {now} (or {now-200}, {now+50}...) replaced by a time in ms: the time of the page when it is shown or sent
function helpFill(code, now = Date.now()) {
    return code.replace(/\{now([+-][0-9]+)?\}/g, (match, offset) => String(Math.round(now) + (offset ? parseInt(offset) : 0)));
}
// The C++ line of an example ([text, kind] parts) for its nudged message: its values, in order, become the nudged ones
function helpVaryParts(cpp, from, to) {
    const values = (message) => helpParts(message).filter((p) => p.kind == "value").map((p) => p.text);
    const before = values(from), after = values(to);
    return cpp.map(([text, kind]) => { const i = kind == "value" ? before.indexOf(text) : -1; return i >= 0 ? [after[i], kind] : [text, kind]; });
}

// What a part accepts, in one sentence (shown when it is pointed at): by label, else by kind
const HELP_PART_TIPS = {
    name: "Any text without : | , §. The same name again adds a sample to the same telemetry.",
    label: "After a comma: telemetries with the same label share a view. A path (Robot/Motion) places it in that dashboard.",
    value: "A number, with a point for decimals: 25.3, -4, 1e3.",
    time: "Optional: milliseconds since 1970 (decimals allowed), or since the boot of a board without a date: the page dates those from when they arrive. Without it, the sample is dated when it arrives.",
    unit: "Optional, after §: shown next to the value.",
    text: "Any text, colons included. The same text again continues the state; an empty text is \"nothing\".",
    "log line": "Any text, colons included: one line of the log.",
    path: "What runs, levels separated by /. Several at once separated by commas; =status after one: what it ended with. An empty text: nothing runs.",
    nodes: "States or nodes, a path each (levels separated by /), separated by commas; #kind after one: words written above it. The same time again adds to them, a newer time replaces them.",
    transitions: "from>to or from>to=event, separated by commas: the states it goes between, and what makes it go.",
    structure: "The enum flag: the texts it can take (states, nodes, choices of a setting).",
    "transitions flag": "The edges flag: the transitions of a state machine.",
    "x:y": "Two numbers: x and y, in your units.",
    "x:y:z": "Three numbers: x forward, y to the left, z up.",
    intensity: "A fourth value per point: the points are colored from the lowest intensity to the highest.",
    "r:g:b": "The color of the point: red, green and blue, from 0 to 255 each.",
    "i:r:g:b": "An intensity, then the color of the point: red, green and blue, from 0 to 255 each.",
    state: "The t flag: a text whose latest value matters.",
    log: "Lines to read in order, shown in a Log view.",
    "2D point": "The xy flag: two numbers make a position, drawn on a map with its trail.",
    "3D point": "The xyz flag: three numbers make a point in space.",
    "point cloud": "The pc flag: all the points of the line are one sample, a whole scan.",
    "not charted": "The np flag: not put on the Live dashboard by itself.",
    "clear first": "The clr flag: what the telemetry held before is forgotten.",
    stack: "The stack flag: the text is the path of what is running.",
    flags: "Optional, after the last |: t, log, stack, xy, xyz, pc, enum, edges, np, clr.",
    "3D shape": "3D| then the name, then properties, each a key and its values.",
    "2D shape": "2D| is 3D| written flat: x:y positions, one angle.",
    kind: "S: cube, sphere, cylinder, stl; flat: rect, circle, line, polygon, arrow, text.",
    position: "P: x:y:z (2D: x:y), in your units.",
    rotation: "R: roll, pitch, yaw in radians (2D: one angle).",
    quaternion: "Q: x:y:z:w, w last.",
    color: "A color name (red, orange...) or #rrggbb.",
    opacity: "O: from 0 (invisible) to 1.",
    scale: "SC: x:y:z, the size along its own axes (a shape is 1 by default). x:y keeps z; one value alone: every axis.",
    width: "W: along x, in your units (V1; SC is the same).", depth: "D: along y, in your units.", height: "H: along z (2D: along y), in your units.", radius: "RA: in your units.",
    points: "PT: as many x:y (2D) or x:y:z as needed.", vector: "V: x:y(:z), from the position.", frame: "F: the name of the telemetry whose frame it is in.",
    "pixels of": "FPX: the name of an image telemetry: positions are its pixels (u right, v down).",
    camera: "K: fx:fy:cx:cy:width:height, in pixels.", distortion: "DC: k1:k2:p1:p2:k3, as OpenCV.",
    attributes: "ATTR| then the name, then key=value fields separated by |. Said once, kept.",
    lowest: "min=: the lowest value expected.", highest: "max=: the highest value expected.",
    thresholds: "TH| then the name, then limits: name<value (past it below) or name>value (past it above).",
    limit: "A name, < or >, a value. The same name again replaces it; without a value it is removed.",
    writable: "write: the page may change it (=number, bool, text, xy, xyz, pose2d).",
    action: "action: a function of your device, shown as a button.",
    argument: "arg=name: one argument of the action, in order; type, optional, default... follow on the same line.",
    dashboard: "DASH| describes one view (or layout) of a dashboard by its path.",
    "dashboard/view": "The dashboard, then the layouts and the view, separated by /.",
    "view type": "chart, values, log, timeline, graph, 2d, 3d, image, joystick; row, column, grid, stack; none removes it.",
    telemetries: "The names of the telemetries it shows, separated by commas: they do not have to exist yet.",
    option: "An option of the view: w, h, title, follow (labels), time (time group), or one of its settings.",
    answer: "ACK| your device's answer to a call of the page.",
    call: "! a call of the page: the name of the action, # and the number of the call, then its arguments by name.",
    "argument=value": "An argument of the call, by its name. Several numbers are separated by commas (target=1.5,2); in texts, % : , = | and line breaks are written %XX.",
    "call number": "#: the number of the call the page sent (!name#12).",
    result: "run (started), ok[:text] or err:why.",
    "PNG image": "PNG| (or JPG|) then the name, [time:], [part i/n:] and the picture.", "JPG image": "JPG| (or PNG|) then the name, [time:], [part i/n:] and the picture.",
    "RAW image": "RAW| then the name, [time:], [part i/n:] and the pixels: plain numbers, a depth map for example.",
    "pixels in base64": "Width and height (2 bytes each, little-endian), the format (0 gray16, 1 float32), 3 bytes at 0, then the numbers row after row, little-endian.",
    "value scale": "scale=: what a number of a pixel is worth (number x scale), in the unit of the telemetry.",
    "no measure": "nodata=: the number of a pixel without measure (0 by default); empty: every number is a measure.",
    "distances": "depth=: 1 (default) the values are distances along the axis of the camera, placed in 3D views; 0 they are not.",
    "picture in base64": "The bytes of the .png or .jpg file, in base64. A big one is sent in parts: i/n before each.",
    part: "i/n: part i of n (from 1), each in its own message, in any order. The picture shows when all n are there.",
    "button text": "title=: the text of the button (default: the name).", "asks first": "confirm: the button asks before calling.", "hold to press": "longpress: the button must be held.",
    type: "type=: number, bool, text, xy, xyz or pose2d.", optional: "optional: the argument may be left empty.", default: "default=: the value the form starts with.",
    step: "step=: what the value moves by.", choices: "enum=: the texts an argument can take, separated by commas.", description: "desc=: a sentence shown as a tooltip.",
    "per second": "rate=: how many times per second the page sends it while it is held.", "stops after (ms)": "hold=: your device stops by itself when nothing came for that long.",
    axes: "axes=: what a joystick moves, for example x,yaw.", attribute: "A key=value field.",
    file: "U: the url of an STL file, in quotes: relative to this page, or on a site that allows it (CORS).", texture: "T:url:\"...\" an image file, or T:telem:name the pictures of an image telemetry.", precision: "PR: how many faces a round shape has.",
    "text size": "TS: the height of a text, in your units.", "line width": "LW: the width of a line, in your units.",
};

// The line that sends a message, for a sender: {parts: [{text, kind, msg}], note}. The message (msg: true) is in the middle of what wraps
// it; `note` says what the line needs to be told (a message the C++ client has no call for).
function helpLine(senderId, example) {
    const message = helpParts(example.code).map((p) => ({ text: p.text, kind: p.kind, msg: true }));
    const wrap = (before, parts, after) => ({ parts: [{ text: before, kind: "", msg: false }, ...parts, { text: after, kind: "", msg: false }], note: "" });
    // A message with double quotes in it (a text, a url) is put between single quotes, or its quotes are escaped in a C string
    const q = example.code.includes("\"") ? "'" : "\"";
    const escaped = (parts) => parts.map((p) => ({ ...p, text: p.text.replace(/"/g, "\\\"") }));
    if (senderId == "sh") return wrap("echo " + q, message, q + " | nc -u -w0 127.0.0.1 47269");
    if (senderId == "py") return wrap("sock.sendto(" + q, message, q + ".encode(), (\"127.0.0.1\", 47269))");
    if (senderId == "ino") {
        // On a serial port a line is a log unless it starts with ">": a log is the text alone, anything else gets the ">"
        if (example.code.startsWith(">")) return wrap("Serial.println(\"", escaped([{ text: example.code.slice(example.code.indexOf(":") + 1), kind: "value", msg: true }]), "\");");
        return wrap("Serial.println(\">", escaped(message), "\");");
    }
    if (example.cpp) return { parts: example.cpp.map(([text, kind]) => ({ text, kind: kind || "", msg: !!kind })), note: "" };
    return { parts: message, note: "No example with the C++ client for this one yet: send this line as text over UDP (port 47269)." };
}

// The device of the Help: the messages sent from the panel come from it (a source of the page, "Help panel" in Sources), so that what
// the page writes back has somewhere to go. It does what a device would: a setting written by the page is applied and sent back as
// its value (with the flag of its type), a call is answered run, then ok a moment later (`runMs`); a call sent again with the same
// number is answered again, never run twice.
function helpDevice(TP) {
    const found = TP.connection.connections.find((c) => c.isHelpDevice);
    if (found) return found;
    const device = TP.connection.addConnectionLocal("Help panel", (message) => helpDeviceWrite(TP, device, message));
    device.isHelpDevice = true;
    device.runMs = 600;
    device.calls = new Map(); // "name#id" -> what was answered
    return device;
}
function helpDeviceWrite(TP, device, message) {
    for (const line of String(message.text || "").split("\n")) {
        if (!line.trim()) continue;
        if (line.startsWith("!")) { // A call: !name#id[:argument=value...]
            const key = line.slice(1).split(":")[0];
            if (device.calls.has(key)) { device.sendText("ACK|" + key + ":" + device.calls.get(key)); continue; }
            device.calls.set(key, "run");
            if (device.calls.size > 50) device.calls.delete(device.calls.keys().next().value);
            device.sendText("ACK|" + key + ":run");
            setTimeout(() => { device.calls.set(key, "ok"); device.sendText("ACK|" + key + ":ok"); }, device.runMs);
            continue;
        }
        // A setting: the line a device sends, as the page wrote it; the device sends it back with the flag of its type
        const at = line.indexOf(":"), name = line.slice(0, at);
        const telem = TP.datastore.getTelemetry(name), declaration = telem && TP.commands.declaration(telem);
        const flag = declaration ? ({ text: "|t", xy: "|xy", xyz: "|xyz", pose2d: "|xyz" }[declaration.type] || "") : "";
        device.sendText(line + flag);
    }
}
// Sends a message of the Help, from its device. Returns the number of lines that were not understood.
function helpSend(TP, code) {
    return helpDevice(TP).sendText(code);
}

// What Teleplot made of a message that was just given to its parser: {ok, text}. `problems` is what parseDataText returned.
function helpDescribe(TP, message, problems) {
    message = String(message).trim();
    if (message.startsWith("DASH|")) {
        const line = TP.dashboards.parseLine(message);
        if (problems > 0 || !line) return { ok: false, text: "Teleplot did not understand this dashboard line. It is DASH|dashboard/view:type:telemetries|option=value, for example DASH|Robot/Motion:chart:speed" };
        if (line.type == "none") return { ok: true, text: "Received: " + (line.segments.length ? "the view " + line.segments.join("/") + " of the dashboard " + line.name : "the dashboard " + line.name) + " is removed." };
        return { ok: true, text: "Received: " + (line.segments.length ? "the view " + line.segments.join("/") + " of the dashboard " + line.name : "the layout of the dashboard " + line.name) + ". Sending the same line again changes nothing." };
    }
    if (message.startsWith("ACK|")) {
        if (problems > 0) return { ok: false, text: "Teleplot did not understand this answer. It is ACK|name#id:run, ok or err:why, for example ACK|reset#12:ok" };
        return { ok: true, text: "Received: an answer of your device to a call. The page shows it on the button of the action, and on a timeline." };
    }
    if (message.startsWith("ATTR|")) {
        const name = message.slice(5).split("|")[0];
        const telem = TP.datastore.getTelemetry(name);
        if (problems > 0 || !telem) return { ok: false, text: "Teleplot did not understand this line. It is ATTR|name|min=value|max=value, for example ATTR|battery|min=9|max=12.6" };
        // Commands: what the page can change or call
        if (/\|(write|action|arg)\b/.test(message)) {
            const declaration = TP.commands.declaration(telem), args = TP.commands.args(telem);
            if (/\|arg=/.test(message)) return { ok: true, text: "Received: " + name + " takes " + args.length + (args.length == 1 ? " argument: " : " arguments: ") + args.map((a) => a.name + (a.optional ? " (optional)" : "")).join(", ") + "." };
            if (!declaration) return { ok: true, text: "Received: " + name + " cannot be changed from the page any more." };
            if (declaration.kind == "action") return { ok: true, text: "Received: " + name + " is an action. Switch CMD on (top menu): it gets a button where it is displayed." };
            if (TP.commands.isContinuous(telem)) return { ok: true, text: "Received: " + name + " is driven continuously (" + declaration.type + "). Switch CMD on, and use its joystick view." };
            return { ok: true, text: "Received: " + name + " can be changed from the page (" + declaration.type + "). Switch CMD on (top menu), then change it where its value is displayed." + (telem.hasContent() ? "" : " Now send its value, for example " + name + ":1") };
        }
        // How the pixels of its pictures are read
        if (/\|(scale|nodata|depth)(=|\||$)/.test(message)) {
            const how = TP.pictures.settings(telem);
            return { ok: true, text: "Received: a pixel of " + name + " is its number x " + how.scale + (telem.getAttribute(TP.protocol.TELEM_ATTR_UNIT) ? " " + telem.getAttribute(TP.protocol.TELEM_ATTR_UNIT) : "") + "; " + (how.invalid === undefined ? "every number is a measure" : how.invalid + " is no measure") + "; " + (how.depth ? "distances, placed in 3D when it has a camera." : "not distances.") + (telem.hasContent() ? "" : " Now send its pictures (RAW| or a 16-bit PNG|).") };
        }
        // Its unit, color, description (no range in the line)
        const words = { unit: "unit", color: "color", desc: "description", title: "title" };
        const keys = message.split("|").slice(2).map((f) => words[f.split("=")[0]]).filter(Boolean);
        if (keys.length && !/\|(min|max)=/.test(message)) {
            return { ok: true, text: "Received: the " + keys.join(", ") + " of " + name + "." + (telem.hasContent() ? "" : " Now send its value, for example " + name + ":1") };
        }
        const range = telem.getRange();
        if (!range) return { ok: true, text: "Received: " + name + " has no range any more." };
        const hasData = telem.hasContent();
        return { ok: true, text: "Received: " + name + " is expected " + (range.min === undefined ? "up to " + range.max : (range.max === undefined ? "from " + range.min : "between " + range.min + " and " + range.max)) + "." + (hasData ? " Its value has a bar when both ends are given." : " Now send its value, for example " + name + ":" + (range.min !== undefined ? range.min : range.max)) };
    }
    if (message.startsWith("TH|")) {
        const name = message.slice(3).split(":")[0];
        const telem = TP.datastore.getTelemetry(name);
        if (problems > 0 || !telem) return { ok: false, text: "Teleplot did not understand this line. It is TH|name:threshold<value or threshold>value, for example TH|battery:low<10.5" };
        const list = telem.getThresholds().map((t) => t.name + (t.operator == TP.protocol.THRESHOLD_ABOVE ? " above " : " below ") + t.value);
        return { ok: true, text: "Received: " + (list.length ? "the threshold" + (list.length > 1 ? "s" : "") + " of " + name + " " + (list.length > 1 ? "are " : "is ") + list.join(", ") + "." : name + " has no threshold any more.") + (telem.hasContent() ? "" : " Now send its value, for example " + name + ":" + (list.length ? telem.getThresholds()[0].value : 0)) };
    }
    if (problems > 0 || !message.includes(":")) return { ok: false, text: "Teleplot did not understand this line. A message is name:value, for example temperature:25.3" };
    if (message.startsWith(">")) return { ok: true, text: "Received: a log line. Text telemetries are shown by a Log view." };
    const prefix = /^(3D|2D|JPG|PNG|RAW)\|/.exec(message);
    const body = prefix ? message.slice(prefix[0].length) : message;
    const bar = body.lastIndexOf("|");
    const flags = bar >= 0 ? body.slice(bar + 1) : "";
    const name = body.slice(0, body.indexOf(":")).split(",")[0];
    const telem = TP.datastore.getTelemetry(name);
    const part = prefix && (prefix[1] == "PNG" || prefix[1] == "JPG" || prefix[1] == "RAW") ? /^[^:]*:(?:[0-9.]+:)?([0-9]+)\/([0-9]+):/.exec(body) : null;
    if (part && problems == 0) {
        // The part that completes a picture is in the latest picture of the telemetry
        const images = telem && telem.data[TP.protocol.SECTION_TYPE_TELEM_DATA_IMAGE], b64 = body.slice(body.lastIndexOf(":") + 1);
        const complete = !!images && String(images.data[1][images.data[1].length - 1]).includes(b64);
        return { ok: true, text: "Received: part " + part[1] + " of " + part[2] + " of a picture named " + name + ". " + (complete ? "The picture is complete: it shows." : "It shows when its " + part[2] + " parts are there, in any order.") };
    }
    const P0 = TP.protocol;
    const described = telem && (telem.getAttribute(P0.TELEM_ATTR_SHAPE) !== undefined || telem.getAttribute(P0.TELEM_ATTR_FRAME) !== undefined); // (a shape can be nothing but its kind)
    if (!telem || (!Object.keys(telem.data).length && !described)) return { ok: false, text: "Nothing was stored for \"" + name + "\": check the values of the line." };
    const P = TP.protocol;
    let what = "a number";
    if (prefix && (prefix[1] == "3D" || prefix[1] == "2D")) {
        const isCamera = telem.data[P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS] || telem.data[P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION];
        what = isCamera ? "the camera of the image" : (TP.view.ViewScene3D.isCloud(telem) ? "the pose of the sensor of the point cloud" : (TP.view.ViewScene3D.isPoint(telem) ? "the frame of the point" : (prefix[1] == "2D" ? "a 2D shape" : "a 3D shape")));
    }
    else if (prefix) { const images = telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE]; what = images && TP.pictures.isValues(images, images.timestamps.length - 1) ? "a picture of values (a depth map)" : "an image"; }
    else if (/\b(enum|edges)\b/.test(flags)) {
        const structure = flags.includes("edges") ? telem.getEdges() : telem.getEnum();
        const count = structure ? (flags.includes("edges") ? structure.edges.length : structure.items.length) : 0;
        return { ok: true, text: "Received: " + count + (flags.includes("edges") ? " transitions" : " states or nodes") + " of " + name + ", in force from " + (structure ? TP.view.ViewLog.formatTime(structure.timestamp) : "now") + ". " + (telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT] ? "A graph view draws them." : "Now send where it is, for example " + name + ":" + (telem.getEnum() && telem.getEnum().items.length ? telem.getEnum().items[telem.getEnum().items.length - 1].path : "a") + "|stack") };
    }
    else if (flags.includes("stack")) what = "what runs";
    else if (flags.includes("pc")) { const cloud = telem.data[P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD]; what = "a point cloud of " + (cloud ? cloud.data[0][cloud.data[0].length - 1].length / 3 : 0) + " points"; }
    else if (flags.includes("xyz")) what = "a point in space";
    else if (flags.includes("xy")) what = "a position";
    else if (flags.includes("log")) what = "a log line";
    else if (flags.includes("t")) what = "some text";
    else {
        const numbers = telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER];
        if (!numbers || !Number.isFinite(numbers.data[0][numbers.data[0].length - 1])) return { ok: false, text: "The value of \"" + name + "\" is not a number. To send text, add the t flag: " + name + ":some text|t" };
        const samples = body.slice(body.indexOf(":") + 1).split(";").filter(Boolean).length;
        if (samples > 1) what = samples + " numbers";
    }
    const charted = telem.getAttribute(P.TELEM_ATTR_AUTOPLOT) !== false;
    const placed = TP.dashboards.getLabelPath(telem.getAttribute(P.TELEM_ATTR_VIEW_LABEL)); // A label that is a path: its own dashboard
    return { ok: true, text: "Received: " + what + " named " + name + ". It is in the Telemetries panel" + (charted ? " and on the " + (placed ? placed.name : "Live") + " dashboard." : ", not charted automatically.") };
}


function initComponent_panel_help(vue) {
    let name = "panel-help";

    // A tile of the gallery: a button that opens its sheet
    const tileHTML = (item) => `<button class="help-tile" :class="{page: ${item}.family == 'page'}" @click="openTile(${item}.id)"><span class="help-pic" v-html="picture(${item}.picture)"></span><b>{{${item}.title}}</b><span class="help-tile-sub">{{${item}.sub}}</span></button>`;
    // A message, its parts named under them (a name already given by an earlier message of the sheet is not repeated); pointing at a part
    // says what it accepts, in a tooltip under the part (over what follows: nothing moves)
    const anatomyHTML = (code, known) => `
        <div class="help-anat" @mouseleave="hover = null">
            <span v-for="(p, pi) in parts(${code})" :key="pi" class="help-part" :class="[p.kind ? 'help-k-' + p.kind : 'sep', {on: isHover(${code}, pi)}]"
                :tabindex="p.label ? 0 : -1" @mouseenter="p.label && setHover(${code}, pi, $event)" @focus="setHover(${code}, pi, $event)" @blur="hover = null"><span class="help-part-t">{{short(p.text)}}</span><span class="help-part-l">{{p.label && !(${known}).includes(p.label + '=' + p.text) ? p.label : '\\u00a0'}}</span></span>
            <div v-if="hoverTip(${code})" class="help-tip" role="tooltip" :class="'help-k-' + hoverPart(${code}).kind" :style="hover.style"><b>{{hoverPart(${code}).label}}</b> {{hoverTip(${code})}}</div>
        </div>`;
    // The command of the language: small, the message in it in the color of the text
    const commandHTML = (ex) => `
        <div class="help-cmd">
            <span class="help-cmd-lang">{{currentSender.name}}</span>
            <code><span v-for="(p, i) in line(${ex}).parts" :key="i" :class="{msg: p.msg}">{{short(p.text)}}</span></code>
            <span class="help-cmd-acts">
                <button class="help-act" :class="{done: results[${ex}.code] && results[${ex}.code].ok}" title="Send this message to the page right away, as if a device had" @click="sendExample(${ex})"><i :class="results[${ex}.code] && results[${ex}.code].ok ? 'icofont-check' : 'icofont-paper-plane'"></i> Send</button>
                <button class="help-icon" title="Put this message in the field below, to change it before sending it" aria-label="Edit this message" @click.stop="tryMessage(shown(${ex}))"><i class="icofont-edit"></i></button>
                <button class="help-icon" :class="{done: copied == text(${ex})}" title="Copy this line" aria-label="Copy this line" @click="copy(text(${ex}))"><i :class="copied == text(${ex}) ? 'icofont-check' : 'icofont-copy'"></i></button>
            </span>
        </div>
        <small v-if="line(${ex}).note" class="help-missing">{{line(${ex}).note}}</small>`;
    // What Teleplot made of a message that was sent ({ok, text})
    const resultHTML = (result) => `<div v-if="${result}" class="help-result" :class="{bad: !${result}.ok}" role="status"><i :class="${result}.ok ? 'icofont-check' : 'icofont-exclamation'"></i><span>{{${result}.text}}</span></div>`;
    // A concept of "How Teleplot works": a button that opens its sheet
    // The bar at the top of a sheet: stays in sight while the sheet scrolls (back to all, where it is, its title once its heading is out of
    // sight, previous and next in the order of the gallery); the same choices again at the end of the sheet
    const crumbHTML = (place, title) => `
        <nav class="help-crumb">
            <button @click="back()" title="Back to all (Alt+←, or the back button of the mouse)"><i class="icofont-simple-left"></i> All</button>
            <span class="help-crumb-place">${place}</span><b v-if="scrolled" class="help-crumb-title">{{${title}}}</b>
            <span class="help-crumb-nav">
                <button class="help-icon" :disabled="!neighbours.prev" :title="neighbours.prev ? 'Previous: ' + neighbours.prev.title : ''" aria-label="Previous" @click="go(neighbours.prev)"><i class="icofont-simple-left"></i></button>
                <button class="help-icon" :disabled="!neighbours.next" :title="neighbours.next ? 'Next: ' + neighbours.next.title : ''" aria-label="Next" @click="go(neighbours.next)"><i class="icofont-simple-right"></i></button>
            </span>
        </nav>`;
    const sheetFootHTML = `
        <div class="help-sheet-foot">
            <button class="help-act" @click="back()"><i class="icofont-simple-left"></i> All</button>
            <button v-if="neighbours.next" class="help-act help-next" @click="go(neighbours.next)">Next: {{neighbours.next.title}} <i class="icofont-simple-right"></i></button>
        </div>`;
    const conceptHTML = (item) => `<button class="help-concept" @click="openConcept(${item}.id)"><span class="help-pic" v-html="picture(${item}.schema)"></span><b>{{${item}.title}}</b><span>{{${item}.sub}}</span></button>`;
    // A message: what it is for (its title, numbered in a recipe), a sentence, then the message itself
    const cardHTML = (ex, number, known) => `
        <div class="help-msg" :class="{'help-msg-page': ${ex}.from == 'page'}">
            <span v-if="${ex}.picture" class="help-card-pic" v-html="picture(${ex}.picture)"></span>
            <h4 class="help-way"><b v-if="${number}" class="help-n">{{${number}}}</b>{{${ex}.title}}<span v-if="${ex}.from == 'page'" class="help-from-page" title="This message goes from the page to your device: your device reads it">sent by the page</span><span v-if="${ex}.optional" class="help-optional">optional</span></h4>
            <p v-if="${ex}.note" class="help-msg-note">{{${ex}.note}}</p>
            ${anatomyHTML(`shown(${ex})`, known)}
            <template v-if="${ex}.from != 'page'">${commandHTML(ex)}${resultHTML(`results[${ex}.code]`)}</template>
            <div v-else class="help-sent">
                <template v-if="lastSent(${ex})"><span>Just sent by this page:</span> <code>{{short(lastSent(${ex}))}}</code></template>
                <span v-else>{{TP.state.commands ? 'Use the control: what this page sends shows here.' : 'Commands are off (CMD): this page sends nothing.'}}</span>
            </div>
        </div>`;
    const setupHTML = `<details v-if="currentSender.setup" class="help-setup"><summary>Set up {{currentSender.name}}, once</summary>
            <div class="help-code"><code>{{currentSender.setup}}</code>
                <button class="help-icon" :class="{done: copied == currentSender.setup}" title="Copy" aria-label="Copy the set-up" @click="copy(currentSender.setup)"><i :class="copied == currentSender.setup ? 'icofont-check' : 'icofont-copy'"></i></button>
            </div>
            <small>{{currentSender.setupNote}}</small>
        </details>`;

    const vueHTML = `
        <div class="help-layout" @mouseup="onMouseUp" @keydown.alt.left.prevent="open && back()">
            <div class="help-tools">
                <label class="help-search"><i class="icofont-search-1"></i>
                    <input type="search" v-model="query" placeholder="Find: map, button, lidar…" aria-label="Find in the help" spellcheck="false" @keydown.esc.stop="query = ''">
                </label>
                <div class="help-sender-pick"><span>I send with</span>
                    <div class="help-seg" role="radiogroup" aria-label="How data is sent: the lines are written for it">
                        <button v-for="s in senders" :key="s.id" role="radio" :aria-checked="sender == s.id" :class="{on: sender == s.id}" :title="s.sub" @click="setSender(s.id)">{{s.name}}</button>
                    </div>
                </div>
            </div>

            <div class="help-scroll" ref="scroll" @scroll="onScroll">
                <!-- Searching: the tiles and concepts that match -->
                <template v-if="query.trim()">
                    <div v-if="found.tiles.length" class="help-gallery"><template v-for="tile in found.tiles" :key="tile.id">${tileHTML("tile")}</template></div>
                    <div v-if="found.concepts.length" class="help-concepts">
                        <template v-for="c in found.concepts" :key="c.id">${conceptHTML("c")}</template>
                    </div>
                    <div v-if="!found.tiles.length && !found.concepts.length" class="help-nothing">
                        <b>Nothing about "{{query.trim()}}"</b>
                        <span>Have a line already? Paste it in the field at the bottom: Teleplot tells what it is.</span>
                    </div>
                </template>

                <!-- The sheet of a tile: the message first -->
                <article v-else-if="tile" class="help-sheet" :key="'t-' + tile.id">
                    ${crumbHTML("{{familyById[tile.family].title}}", "tile.title")}
                    <div class="help-head"><div><h2 class="help-title">{{tile.title}}</h2><p class="help-sub">{{tile.sub}}</p></div><span class="help-thumb" v-html="picture(tile.picture)"></span></div>
                    <template v-if="tile.examples">
                        <!-- The format first: the parts of the messages of this kind, all of them; then the messages; then what is good to know -->
                        <h3 class="help-sec">The format</h3>
                        <div class="help-format"><code v-for="f in tile.format" :key="f">{{f}}</code></div>
                        <dl class="help-fields"><template v-for="f in tile.fields" :key="f[0]"><dt><code>{{f[0]}}</code></dt><dd>{{f[1]}}</dd></template></dl>
                        <h3 class="help-sec">{{tile.examples.length > 1 ? 'Step by step' : 'Example'}}<button v-if="sendable(tile.examples).length > 1" class="help-act" title="Send the messages of your device to the page, one after the other" @click="sendAll(tile.examples)"><i class="icofont-paper-plane"></i> Send all {{sendable(tile.examples).length}}</button></h3>
                        ${setupHTML}
                        <p v-if="tile.family == 'control'" class="help-msg-note">Sent from this panel, the messages come from a pretend device of the page ("Help panel", in Sources): it applies what you change and answers your calls, as your device would.</p>
                        <div v-if="tile.family == 'control' && !TP.state.commands" class="help-cmdoff"><span>Commands are off: sliders, buttons and the joystick are not drawn, nothing is sent to your device.</span><button class="help-primary" @click="run('cmd')" title="Commands on or off (C)">Switch on</button></div>
                        <template v-for="(ex, i) in tile.examples" :key="ex.title + ex.code">${cardHTML("ex", "tile.examples.length > 1 ? (i + 1) + '.' : ''", "knownBefore(tile.examples, i)")}</template>
                        <template v-if="tile.more">
                            <h3 class="help-sec">Other examples</h3>
                            <template v-for="ex in tile.more" :key="ex.title + ex.code">${cardHTML("ex", "''", "[]")}</template>
                        </template>
                        <template v-if="tile.notes">
                            <h3 class="help-sec">Good to know</h3>
                            <ul class="help-notes"><li v-for="n in tile.notes" :key="n">{{n}}</li></ul>
                        </template>
                        <template v-if="tile.viewOptions">
                            <h3 class="help-sec">Options of each view</h3>
                            <p class="help-msg-note">Written option=value in a DASH| line, as in the Edit panel. Booleans are true or false.</p>
                            <div v-for="t in viewOptionTables" :key="t.type" class="help-opts"><b>{{t.type}}</b>
                                <dl class="help-fields"><template v-for="o in t.options" :key="o.key"><dt><code>{{o.key}}</code></dt><dd>{{o.label}}: {{o.values}}</dd></template></dl>
                            </div>
                        </template>
                    </template>
                    <template v-else>
                        <h3 class="help-sec">How</h3>
                        <ul class="help-notes"><li v-for="n in tile.notes" :key="n">{{n}}</li></ul>
                        <p v-if="tile.keys" class="help-keys-line"><kbd v-for="k in tile.keys" :key="k">{{k}}</kbd></p>
                        <button v-if="tile.action" class="help-primary" @click="run(tile.action)">{{tile.actionLabel}}</button>
                    </template>
                    ${sheetFootHTML}
                </article>

                <!-- The sheet of a concept -->
                <article v-else-if="concept" class="help-sheet" :key="'c-' + concept.id">
                    ${crumbHTML("How Teleplot works", "concept.title")}
                    <h2 class="help-title">{{concept.title}}</h2>
                    <div class="help-schema" v-html="picture(concept.schema)"></div>
                    <p v-for="(p, i) in concept.text" :key="i" class="help-how">{{p}}</p>
                    ${sheetFootHTML}
                </article>

                <!-- The gallery -->
                <template v-else>

                    <template v-for="family in families" :key="family.id">
                        <h3 class="help-fam"><b>{{family.title}}</b><span>{{family.sub}}</span></h3>
                        <div class="help-gallery"><template v-for="tile in tilesByFamily[family.id]" :key="tile.id">${tileHTML("tile")}</template></div>
                    </template>

                    <h3 class="help-fam"><b>How Teleplot works</b><span>the ideas behind it</span></h3>
                    <div class="help-concepts">
                        <template v-for="c in concepts" :key="c.id">${conceptHTML("c")}</template>
                    </div>

                    <div class="help-foot">
                        <button class="help-primary ghost" @click="ctx.sampleRunning ? stopSample() : startSample()"><i :class="ctx.sampleRunning ? 'icofont-ui-pause' : 'icofont-ui-play'"></i> {{ctx.sampleRunning ? 'Stop sample data' : 'Preview sample data'}}</button>
                        <a href="https://github.com/nesnes/teleplot" target="_blank" rel="noopener">Documentation</a>
                    </div>
                    <details class="help-shortcuts"><summary>Shortcuts</summary>
                        <dl class="help-keys">
                            <template v-for="s in shortcuts" :key="s.keys"><dt><kbd>{{s.keys}}</kbd></dt><dd>{{s.label}}</dd></template>
                        </dl>
                    </details>
                </template>
            </div>

            <!-- Try a message without a device: always at hand, at the bottom; its parts are named as it is typed -->
            <div class="help-try">
                <div v-if="tryText.trim()" class="help-try-anat">${anatomyHTML("tryText", "[]")}</div>
                ${resultHTML("tryResult")}
                <div class="help-try-line">
                    <div class="help-try-field">
                        <div class="help-try-colors" ref="tryColors" aria-hidden="true"><span v-for="(p, i) in tryParts" :key="i" :class="p.kind ? 'help-k help-k-' + p.kind : ''">{{p.text}}</span></div>
                        <input ref="tryInput" type="text" v-model="tryText" spellcheck="false" autocomplete="off" placeholder="Try a message: temperature:25.3"
                            aria-label="A message to send to this page" @input="tryResult = null; syncTryScroll()" @scroll="syncTryScroll()" @keyup="syncTryScroll()"
                            @keydown.enter="sendTry()" @keydown.esc.stop="closeTry()">
                    </div>
                    <button class="help-try-send" :disabled="!tryText.trim()" title="Send this message to the page, as if a device had (Enter)" @click="sendTry()">Send</button>
                </div>
            </div>
        </div>
    `;

    const vueCSS = `
        .help-layout {
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            height: calc(100vh - 6.5rem);
            padding: 0.4rem 0.8rem 0.7rem 0.2rem;
            color: var(--color-text);
            --help-mono: ui-monospace, Consolas, monospace;
            /* Colors of the parts of a message (text, underlines, names) */
            --hk-name: hsl(204 64% 42%); --hk-value: hsl(145 55% 33%); --hk-time: hsl(170 70% 30%); --hk-unit: hsl(36 90% 38%); --hk-flags: hsl(282 44% 46%); --hk-label: hsl(220 25% 45%);
            /* Colors of the pictures (SVG): the palette of the library, and the theme */
            --hp-1: rgb(52, 152, 219); --hp-2: rgb(46, 204, 113); --hp-3: rgb(155, 89, 182); --hp-4: rgb(230, 126, 34); --hp-5: rgb(231, 76, 60);
            --hp-text: var(--color-text); --hp-muted: var(--color-text-muted); --hp-bg: var(--color-bg-light); --hp-line: var(--color-bg-dark);
            --hp-grid: color-mix(in srgb, var(--color-text) 9%, transparent); --hp-warn: var(--teleplot-warn, var(--color-warning)); --hp-ok: var(--color-success);
        }
        [data-theme="dark"] .help-layout { --hk-name: hsl(204 75% 64%); --hk-value: hsl(145 55% 55%); --hk-time: hsl(170 60% 52%); --hk-unit: hsl(40 90% 58%); --hk-flags: hsl(282 55% 72%); --hk-label: hsl(220 25% 72%); }
        .help-layout p { margin: 0 0 0.5rem; }
        .help-layout small { display: block; margin-top: 0.3rem; color: var(--color-text-muted); line-height: 1.35; }
        .help-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 0.2rem 0.3rem 0.8rem 0.2rem; margin: 0 -0.3rem 0 -0.2rem; }

        /* Find, and how data is sent: one place for the language, at the top */
        .help-tools { display: flex; flex-direction: column; gap: 0.45rem; padding-bottom: 0.6rem; }
        .help-search { display: flex; align-items: center; gap: 0.4rem; padding: 0 0.6rem; border: 1px solid var(--color-bg-dark); border-radius: 0.5rem; background: var(--color-bg-light); }
        .help-search:focus-within { border-color: var(--color-primary); }
        .help-search i { color: var(--color-text-muted); }
        .help-search input { flex: 1; min-width: 0; padding: 0.35rem 0; border: none; outline: none; background: none; color: var(--color-text); font: inherit; }
        .help-sender-pick { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .help-seg { flex: 1; display: flex; padding: 0.15rem; border-radius: 0.55rem; background: color-mix(in srgb, var(--color-text) 7%, transparent); }
        .help-seg button { flex: 1; padding: 0.25rem 0; border: none; border-radius: 0.45rem; background: none; color: var(--color-text-muted); font: inherit; font-weight: 600; cursor: pointer; }
        .help-seg button.on { background: var(--color-bg-light); color: var(--color-text); box-shadow: 0 1px 3px var(--color-shadow); }
        .help-seg button:focus-visible { outline: 2px solid var(--color-primary); }

        /* The gallery */
        .help-fam { display: flex; align-items: baseline; gap: 0.5rem; margin: 1rem 0 0.45rem; font-size: 1rem; font-weight: 400; }
        .help-fam:first-child { margin-top: 0.2rem; }
        .help-fam span { font-size: 0.85rem; color: var(--color-text-muted); }
        .help-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
        .help-tile {
            display: flex; flex-direction: column; align-items: stretch; gap: 0.1rem; padding: 0.45rem 0.5rem 0.5rem; text-align: left;
            border: 1px solid transparent; border-radius: 0.6rem; background: var(--color-bg-light); box-shadow: 0 0 3px var(--color-shadow);
            color: var(--color-text); font: inherit; cursor: pointer; transition: border-color var(--motion-fast), transform var(--motion-fast);
        }
        .help-tile:hover, .help-tile:focus-visible { border-color: var(--color-primary); outline: none; transform: translateY(-1px); }
        .help-tile .help-pic { display: block; margin-bottom: 0.3rem; border-radius: 0.35rem; overflow: hidden; background: var(--color-bg); aspect-ratio: 12 / 5; }
        .help-tile .help-pic svg { display: block; width: 100%; height: 100%; }
        .help-tile.page .help-pic { background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg)); }
        .help-tile-sub { font-size: 0.85rem; color: var(--color-text-muted); }


        .help-concepts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
        .help-concept { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.45rem 0.5rem 0.5rem; text-align: left; border: 1px solid var(--color-bg-dark); border-radius: 0.6rem; background: none; color: var(--color-text); font: inherit; cursor: pointer; }
        .help-concept:hover, .help-concept:focus-visible { border-color: var(--color-primary); outline: none; }
        .help-concept .help-pic { display: block; margin-bottom: 0.3rem; }
        .help-concept .help-pic svg { display: block; width: 100%; height: auto; }
        .help-concept > span:not(.help-pic) { font-size: 0.85rem; color: var(--color-text-muted); }
        .help-gallery + .help-concepts { margin-top: 0.55rem; }

        .help-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 1.2rem; }
        .help-foot a { color: var(--color-primary); }
        .help-shortcuts { margin-top: 0.7rem; }
        .help-layout summary { cursor: pointer; color: var(--color-text-muted); font-weight: 600; }
        .help-shortcuts .help-keys { margin-top: 0.5rem; }
        .help-nothing { display: flex; flex-direction: column; gap: 0.3rem; padding: 1.2rem 0.8rem; text-align: center; color: var(--color-text-muted); }
        .help-nothing b { color: var(--color-text); font-size: 1.05rem; }

        /* A sheet, in place of the gallery: the message first */
        .help-sheet { animation: help-in var(--motion-fast) var(--ease-out); }
        @keyframes help-in { from { opacity: 0; transform: translateX(0.6rem); } }
        @media (prefers-reduced-motion: reduce) { .help-sheet { animation: none; } }
        .help-crumb { position: sticky; top: -0.2rem; z-index: 3; display: flex; align-items: center; gap: 0.5rem; margin: -0.2rem -0.3rem 0 -0.2rem; padding: 0.3rem 0.3rem 0.3rem 0.2rem;
            background: var(--color-bg-panel); border-bottom: 1px solid transparent; color: var(--color-text-muted); font-size: 0.9rem; }
        .help-crumb:has(.help-crumb-title) { border-bottom-color: var(--color-bg-dark); }
        .help-crumb-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }
        .help-crumb-place { white-space: nowrap; }
        .help-crumb-nav { display: flex; gap: 0.1rem; margin-left: auto; }
        .help-crumb-nav button:disabled { opacity: 0.3; cursor: default; }
        .help-sheet-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; margin-top: 1.4rem; padding-top: 0.7rem; border-top: 1px solid var(--color-bg-dark); }
        .help-next { margin-left: auto; }
        .help-crumb button { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.15rem 0.45rem 0.15rem 0.2rem; border: none; border-radius: 0.4rem; background: none; color: var(--color-primary); font: inherit; font-weight: 600; cursor: pointer; }
        .help-crumb button:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
        .help-head { display: flex; align-items: center; gap: 0.8rem; margin: 0.3rem 0 0.2rem; }
        .help-head > div { flex: 1; min-width: 0; }
        .help-title { margin: 0; font-size: 1.4rem; font-weight: 700; }
        .help-layout p.help-sub { margin: 0.15rem 0 0; color: var(--color-text-muted); }
        .help-thumb { flex: none; width: 8rem; border-radius: 0.45rem; overflow: hidden; background: var(--color-bg-light); box-shadow: 0 0 3px var(--color-shadow); }
        .help-thumb svg { display: block; width: 100%; height: auto; }
        .help-schema { margin: 0.5rem 0 0.8rem; padding: 0.4rem; border-radius: 0.6rem; background: var(--color-bg-light); box-shadow: 0 0 3px var(--color-shadow); }
        .help-schema svg { display: block; width: 100%; height: auto; max-height: 15rem; }
        .help-sec { display: flex; align-items: center; gap: 0.5rem; margin: 1.1rem 0 0.5rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--color-text-muted); }
        .help-sec .help-act { margin-left: auto; text-transform: none; letter-spacing: 0; }
        .help-how { line-height: 1.5; }
        /* The format: the general form of the messages, then every part of them */
        .help-format { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.55rem 0.7rem; border-radius: 0.55rem; background: var(--color-bg-light); border: 1px solid var(--color-bg-dark); }
        .help-format code { font-family: var(--help-mono); font-size: 0.85rem; overflow-wrap: anywhere; white-space: pre-wrap; }
        .help-fields { display: grid; grid-template-columns: minmax(5.5rem, max-content) 1fr; gap: 0.35rem 0.7rem; margin: 0.6rem 0 0; font-size: 0.9rem; line-height: 1.4; }
        .help-fields dt code { font-family: var(--help-mono); font-size: 0.82rem; color: var(--hk-name); overflow-wrap: anywhere; }
        .help-fields dd { margin: 0; }
        .help-notes { margin: 0; padding-left: 1.1rem; line-height: 1.45; }
        .help-notes li + li { margin-top: 0.3rem; }
        .help-opts { margin-top: 0.7rem; }
        .help-opts > b { font-family: var(--help-mono); font-size: 0.9rem; }
        .help-keys-line { display: flex; gap: 0.3rem; }
        .help-setup { margin: 0.2rem 0 0.6rem; font-size: 0.9rem; }
        .help-setup > :not(summary) { margin-top: 0.4rem; }

        /* A message: a card, its parts named under them, then the command of the language, small */
        .help-msg { padding: 0.75rem 0.8rem 0.55rem; border-radius: 0.65rem; background: var(--color-bg-light); border: 1px solid var(--color-bg-dark); }
        .help-msg + .help-msg { margin-top: 0.6rem; }
        .help-layout p.help-msg-note { margin: 0 0 0.55rem; line-height: 1.4; }
        .help-n { margin-right: 0.35rem; color: var(--color-primary); }
        .help-layout .help-way { display: flex; align-items: baseline; gap: 0.1rem; margin: 0 0 0.3rem; font-size: 1rem; }
        .help-way .help-optional { margin-left: 0.5rem; }
        .help-card-pic { float: right; width: 8.5rem; max-width: 40%; margin: 0 0 0.3rem 0.6rem; } /* What this message gives (a shape of a view) */
        .help-msg::after { content: ""; display: block; clear: both; }
        /* What the page sends to your device: the same card, marked, turned the other way (no Send: the page sends it when you use the control) */
        .help-msg.help-msg-page { border-style: dashed; border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-bg-dark)); background: color-mix(in srgb, var(--color-primary) 4%, var(--color-bg-light)); }
        .help-from-page { margin-left: 0.5rem; padding: 0 0.45rem; border-radius: 0.6rem; background: color-mix(in srgb, var(--color-primary) 14%, transparent); color: var(--color-primary); font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
        .help-sent { margin-top: 0.45rem; padding-top: 0.4rem; border-top: 1px dashed var(--color-bg-dark); font-size: 0.85rem; color: var(--color-text-muted); }
        .help-sent code { font-family: var(--help-mono); color: var(--color-text); overflow-wrap: anywhere; }
        .help-cmdoff { display: flex; align-items: center; gap: 0.6rem; margin: 0.6rem 0; padding: 0.5rem 0.7rem; border-radius: 0.55rem; background: color-mix(in srgb, var(--color-success) 10%, var(--color-bg-light)); font-size: 0.9rem; line-height: 1.35; }
        .help-cmdoff span { flex: 1; }
        .help-optional { display: inline-block; margin-right: 0.4rem; padding: 0 0.4rem; border: 1px solid var(--color-bg-dark); border-radius: 0.6rem; color: var(--color-text-muted); font-size: 0.75rem; font-weight: 600; vertical-align: 0.05rem; }
        .help-anat { position: relative; display: flex; flex-wrap: wrap; align-items: flex-start; row-gap: 0.55rem; font: 1.2rem/1.2 var(--help-mono); }
        .help-part { display: inline-flex; flex-direction: column; align-items: center; min-width: 0; outline: none; }
        .help-part-t { white-space: pre-wrap; word-break: break-all; color: var(--hk); font-weight: 600; }
        .help-part.sep .help-part-t { color: var(--color-text-muted); font-weight: 400; }
        .help-part:not(.sep) .help-part-t { border-bottom: 2px solid var(--hk); padding-bottom: 0.08rem; }
        .help-part:not(.sep) { cursor: help; }
        .help-part.on .help-part-t, .help-part:focus-visible .help-part-t { background: color-mix(in srgb, var(--hk) 15%, transparent); border-radius: 0.2rem 0.2rem 0 0; }
        .help-part-l { margin-top: 0.2rem; font: 0.66rem/1 Verdana, Geneva, Tahoma, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: var(--hk); white-space: nowrap; }
        .help-k-name { --hk: var(--hk-name); } .help-k-value { --hk: var(--hk-value); } .help-k-time { --hk: var(--hk-time); } .help-k-unit { --hk: var(--hk-unit); } .help-k-flags { --hk: var(--hk-flags); } .help-k-label { --hk: var(--hk-label); }
        .help-tip {
            position: absolute; z-index: 5; box-sizing: border-box; width: min(18rem, 100%); padding: 0.45rem 0.6rem; pointer-events: none;
            border: 1px solid var(--color-bg-dark); border-left: 3px solid var(--hk); border-radius: 0.4rem; background: var(--color-bg-light); box-shadow: 0 4px 14px var(--color-shadow);
            font: 0.85rem/1.4 Verdana, Geneva, Tahoma, sans-serif; white-space: normal;
        }
        .help-tip b { display: inline-block; color: var(--hk); margin-right: 0.2rem; }
        .help-tip b::first-letter { text-transform: uppercase; } /* (capitalize would also raise the letters after a colon: r:G:B) */
        .help-cmd { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; padding-top: 0.45rem; border-top: 1px dashed var(--color-bg-dark); }
        .help-cmd-lang { flex: none; font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted); }
        .help-cmd code { flex: 1; min-width: 0; font: 0.78rem/1.4 var(--help-mono); color: var(--color-text-muted); white-space: pre-wrap; word-break: break-all; }
        .help-cmd code .msg { color: var(--color-text); }
        .help-cmd-acts { flex: none; display: flex; align-items: center; gap: 0.1rem; }
        .help-act, .help-icon { height: 1.5rem; display: inline-flex; align-items: center; gap: 0.25rem; padding: 0 0.45rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--color-primary); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
        .help-icon { width: 1.6rem; padding: 0; justify-content: center; color: var(--color-text-muted); font-weight: 400; }
        .help-act:hover, .help-act:focus-visible, .help-icon:hover, .help-icon:focus-visible { background: color-mix(in srgb, var(--color-text) 9%, transparent); outline: none; }
        .help-act.done, .help-icon.done { color: var(--color-success); }
        .help-result { display: flex; gap: 0.45rem; align-items: baseline; margin-top: 0.45rem; font-size: 0.9rem; line-height: 1.35; }
        .help-result i { flex: none; display: inline-grid; place-items: center; width: 1.05rem; height: 1.05rem; border-radius: 50%; background: var(--color-success); color: #fff; font-size: 0.65rem; }
        .help-result.bad i { background: var(--color-danger); }
        .help-layout small.help-missing { color: var(--color-text); }
        .help-code { position: relative; }
        .help-code code { display: block; padding: 0.4rem 2rem 0.4rem 0.55rem; border-radius: 0.35rem; background: var(--color-bg-light); font: 0.82rem/1.5 var(--help-mono); white-space: pre-wrap; word-break: break-all; }
        .help-code .help-icon { position: absolute; top: 0.25rem; right: 0.25rem; }

        .help-primary { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.9rem; border: 1px solid var(--color-primary); border-radius: 0.55rem; background: var(--color-primary); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
        .help-primary.ghost { background: transparent; color: var(--color-primary); }
        .help-primary.ghost:hover { background: var(--color-primary); color: #fff; }

        /* Colors of the field to try a message (backgrounds: the text itself is drawn by the input) */
        .help-k { border-radius: 0.22rem; background: color-mix(in srgb, var(--hk) 22%, transparent); }

        /* The field to try a message, at the bottom */
        .help-try { flex: none; padding-top: 0.55rem; border-top: 1px solid var(--color-bg-dark); }
        .help-try-anat { max-height: 9rem; overflow-y: auto; margin-bottom: 0.5rem; }
        .help-try-anat .help-anat { font-size: 1rem; }
        .help-try .help-result { margin: 0 0 0.45rem; }
        .help-try-line { display: flex; gap: 0.4rem; }
        .help-try-field { position: relative; flex: 1; min-width: 0; background: var(--color-bg-light); border-radius: 0.4rem; }
        .help-try-field input, .help-try-colors { box-sizing: border-box; width: 100%; margin: 0; padding: 0.35rem 0.55rem; font: 0.95rem/1.4 var(--help-mono); letter-spacing: 0; white-space: pre; border: 1px solid var(--color-bg-dark); border-radius: 0.4rem; }
        .help-try-colors { position: absolute; inset: 0; overflow: hidden; border-color: transparent; color: var(--color-text); pointer-events: none; }
        .help-try-field input { position: relative; background: transparent; color: transparent; caret-color: var(--color-text); outline: none; }
        .help-try-field input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent); }
        .help-try-field input::placeholder { color: var(--color-text-muted); font-family: Verdana, Geneva, Tahoma, sans-serif; font-size: 0.92rem; opacity: 1; }
        .help-try-send { padding: 0 0.9rem; border: 1px solid var(--color-primary); border-radius: 0.5rem; background: var(--color-primary); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
        .help-try-send:disabled { border-color: var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text-muted); cursor: default; }

        .help-keys { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 0.8rem; align-items: center; margin: 0; }
        .help-keys dt, .help-keys dd { margin: 0; }
        .help-layout kbd { font: 0.9rem var(--help-mono); padding: 0.05rem 0.45rem; border: 1px solid var(--color-bg-dark); border-radius: 0.35rem; background: var(--color-bg-light); }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    const SENDER_KEY = "teleplot.help.sender";
    const remembered = () => { try { return localStorage.getItem(SENDER_KEY); } catch (e) { return null; } };
    const pictures = {}; // SVG of a picture, by kind (drawn once)
    const partsCache = new Map(); // Parts of a message, by message
    const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
    const tileById = byId(HELP_TILES), familyById = byId(HELP_FAMILIES), conceptById = byId(HELP_CONCEPTS);
    const tilesByFamily = Object.fromEntries(HELP_FAMILIES.map((f) => [f.id, HELP_TILES.filter((t) => t.family == f.id)]));
    // What a search looks in: the words of a tile (its texts and messages) or of a concept
    const searched = (texts) => texts.join(" ").toLowerCase();
    const tileWords = Object.fromEntries(HELP_TILES.map((t) => [t.id, searched([t.title, t.sub, ...(t.notes || []), ...(t.format || []), ...(t.fields || []).flat(), familyById[t.family].title, ...[...(t.examples || []), ...(t.more || [])].flatMap((e) => [e.title, e.code, e.note])])]));
    const conceptWords = Object.fromEntries(HELP_CONCEPTS.map((c) => [c.id, searched([c.title, c.sub, ...c.text])]));

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            const editor = Vue.inject("editor");
            // Constants of the panel: not reactive
            return { TP, ctx, editor, families: HELP_FAMILIES, concepts: HELP_CONCEPTS, senders: HELP_SENDERS, shortcuts: HELP_SHORTCUTS, tileById, familyById, tilesByFamily };
        },
        data() {
            return {
                sender: HELP_SENDERS.some((s) => s.id == remembered()) ? remembered() : "sh", // How the user sends data (remembered)
                open: null,      // {tile} or {concept}: the sheet shown in place of the gallery
                scrolled: false, // The heading of the sheet is out of sight: its title goes to the bar at the top
                query: "",       // What is searched (local: nothing redraws over it)
                hover: null,     // {code, index}: the part of a message that is pointed at
                tryText: "",     // The message typed in the field at the bottom
                tryResult: null, // {ok, text}: what Teleplot made of the last message sent from the field
                results: {},     // What Teleplot made of each message sent with its Send button, by message
                varied: {},      // The message shown for an example after it was sent: its values nudged (helpVary), so that sending again shows a change
                copied: "",      // The text that was just copied (the button confirms for a moment)
                now: Date.now(), // The time of the page, for the {now} of the messages (every second)
            }
        },
        computed: {
            currentSender() { return this.senders.find((s) => s.id == this.sender); },
            tryParts() { return this.parts(this.tryText); },
            tile() { return this.open && this.open.tile ? tileById[this.open.tile] : null; },
            // The sheets before and after the one shown, in the order of the gallery (tiles by family, then the concepts): {prev, next}
            neighbours() {
                const list = this.tile ? HELP_FAMILIES.flatMap((f) => tilesByFamily[f.id]).map((t) => ({ kind: "tile", id: t.id, title: t.title }))
                    : HELP_CONCEPTS.map((c) => ({ kind: "concept", id: c.id, title: c.title }));
                const id = this.tile ? this.tile.id : (this.concept ? this.concept.id : undefined);
                const index = list.findIndex((p) => p.id === id);
                return index < 0 ? {} : { prev: list[index - 1], next: list[index + 1] };
            },
            // The options of every type of view, as the views describe them (the Edit panel shows the same): always complete
            viewOptionTables() {
                if (!this._viewOptions) this._viewOptions = helpViewOptions(Vue.toRaw(this.TP));
                return this._viewOptions;
            },
            concept() { return this.open && this.open.concept ? conceptById[this.open.concept] : null; },
            found() {
                const terms = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
                const match = (text) => terms.every((term) => text.includes(term));
                return {
                    tiles: HELP_TILES.filter((t) => match(tileWords[t.id])),
                    concepts: HELP_CONCEPTS.filter((c) => match(conceptWords[c.id])),
                };
            },
        },
        mounted() {
            this.refresh();
            this._refreshTimer = setInterval(() => this.refresh(), 1000);
        },
        watch: {
            // Asked from elsewhere (the welcome page): the language to write the lines for, a tile to open. Taken once.
            "ctx.helpRequest": {
                handler(request) {
                    if (!request) return;
                    if (request.sender && HELP_SENDERS.some((s) => s.id == request.sender)) this.setSender(request.sender);
                    if (request.tile && tileById[request.tile]) this.openTile(request.tile);
                    this.ctx.helpRequest = null;
                },
                immediate: true,
            },
        },
        unmounted() { clearTimeout(this._copiedTimer); clearTimeout(this._showTimer); clearInterval(this._refreshTimer); },
        methods: {
            refresh() {
                this.now = Date.now();
            },
            picture(kind) { return pictures[kind] || (pictures[kind] = helpPicture(kind)); },
            short(text) { return helpShort(text); },
            parts(message) {
                if (!partsCache.has(message)) { if (partsCache.size > 200) partsCache.clear(); partsCache.set(message, helpParts(message)); }
                return partsCache.get(message);
            },
            // The names already given by the messages before this one in the sheet ("label=text"): not repeated
            knownBefore(examples, index) { return examples.slice(0, index).flatMap((e) => this.parts(e.code).filter((p) => p.label).map((p) => p.label + "=" + p.text)); },
            // The tooltip goes under the part, centered on it but kept within the message
            setHover(code, index, event) {
                const part = event.currentTarget, anat = part.parentElement;
                const width = Math.min(anat.clientWidth, 18 * parseFloat(getComputedStyle(document.documentElement).fontSize));
                const left = Math.max(0, Math.min(anat.clientWidth - width, part.offsetLeft + part.offsetWidth / 2 - width / 2));
                this.hover = { code, index, style: { left: left + "px", top: (part.offsetTop + part.offsetHeight + 4) + "px" } };
            },
            isHover(code, index) { return !!this.hover && this.hover.code === code && this.hover.index === index; },
            hoverPart(code) { return this.hover && this.hover.code === code ? this.parts(code)[this.hover.index] : null; },
            hoverTip(code) { const p = this.hoverPart(code); return p && (HELP_PART_TIPS[p.label] || HELP_PART_TIPS[p.kind] || ""); },
            // From the gallery, where it was is kept: back() goes back there
            leaveGallery() { if (!this.open && this.$refs.scroll) this.galleryScroll = this.$refs.scroll.scrollTop; },
            openTile(id) { this.leaveGallery(); this.query = ""; this.hover = null; this.open = { tile: id }; this.top(); },
            openConcept(id) { this.leaveGallery(); this.query = ""; this.open = { concept: id }; this.top(); },
            go(place) { if (place) (place.kind == "tile" ? this.openTile(place.id) : this.openConcept(place.id)); },
            back() {
                this.open = null; this.hover = null; this.scrolled = false;
                const at = this.galleryScroll || 0;
                this.$nextTick(() => { if (this.$refs.scroll) this.$refs.scroll.scrollTop = at; });
            },
            onScroll() { const scrolled = !!this.open && this.$refs.scroll.scrollTop > 70; if (scrolled !== this.scrolled) this.scrolled = scrolled; },
            onMouseUp(event) { if (event.button === 3 && this.open) { event.preventDefault(); this.back(); } }, // (the back button of a mouse)
            top() { this.$nextTick(() => { if (this.$refs.scroll) this.$refs.scroll.scrollTop = 0; }); },
            startSample() { startSampleData(this.TP, this.ctx); },
            stopSample() { stopSampleData(this.ctx); },
            setSender(id) {
                this.sender = id;
                try { localStorage.setItem(SENDER_KEY, id); } catch (e) { /* (private browsing...: not remembered) */ }
            },
            codeOf(example) { return example.from == "page" ? example.code : (this.varied[example.code] || example.code); }, // (with {now}; what the page sends is never nudged by a Send)
            shown(example) { return helpFill(this.codeOf(example), this.now); },
            current(example) { const code = this.shown(example); return code === example.code ? example : { ...example, code, cpp: example.cpp && helpVaryParts(example.cpp, helpFill(example.code, this.now), code) }; },
            line(example) { return helpLine(this.sender, this.current(example)); },
            text(example) { return this.line(example).parts.map((p) => p.text).join(""); },
            copy(text) {
                if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                this.copied = text;
                clearTimeout(this._copiedTimer);
                this._copiedTimer = setTimeout(() => { this.copied = ""; }, 1200);
            },
            // What a tile of the page opens
            run(action) {
                const ctx = this.ctx;
                if (action == "telemetries" || action == "sources") ctx.sidePanel = action;
                else if (action == "export") ctx.exportOpen = true;
                else if (action == "rate") ctx.topPanel = "rate";
                else if (action == "cmd") this.TP.commands.setEnabled(!this.TP.state.commands);
                else if (action == "edit" && ctx.activeDashboard) { this.editor.setRoot(ctx.activeDashboard.getView()); this.editor.setEnabled(true); }
            },
            // The field at the bottom: a message is put in it ("Edit"), changed, sent to the page
            tryMessage(code) {
                this.tryText = code;
                this.tryResult = null;
                this.$nextTick(() => { if (this.$refs.tryInput) { this.$refs.tryInput.focus(); this.syncTryScroll(); } });
            },
            describe(code) {
                if (this.TP.state.isPaused) return { ok: false, text: "Data is paused: resume (Space) and send again." };
                return helpDescribe(this.TP, code, helpSend(this.TP, code)); // (from the device of the Help: commands have somewhere to go)
            },
            sendTry() {
                const message = this.tryText.trim();
                if (message) this.tryResult = this.describe(message);
            },
            // "Send" of a message: it goes to the page right away, and the result is said under it
            // Then it is shown again changed (the next text of its cycle, or its numbers nudged), and the dashboard that displays it comes to the front
            sendExample(example) {
                const code = this.codeOf(example), sent = helpFill(code);
                this.results = { ...this.results, [example.code]: this.describe(sent) };
                const cycle = example.cycle && [example.code, ...example.cycle];
                this.varied = { ...this.varied, [example.code]: cycle ? cycle[(cycle.indexOf(code) + 1) % cycle.length] : helpVary(code) };
                this.refresh();
                clearTimeout(this._showTimer);
                this._showTimer = setTimeout(() => this.showDashboardOf(sent), 250); // (after the dashboards placed what is new: 100 ms)
            },
            // The dashboard that displays a message: the one of a DASH| line, else one with a view of its telemetry (the one shown when it does)
            showDashboardOf(message) {
                if (this.editor.state.enabled) return;
                const dashboards = this.TP.dashboards.dashboards;
                let name;
                if (message.startsWith("DASH|")) { const line = this.TP.dashboards.parseLine(message); name = line && line.name; }
                else {
                    const named = helpParts(message).find((p) => p.label == "name");
                    const telem = named && this.TP.datastore.getTelemetry(named.text);
                    if (!telem) return;
                    const frame = this.TP.view.ViewScene3D.pixelFrame(telem); // Drawn on a picture: where the picture is
                    const target = frame !== undefined ? this.TP.datastore.findByName(frame) : telem;
                    if (!target) return;
                    const ids = [target.id, target.getAttribute(this.TP.protocol.TELEM_ATTR_NAME)];
                    const shows = (dashboard) => {
                        const visit = (view) => !!view && (Array.isArray(view.views) ? view.views.some(visit) : (view.telemetryIdOrNameList || []).some((id) => ids.includes(id)));
                        return visit(dashboard.getView());
                    };
                    const active = this.ctx.activeDashboard && dashboards[this.ctx.activeDashboard.name];
                    if (active && shows(active)) return;
                    const found = Object.values(dashboards).find(shows);
                    name = found && found.name;
                }
                if (name && dashboards[name] && (!this.ctx.activeDashboard || this.ctx.activeDashboard.name != name)) this.ctx.activeDashboard = dashboards[name];
            },
            sendable(examples) { return examples.filter((example) => example.from != "page"); },
            sendAll(examples) { this.sendable(examples).forEach((example) => this.sendExample(example)); },
            // The last line this page sent to the telemetry of an example of the page (logged in "commands.sent"), "" when none yet
            lastSent(example) {
                this.now; // (read again every second: the data store is not reactive)
                const named = helpParts(example.code).find((p) => p.label == "name");
                const log = named && Vue.toRaw(this.TP).datastore.getTelemetry("commands.sent");
                const entry = log && log.data[this.TP.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
                if (!entry) return "";
                for (let i = entry.data[0].length - 1; i >= 0; i--) {
                    const line = String(entry.data[0][i]);
                    if (line.startsWith(named.text + ":") || line.startsWith("!" + named.text + "#") || line == "!" + named.text) return line;
                }
                return "";
            },
            closeTry() {
                this.tryText = ""; this.tryResult = null;
                if (this.$refs.tryInput) this.$refs.tryInput.blur();
            },
            syncTryScroll() { if (this.$refs.tryColors && this.$refs.tryInput) this.$refs.tryColors.scrollLeft = this.$refs.tryInput.scrollLeft; }, // The colors follow a long line
        },
        template: vueHTML,
    });
}
