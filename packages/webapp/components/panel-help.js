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
 * device (helpDescribe says what was understood). Design studies: doc/help-gallery-mockups.html (idea 3 of
 * doc/help-panel-mockups-4.html), then doc/help-sheet-mockups.html (the message first).
 */

// Families of tiles, in the order of the gallery
const HELP_FAMILIES = [
    { id: "numbers", title: "Numbers", sub: "the basics" },
    { id: "text", title: "Text over time", sub: "states, logs, what runs" },
    { id: "space", title: "Space", sub: "positions, shapes, scans" },
    { id: "pictures", title: "Pictures", sub: "images and cameras" },
    { id: "dashboards", title: "Dashboards", sub: "where things go" },
    { id: "control", title: "Control", sub: "from the page to your device" },
    { id: "page", title: "In the page", sub: "with the mouse and the keyboard" },
];

// The picture of the help: 64 x 48 pixels, a cone on a floor (a camera of the scene "scene")
const HELP_PICTURE = "PNG|camera,scene:iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAMAAACWlYwtAAAAD1BMVEXP6P+Kj5jmfiLAOSv///9A9kpQAAAAVElEQVR42u3MQQrAIBBDUfud+5+5uChF6BQhIgTmb0Nea1VVGYY9AJgDIAoyECP1rwgqECEKPG0HrrV4mwcbADLBBYBUOANALiwA/aujwH8FFDC6AfBCBoyP9FOtAAAAAElFTkSuQmCC";

// Every result Teleplot gives. `examples` are the lines to send, in order (a recipe): each tile is complete by itself (it never needs
// what another tile sent), every line shows something on a dashboard when it can, and sending it again shows a change (numbers are
// nudged by helpVary, texts go through `cycle`). `more` are other ways, folded, each with a short `title`. In a `code`, {now} is the time
// of the page in ms (helpFill), so that times given by a message are recent. `code` is exactly what to send (checked against the
// library's parser in tests/help.test.js). `cpp` is the same with the C++ client, for what its sample (clients/cpp/sample.cpp) shows.
// Tiles of the page have no message: `keys` and `action` (what their button opens).
const HELP_TILES = [
    { id: "curve", family: "numbers", title: "A curve", sub: "a number over time", picture: "chart",
      how: "A name, a colon, a value: that is a whole message. Send it again whenever the value changes: each one is a point of the curve, dated when it arrives. It goes to the Live dashboard by itself.",
      examples: [
        { code: "temperature:25.3", note: "It is charted as it arrives, at the time it arrives. Send it again: a new point.", expect: { name: "temperature", type: "number" },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [");"]] },
      ], more: [
        { title: "A unit", code: "temperature:25.3§°C", note: "After §: displayed next to the value.", expect: { name: "temperature", type: "number", unit: "°C" },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [", std::nullopt, { .unit = \""], ["°C", "unit"], ["\" });"]] },
        { title: "Your own time", code: "temperature:{now}:25.3", note: "Before the value, in milliseconds since 1970 (here the time of this page): without one, a value is dated when it arrives.", expect: { name: "temperature", type: "number", timestamp: 1627551892.437 },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [", "], ["timestamp", "time"], [");  // std::chrono::nanoseconds"]] },
        { title: "Several values", code: "temperature:{now-200}:25.1;{now-100}:25.4;{now}:25.2", note: "Several samples in one message, separated by semicolons: nothing is lost between two sends.", expect: { name: "temperature", type: "number", samples: 3 } },
        { title: "Start again", code: "temperature:25.3|clr", note: "The clr flag forgets what the telemetry held before this value (a new run, for example).", expect: { name: "temperature", type: "number", samples: 1 } },
      ] },
    { id: "together", family: "numbers", title: "Shown together", sub: "a label groups them", picture: "chart2",
      how: "A label after the name, behind a comma, says what belongs together: telemetries with the same label share a view of the Live dashboard, titled with the label. It works with every kind of message. In the Telemetries panel, a label is one card to drag them all at once.",
      examples: [
        { code: "left,motors:0.4", note: "The label is motors: a chart titled motors.", expect: { name: "left", type: "number", label: "motors" } },
        { code: "right,motors:0.38", note: "Same label: this one joins the chart of the first.", expect: { name: "right", type: "number", label: "motors" } },
      ], more: [
        { title: "Kept apart", code: "debug:42|np", note: "The np flag: the telemetry stays out of the Live dashboard (it is in the Telemetries panel) until you add it to a view yourself.", expect: { name: "debug", type: "number", autoplot: false } },
      ] },
    { id: "gauge", family: "numbers", title: "A gauge", sub: "a range and limits", picture: "gauge",
      how: "ATTR| describes a telemetry: here what it is expected between. Send it once, before the first value: a number with both ends of its range is shown as a gauge, its value with a bar (a chart can take the range as its scale too). TH| is optional: limits with a name; past one, the value says which one, in its color, and charts draw them as dashed lines.",
      examples: [
        { code: "ATTR|battery|min=9|max=12.6", note: "The range: from 9 to 12.6. Nothing shows yet: it describes the values to come.", expect: { name: "battery", range: [9, 12.6] } },
        { code: "battery:10.2§V", note: "The number itself, as usual: shown as a gauge.", expect: { name: "battery", type: "number", unit: "V" } },
        { code: "TH|battery:low<10.5:empty<9.9,red", optional: true, note: "Limits: a name, < or > (the side that is past the limit), a value, and a color if you want one. Past one, the value says which one.", expect: { name: "battery", thresholds: ["empty<9.9,red", "low<10.5"] } },
      ], more: [
        { title: "A limit that changes", code: "TH|battery:{now}:low<10.8", note: "With a time (before its name) a limit holds from then on, and what was drawn before keeps the limit it had. low< without a value removes it.", expect: { name: "battery", thresholds: ["low<10.8"] } },
      ] },
    { id: "state", family: "text", title: "A state", sub: "the latest text", picture: "text",
      how: "The t flag: a text whose latest value matters (a mode, a status). It lasts until a different text comes: the same text sent again continues it. An empty text is a state too: nothing.",
      examples: [
        { code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "A state, shown as a value. Send again: the next state.", expect: { name: "mode", type: "text", text: "driving", logText: undefined, view: "values" } },
      ], more: [
        { title: "Your own time", code: "mode:{now}:turning|t", cycle: ["mode:{now}:parked|t", "mode:{now}:driving|t"], note: "With its own time, like a number.", expect: { name: "mode", type: "text", timestamp: 1627551892.437 } },
        { title: "Nothing", code: "mode:|t", note: "An empty text: no state. On a timeline it leaves a hole.", expect: { name: "mode", type: "text", text: "" } },
      ] },
    { id: "log", family: "text", title: "A log", sub: "lines to read in order", picture: "log",
      how: "The log flag: lines to read one after the other, shown in a Log view. Logs without a label share one log view; with a label, the logs of several parts of a system are read together. Hover a line: every view goes to its time.",
      examples: [
        { code: "nav,logs:Path clear|log", cycle: ["nav,logs:Obstacle ahead|log", "nav,logs:Turning left|log"], note: "A line of the log of nav, with the label logs: a Log view titled logs.", expect: { name: "nav", type: "text", logText: true, view: "log", label: "logs" } },
        { code: ">:Motors armed", cycle: [">:Motors disarmed"], note: "A line starting with > goes to the general log, without a name.", expect: { log: true } },
      ] },
    { id: "timeline", family: "text", title: "A timeline", sub: "when states changed", picture: "timeline",
      how: "A timeline has a lane per telemetry: a band per state, a tick per log line, and for a number with thresholds a band where it is past a limit. It is a view you ask for: in Edit mode (+), or with a DASH| line. Drag to zoom, as on a chart.",
      examples: [
        { code: "DASH|Robot/States:timeline:mode", note: "A Timeline view States in the dashboard Robot, with a lane for mode.", expect: { dashboard: "Robot" } },
        { code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "A state: a band from this message until the state changes. Send again: the next state, the next band.", expect: { name: "mode", type: "text", text: "driving" } },
      ] },
    { id: "marks", family: "text", title: "Marks on a chart", sub: "events over curves", picture: "marks",
      how: "In a chart, a text telemetry has no curve: it is drawn as marks, a line where the state changes with its text next to it (for a log, a mark per line). Drop a text telemetry on a chart, or name it in a DASH| line.",
      examples: [
        { code: "DASH|Robot/Drive:chart:velocity,mode", note: "A chart Drive in the dashboard Robot, for velocity and mode.", expect: { dashboard: "Robot" } },
        { code: "velocity:1.2", note: "The curve.", expect: { name: "velocity", type: "number" } },
        { code: "mode:driving|t", cycle: ["mode:turning|t", "mode:parked|t"], note: "A mark where the state changes. Send again: the next state, a new mark.", expect: { name: "mode", type: "text", text: "driving" } },
      ] },
    { id: "stack", family: "text", title: "What runs", sub: "a profiler of your code", picture: "stack",
      how: "To see what a program spends its time in, send the path of what is running: a state whose text has a slash between levels. A timeline draws a row per level, like a profiler. Send a message each time something starts or ends; hover a band: what it is, what it runs in, and for how long.",
      examples: [
        { code: "task:loop|stack", note: "The stack flag: the text is a path. Here one level: loop is running.", expect: { name: "task", type: "text", text: "loop", stack: true, view: "timeline" } },
        { code: "task:loop/plan|stack", note: "plan starts, in loop: one level deeper. loop goes on: it stays one band, with plan under it.", expect: { name: "task", type: "text", text: "loop/plan", stack: true } },
        { code: "task:loop/plan/search|stack", note: "As deep as needed. When search is over, send loop/plan again.", expect: { name: "task", type: "text", text: "loop/plan/search", stack: true } },
        { code: "task:|stack", note: "An empty text: nothing runs.", expect: { name: "task", type: "text", text: "", stack: true } },
      ], more: [
        { title: "Your own time", code: "task:{now}.25:loop/plan|stack", note: "The time of the device, before the path: milliseconds, with decimals when it measures finer than that. Short calls need it.", expect: { name: "task", type: "text", timestamp: 1627551892.43725, stack: true } },
        { title: "Where you want", code: "DASH|Robot/Tasks:timeline:task|stackDepth=4", note: "A stack gets a timeline by itself on the Live dashboard; this line puts one in the dashboard Robot. stackDepth: how many rows of full height its lane opens to.", expect: { dashboard: "Robot" } },
      ] },
    { id: "trail", family: "space", title: "A trail", sub: "x and y over time", picture: "xy",
      how: "Two numbers and the xy flag: a position instead of a curve, shown on a map (a 2D view) with the trail of where it went. Three numbers and xyz: a point in space, in a 3D view.",
      examples: [
        { code: "position:12.5:4.2|xy", note: "A position. Send again: it moves, its trail follows.", expect: { name: "position", type: "2d", view: "2d" } },
      ], more: [
        { title: "Your own time", code: "position:12.5:4.2:{now}|xy", note: "The time, when there is one, comes after the coordinates.", expect: { name: "position", type: "2d", timestamp: 1627551892.437 } },
        { title: "In space", code: "drone:1.5:0.2:3|xyz", note: "Three numbers and xyz: a point in space, with the trail of its last positions.", expect: { name: "drone", type: "3d" } },
      ] },
    { id: "map", family: "space", title: "A map", sub: "2D shapes", picture: "map",
      how: "A line starting with 2D| draws shapes seen from above: rect, circle, line, polygon, arrow, text. P: position (x:y), R: one angle in radians, W and H: width and height, C and O: color and opacity. Send everything once, then only what changes. Flat shapes also lie on the ground of a 3D view.",
      examples: [
        { code: "2D|robot,field:S:rect:P:1.2:0.8:R:0.5:W:0.3:H:0.2:C:blue", note: "A rectangle, turned by 0.5 rad. The label field puts the shapes on one map.", expect: { name: "robot", shape: "rect", position: [1.2, 0.8, 0], label: "field", view: "2d" } },
        { code: "2D|route,field:S:line:PT:0:0:1:0.5:2:2:3:2:C:green", note: "PT: the points of a line, as many x:y as needed. It is as thin as the screen draws; add LW:0.2 for a real width, in your units.", expect: { name: "route", shape: "line", label: "field", view: "2d" } },
        { code: "2D|robot:P:1.5:1:R:0.8", note: "Later: only what changes. Send again: it moves.", expect: { name: "robot", shape: "rect", position: [1.5, 1, 0] } },
      ], more: [
        { title: "A surface", code: "2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3", note: "A polygon is the surface inside its points.", expect: { name: "zone", shape: "polygon", label: "field", view: "2d" } },
        { title: "A text", code: "2D|goal,field:S:text:P:3:2:TX:\"Goal A\"", note: "TX: a text, at a position. TS:0.2 gives it a height in your units; without, it keeps a readable size.", expect: { name: "goal", shape: "text", position: [3, 2, 0], label: "field", view: "2d" } },
      ] },
    { id: "scene", family: "space", title: "A 3D scene", sub: "shapes in space", picture: "3d",
      how: "A line starting with 3D| describes a shape by its properties: S its kind (cube, sphere, cylinder, stl), P its position, R (roll, pitch, yaw in radians) or Q (a quaternion) its orientation, its size, C its color, O its opacity. x is forward, y to the left, z up. Send everything once, then only what changes.",
      examples: [
        { code: "3D|box,scene:S:cube:P:1:0:0.5:W:1:D:1:H:1:C:orange", note: "W, D, H: width, depth, height.", expect: { name: "box", shape: "cube", position: [1, 0, 0.5], label: "scene" } },
        { code: "3D|ball,scene:S:sphere:P:0:1:0.3:RA:0.3:C:red:O:0.5", note: "RA: radius. The same label puts both shapes in one scene.", expect: { name: "ball", shape: "sphere", position: [0, 1, 0.3], label: "scene" } },
        { code: "3D|box:P:2:0:0.5:R:0:0:1.57", note: "Later: only the position and the rotation. Send again: it moves.", expect: { name: "box", shape: "cube", position: [2, 0, 0.5] } },
      ] },
    { id: "frames", family: "space", title: "Moving together", sub: "relative to another", picture: "frames",
      how: "With F, the positions of a shape are relative to another telemetry: when that one moves or turns, what is in its frame follows, without being sent again. Describe the parts of a robot once, then move only its body. A frame can be in a frame; it works the same in 3D| lines, for points and for point clouds.",
      examples: [
        { code: "2D|robot,field:S:rect:P:1.2:0.8:R:0.5:W:0.3:H:0.2:C:blue", note: "The body of a robot, on a map.", expect: { name: "robot", shape: "rect", position: [1.2, 0.8, 0], label: "field", view: "2d" } },
        { code: "2D|heading,field:S:arrow:V:0.4:0:F:robot", note: "V: the vector of an arrow. F: it is in the frame of the robot: it starts at the robot and points where it looks.", expect: { name: "heading", shape: "arrow", label: "field", frame: "robot", view: "2d" } },
        { code: "2D|bumper,field:S:rect:P:0.2:0:W:0.05:H:0.25:C:black:F:robot", note: "Its position is in the frame: 0.2 in front of the robot.", expect: { name: "bumper", shape: "rect", label: "field", frame: "robot", view: "2d" } },
        { code: "2D|robot:P:1.5:1:R:0.8", note: "Move the body only: the arrow and the bumper follow. Send again: it moves again.", expect: { name: "robot", shape: "rect", position: [1.5, 1, 0] } },
      ] },
    { id: "cloud", family: "space", title: "A lidar scan", sub: "a cloud of points", picture: "cloud",
      how: "The pc flag: all the points of the line are one sample, x:y:z each, in the frame of the sensor. A flat scan sets z to 0: it is shown in a 2D view. Where the sensor is, sent like the position of a shape under the same name: each scan is drawn where the sensor was.",
      examples: [
        { code: "lidar:1:0:0;0.7:0.7:0;0:1:0;-0.7:0.7:0;-1:0:0|pc", note: "Five points. Send again: a new scan.", expect: { name: "lidar", cloud: 5, view: "2d" } },
        { code: "3D|lidar:P:1:2:0.2:R:0:0:1.57", note: "Where the sensor is: the scan moves with it.", expect: { name: "lidar", position: [1, 2, 0.2] } },
      ], more: [
        { title: "Intensities", code: "lidar:1:0:0:0.9;0.7:0.7:0:0.4;0:1:0:0.1|pc", note: "A fourth value is an intensity: points are colored from the lowest to the highest. Or a color: x:y:z:r:g:b.", expect: { name: "lidar", cloud: 3, intensity: true, view: "2d" } },
      ] },
    { id: "picture", family: "pictures", title: "A picture", sub: "an image, as text", picture: "image",
      how: "PNG| or JPG|, a name, and the file in base64. An image view shows the picture of the time shown: drag on a chart and the picture follows.",
      examples: [
        { code: HELP_PICTURE, note: "A small picture, 64 x 48 pixels: a cone on a floor.", expect: { name: "camera", image: true, label: "scene" } },
      ] },
    { id: "pixels", family: "pictures", title: "Boxes on a picture", sub: "in its pixels", picture: "pixels",
      how: "FPX: a frame, the pixels of the pictures of an image telemetry (u to the right, v down). What a detector finds is drawn on the picture without knowing anything about the camera; the picture itself is never changed.",
      examples: [
        { code: HELP_PICTURE, note: "A picture to draw on: a cone on a floor, 64 x 48 pixels.", expect: { name: "camera", image: true, label: "scene" } },
        { code: "2D|found:S:rect:P:44:26:W:22:H:28:C:red:O:0.25:LW:1:FPX:camera", note: "A box around the cone: its center at pixel 44, 26, 22 pixels wide and 28 high.", expect: { name: "found", shape: "rect", pixels: "camera" } },
        { code: "2D|found.name:S:text:P:33:8:TX:\"cone 0.92\":C:red:FPX:camera", note: "A text, the same way. TS:6 would make it 6 pixels of the picture high.", expect: { name: "found.name", shape: "text", pixels: "camera" } },
      ] },
    { id: "camera", family: "pictures", title: "Through a camera", sub: "the scene over the picture", picture: "camera",
      how: "With the parameters of the camera of a picture, what is in the scene is drawn over it, and the camera shows in the scene. Sent to the name of the image: K gives fx, fy, cx, cy, width and height in pixels, P (and R or Q) where the camera is, looking along its x. DC is the distortion of its lens: what is drawn follows the curves of the picture.",
      examples: [
        { code: HELP_PICTURE, note: "The picture, in the scene scene (its label).", expect: { name: "camera", image: true, label: "scene" } },
        { code: "3D|marker,scene:S:sphere:P:3:0:0.3:RA:0.3:C:red", note: "Something in the scene, 3 in front of the camera.", expect: { name: "marker", shape: "sphere", position: [3, 0, 0.3], label: "scene" } },
        { code: "3D|camera:K:55:55:32:24:64:48:P:0:0:1", note: "The camera of the picture, 1 above the ground: the sphere is drawn over the picture. Send again: the camera moves.", expect: { name: "camera", camera: true } },
        { code: "3D|camera:DC:-0.26:0.07:0:0:0", note: "The distortion of its lens (k1, k2, p1, p2, k3).", expect: { name: "camera", distortion: [-0.26, 0.07, 0, 0, 0] } },
      ] },
    { id: "dashboard", family: "dashboards", title: "Your dashboard", sub: "views where you want", picture: "dashboard",
      how: "A DASH| line describes a view by its path (the dashboard, then the view), its type (chart, values, log, timeline, 2d, 3d, image, joystick), the telemetries it shows (they do not have to exist yet) and options. A longer path nests the view in layouts (row, column, grid or stack). The same lines are what the dashboard menu exports.",
      examples: [
        { code: "DASH|Robot/Power:chart:voltage|w=4|h=3", note: "A chart Power in the dashboard Robot, 4 columns wide and 3 rows high, for voltage.", expect: { dashboard: "Robot" } },
        { code: "voltage:12.1", note: "Its data.", expect: { name: "voltage", type: "number" } },
        { code: "DASH|Robot/side/Events:log:events|maxLines=50", note: "A log in a layout side, created on the way.", expect: { dashboard: "Robot" } },
        { code: "events:Started|log", cycle: ["events:Docked|log", "events:Charging|log"], note: "Its data.", expect: { name: "events", type: "text", logText: true } },
      ], more: [
        { title: "A layout", code: "DASH|Robot/side:column", note: "A layout has a line too: row, column, grid or stack. Lines can come in any order.", expect: { dashboard: "Robot" } },
        { title: "Remove a view", code: "DASH|Robot/Power:none", note: "The type none removes it.", expect: { dashboard: "Robot" } },
      ] },
    { id: "place", family: "dashboards", title: "Choose where", sub: "a label that is a path", picture: "place",
      how: "A label that is a path places the telemetry: the dashboard, a slash, the view. Both are created if needed, one view per kind of data, and the telemetry stays off the Live dashboard.",
      examples: [
        { code: "speed,Robot/Motion:1.2", note: "speed goes to the chart Motion of the dashboard Robot.", expect: { name: "speed", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
        { code: "accel,Robot/Motion:0.3", note: "Same path: it joins the same chart.", expect: { name: "accel", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
      ] },
    { id: "settings", family: "control", title: "Settings", sub: "values the page can change", picture: "controls",
      how: "write: the page may change it. With commands on (CMD, in the top menu), its value can be edited where it is displayed: a slider, a switch, a list of choices. The page sends the line your device would send; keep sending the value: when it comes back as asked, the page knows it was applied. Your device may refuse with ACK|name:err:why.",
      examples: [
        { code: "ATTR|speed_limit|write|min=0|max=2|step=0.1", note: "A number from 0 to 2: a slider. The page sends speed_limit:1.5.", expect: { name: "speed_limit", write: "number" } },
        { code: "speed_limit:1.2", note: "The value, as usual, whenever it is applied.", expect: { name: "speed_limit", type: "number" } },
      ], more: [
        { title: "Among choices", code: "ATTR|drive_mode|write|choices=auto,manual,idle", note: "A text among choices: a click on its value opens them.", expect: { name: "drive_mode", write: "text" } },
        { title: "Its value", code: "drive_mode:auto|t", cycle: ["drive_mode:manual|t", "drive_mode:idle|t"], note: "The choice that is applied.", expect: { name: "drive_mode", type: "text", text: "auto" } },
      ] },
    { id: "actions", family: "control", title: "Buttons", sub: "functions of your device", picture: "actions",
      how: "action: a button (confirm: it asks first; longpress: it must be held; color=red). The page sends a call and its number, !reset#12; your device answers run when it starts, then ok or err:why, and the page shows how long it ran. Arguments are declared one line each, in order: the button opens a form, and the call names them (!goto#13:target=1.5,2). A call sent again with the same number must not run twice: answer again.",
      examples: [
        { code: "ATTR|reset|action|title=Reset odometry|confirm", note: "A button that asks first.", expect: { name: "reset", action: true } },
        { code: "ACK|reset#12:ok", cycle: ["ACK|reset#13:ok", "ACK|reset#14:err:not now"], note: "What your device answers to the call #12.", expect: { name: "reset", answer: "#12 ok" } },
      ], more: [
        { title: "Another action", code: "ATTR|goto|action|title=Go to", note: "A button Go to...", expect: { name: "goto", action: true } },
        { title: "Its argument", code: "ATTR|goto|arg=target|type=xy|desc=Where to go", note: "...with an argument: its button opens a form. optional, default, min, max, unit, choices... can follow.", expect: { name: "goto", args: ["target"] } },
      ] },
    { id: "joystick", family: "control", title: "A joystick", sub: "drive it", picture: "joystick",
      how: "rate and hold: a setting driven continuously, by a joystick view. While the pad is held the page sends the value rate times per second; your device stops by itself when nothing came for hold milliseconds. axes says what the pad moves (here forward speed and turn).",
      examples: [
        { code: "ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200", note: "Forward and turn, 20 times per second: a joystick view.", expect: { name: "cmd_vel", write: "pose2d", view: "joystick" } },
        { code: "cmd_vel:0.3:0:0.2|xyz", note: "What your device applies: shown on the pad. Send again: it moves.", expect: { name: "cmd_vel", type: "3d" } },
      ] },
    { id: "pose", family: "control", title: "A pose on the map", sub: "move it, turn it", picture: "pose",
      how: "A writable pose2d (x, y and an angle in radians) is drawn as a pose on a 2D view. With commands on, drag its ghost to move it and its handle to turn it, then Send (or Enter). Your device publishes the pose it has with |xyz.",
      examples: [
        { code: "ATTR|target|write=pose2d", note: "A pose the page can set: a map.", expect: { name: "target", write: "pose2d" } },
        { code: "target:1.2:0.8:0.5|xyz", note: "The pose your device has: x, y, angle. Send again: it moves.", expect: { name: "target", type: "3d" } },
      ] },
    { id: "telemetries", family: "page", title: "Your telemetries", sub: "find them, drag them", picture: "telemetries", keys: ["T"], action: "telemetries", actionLabel: "Open the Telemetries panel",
      how: "The Telemetries panel lists what was received, with its rate. Drag a telemetry (or the card of a label) onto a view to add it, or between views to make a new one." },
    { id: "edit", family: "page", title: "Arrange", sub: "Edit mode", picture: "edit", keys: ["E", "Esc"], action: "edit", actionLabel: "Edit this dashboard",
      how: "Press E (or Edit): drag views by their handle, resize them, add views and layouts with +, change their options in the panel on the right. Esc leaves." },
    { id: "zoom", family: "page", title: "Zoom and compare", sub: "a moment, a time range", picture: "zoom", keys: ["Esc"],
      how: "Drag across a chart or a timeline: every view of the dashboard shows that range, and the cursor shows the same moment everywhere (3D scenes and pictures included). Double click (or Esc) goes back to live. Time groups (Edit mode) keep some views apart." },
    { id: "files", family: "page", title: "Save and open", sub: "export, import", picture: "files", keys: ["X"], action: "export", actionLabel: "Open Export and import",
      how: "Export and import: data, dashboards or both, as a binary file, lines of text or CSV, all of it or a time range. Drop a file on the page to open it." },
    { id: "memory", family: "page", title: "Keep more or less", sub: "data window, memory", picture: "memory", keys: ["Space"], action: "rate", actionLabel: "Open the data menu",
      how: "The rate in the top menu opens the data menu: how long data is kept (5 minutes by default), how much memory it may take, and what happens when it is full. Space pauses: data that comes meanwhile is ignored." },
    { id: "serial", family: "page", title: "A serial port", sub: "no server needed", picture: "serial", keys: ["S"], action: "sources", actionLabel: "Open Sources",
      how: "Sources, Add a source, Serial port (Chrome, Edge): lines starting with > are telemetry, the others a log of the port. Its console sends text back." },
    { id: "cmd", family: "page", title: "Commands on", sub: "the CMD button", picture: "cmd", keys: ["C"], action: "cmd", actionLabel: "Switch commands on or off",
      how: "Shown in the top menu when a device declares settings or actions. Off at every start: nothing is sent and no control is drawn, so a screen on a wall stays a screen. C switches it." },
];
const HELP_EXAMPLES = HELP_TILES.flatMap((tile) => [...(tile.examples || []), ...(tile.more || [])]);

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
        "A sample is dated when it arrives, unless the message gives its own time. Views show live data, or, while you zoom or point at a moment, that moment.",
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
    else if (kind == "frames") s = `<g transform="translate(${W * 0.45},${H * 0.55}) rotate(-15)"><rect x="-32" y="-15" width="64" height="30" rx="4" fill="var(--hp-1)" opacity="0.85"/>${[[-26, -21], [12, -21], [-26, 15], [12, 15]].map(([x, y]) => `<rect x="${x}" y="${y}" width="14" height="6" rx="2" fill="var(--hp-text)"/>`).join("")}<path d="M32 0 h24" stroke="var(--hp-4)" stroke-width="2"/><path d="M56 0 l-7 -4 v8z" fill="var(--hp-4)"/></g>` + t(6, H - 6, "wheels and arrow: in the frame of the body", 'font-size="9" fill="var(--hp-muted)"');
    else if (kind == "cloud") { for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, r = 22 + (i % 7) * 2 + Math.abs(Math.cos(a * 2)) * 12; s += `<circle cx="${(W / 2 + Math.cos(a) * r * 1.7).toFixed(1)}" cy="${(H / 2 + Math.sin(a) * r * 0.9).toFixed(1)}" r="1.3" fill="hsl(${i * 3} 70% 55%)"/>`; } s += `<circle cx="${W / 2}" cy="${H / 2}" r="4" fill="var(--hp-text)"/>`; }
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
    { id: "cpp", name: "C++", sub: "Teleplot.h", setup: "#include \"Teleplot.h\"\n// ... update() calls, then:\nTeleplot::instance().flush();", setupNote: "One header, in clients/cpp. flush() sends what update() queued: call it regularly." },
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
        ["RA", "radius", "radius", 1], ["PR", "precision", "precision", 1], ["K", "intrinsics", "camera", 6], ["DC", "distortion", "distortion", 5], ["PT", "points", "points", "*"],
        ["V", "vector", "vector", 3, 2], ["TX", "text", "text", 1], ["LW", "linewidth", "line width", 1], ["TS", "textsize", "text size", 1], ["F", "frame", "frame", 1], ["FPX", "pixels", "pixels of", 1]];
    const map = {};
    for (const [short, long, label, count, flat] of names) map[short] = map[long] = { label, count, flat: flat || count };
    return map;
})();
// Keys of ATTR| lines
const HELP_ATTRIBUTES = { min: "lowest", max: "highest", write: "writable", action: "action", title: "button text", confirm: "asks first", longpress: "hold to press",
    color: "color", arg: "argument", type: "type", optional: "optional", default: "default", step: "step", unit: "unit", choices: "choices", desc: "description",
    rate: "per second", hold: "stops after (ms)", axes: "axes" };
const HELP_FLAGS = { t: "state", log: "log", xy: "2D point", xyz: "3D point", pc: "point cloud", np: "not charted", clr: "clear first", stack: "stack" };

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
    const prefix = /^(3D|2D|JPG|PNG)\|/.exec(rest);
    if (prefix) {
        add(prefix[0], "flags", prefix[1] == "3D" ? "3D shape" : (prefix[1] == "2D" ? "2D shape" : prefix[1] + " image"));
        rest = rest.slice(prefix[0].length);
        const colon = rest.indexOf(":");
        nameAndLabel(colon < 0 ? rest : rest.slice(0, colon));
        if (colon < 0) return parts;
        sep(":");
        const body = rest.slice(colon + 1);
        if (prefix[1] == "JPG" || prefix[1] == "PNG") { add(body, "value", "picture in base64"); return parts; }
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
        const points = flags.includes("xyz") ? 3 : (flags.includes("xy") ? 2 : 0);
        if (isText) { // [time:]text (the text may hold colons)
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
                add(sample, "value", named ? "" : "x:y:z"); named = true;
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
    time: "Optional: milliseconds since 1970 (decimals allowed). Without it, the sample is dated when it arrives.",
    unit: "Optional, after §: shown next to the value.",
    text: "Any text, colons included. The same text again continues the state; an empty text is \"nothing\".",
    "log line": "Any text, colons included: one line of the log.",
    path: "What runs, levels separated by /. An empty text: nothing runs.",
    "x:y": "Two numbers: x and y, in your units.",
    "x:y:z": "Three numbers: x forward, y to the left, z up.",
    state: "The t flag: a text whose latest value matters.",
    log: "Lines to read in order, shown in a Log view.",
    "2D point": "The xy flag: two numbers make a position, drawn on a map with its trail.",
    "3D point": "The xyz flag: three numbers make a point in space.",
    "point cloud": "The pc flag: all the points of the line are one sample, a whole scan.",
    "not charted": "The np flag: not put on the Live dashboard by itself.",
    "clear first": "The clr flag: what the telemetry held before is forgotten.",
    stack: "The stack flag: the text is the path of what is running.",
    flags: "Optional, after the last |: t, log, stack, xy, xyz, pc, np, clr.",
    "3D shape": "3D| then the name, then properties, each a key and its values.",
    "2D shape": "2D| is 3D| written flat: x:y positions, one angle.",
    kind: "S: cube, sphere, cylinder, stl; flat: rect, circle, line, polygon, arrow, text.",
    position: "P: x:y:z (2D: x:y), in your units.",
    rotation: "R: roll, pitch, yaw in radians (2D: one angle).",
    quaternion: "Q: w:x:y:z.",
    color: "A color name (red, orange...) or #rrggbb.",
    opacity: "O: from 0 (invisible) to 1.",
    width: "W: along x, in your units.", depth: "D: along y, in your units.", height: "H: along z (2D: along y), in your units.", radius: "RA: in your units.",
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
    "view type": "chart, values, log, timeline, 2d, 3d, image, joystick; row, column, grid, stack; none removes it.",
    telemetries: "The names of the telemetries it shows, separated by commas: they do not have to exist yet.",
    option: "An option of the view: w, h, title, or one of its settings.",
    answer: "ACK| your device's answer to a call of the page.",
    "call number": "#: the number of the call the page sent (!name#12).",
    result: "run (started), ok[:text] or err:why.",
    "PNG image": "PNG| (or JPG|) then the name and the picture.", "JPG image": "JPG| (or PNG|) then the name and the picture.",
    "picture in base64": "The file, encoded in base64. A big one can be cut in parts.",
    "button text": "title=: the text of the button (default: the name).", "asks first": "confirm: the button asks before calling.", "hold to press": "longpress: the button must be held.",
    type: "type=: number, bool, text, xy, xyz or pose2d.", optional: "optional: the argument may be left empty.", default: "default=: the value the form starts with.",
    step: "step=: what the value moves by.", choices: "choices=: the texts it can take, separated by commas.", description: "desc=: a sentence shown as a tooltip.",
    "per second": "rate=: how many times per second the page sends it while it is held.", "stops after (ms)": "hold=: your device stops by itself when nothing came for that long.",
    axes: "axes=: what a joystick moves, for example x,yaw.", attribute: "A key=value field.",
    file: "U: the URL of an stl file.", texture: "T: an image telemetry used as its picture.", precision: "PR: how many faces a round shape has.",
    "text size": "TS: the height of a text, in your units.", "line width": "LW: the width of a line, in your units.",
};

// The line that sends a message, for a sender: {parts: [{text, kind, msg}], note}. The message (msg: true) is in the middle of what wraps
// it; `note` says what the line needs to be told (a message the C++ client has no call for).
function helpLine(senderId, example) {
    const message = helpParts(example.code).map((p) => ({ text: p.text, kind: p.kind, msg: true }));
    const wrap = (before, parts, after) => ({ parts: [{ text: before, kind: "", msg: false }, ...parts, { text: after, kind: "", msg: false }], note: "" });
    if (senderId == "sh") return wrap("echo \"", message, "\" | nc -u -w0 127.0.0.1 47269");
    if (senderId == "py") return wrap("sock.sendto(\"", message, "\".encode(), (\"127.0.0.1\", 47269))");
    if (senderId == "ino") {
        // On a serial port a line is a log unless it starts with ">": a log is the text alone, anything else gets the ">"
        if (example.code.startsWith(">")) return wrap("Serial.println(\"", [{ text: example.code.slice(example.code.indexOf(":") + 1), kind: "value", msg: true }], "\");");
        return wrap("Serial.println(\">", message, "\");");
    }
    if (example.cpp) return { parts: example.cpp.map(([text, kind]) => ({ text, kind: kind || "", msg: !!kind })), note: "" };
    return { parts: message, note: "No example with the C++ client for this one yet: send this line as text over UDP (port 47269)." };
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
    const prefix = /^(3D|2D|JPG|PNG)\|/.exec(message);
    const body = prefix ? message.slice(prefix[0].length) : message;
    const bar = body.lastIndexOf("|");
    const flags = bar >= 0 ? body.slice(bar + 1) : "";
    const name = body.slice(0, body.indexOf(":")).split(",")[0];
    const telem = TP.datastore.getTelemetry(name);
    const P0 = TP.protocol;
    const described = telem && (telem.getAttribute(P0.TELEM_ATTR_SHAPE) !== undefined || telem.getAttribute(P0.TELEM_ATTR_FRAME) !== undefined); // (a shape can be nothing but its kind)
    if (!telem || (!Object.keys(telem.data).length && !described)) return { ok: false, text: "Nothing was stored for \"" + name + "\": check the values of the line." };
    const P = TP.protocol;
    let what = "a number";
    if (prefix && (prefix[1] == "3D" || prefix[1] == "2D")) {
        const isCamera = telem.data[P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS] || telem.data[P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION];
        what = isCamera ? "the camera of the image" : (TP.view.ViewScene3D.isCloud(telem) ? "the pose of the sensor of the point cloud" : (TP.view.ViewScene3D.isPoint(telem) ? "the frame of the point" : (prefix[1] == "2D" ? "a 2D shape" : "a 3D shape")));
    }
    else if (prefix) what = "an image";
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
                :tabindex="p.label ? 0 : -1" @mouseenter="p.label && setHover(${code}, pi, $event)" @focus="setHover(${code}, pi, $event)" @blur="hover = null"><span class="help-part-t">{{p.text}}</span><span class="help-part-l">{{p.label && !(${known}).includes(p.label + '=' + p.text) ? p.label : '\\u00a0'}}</span></span>
            <div v-if="hoverTip(${code})" class="help-tip" role="tooltip" :class="'help-k-' + hoverPart(${code}).kind" :style="hover.style"><b>{{hoverPart(${code}).label}}</b> {{hoverTip(${code})}}</div>
        </div>`;
    // The command of the language: small, the message in it in the color of the text
    const commandHTML = (ex) => `
        <div class="help-cmd">
            <span class="help-cmd-lang">{{currentSender.name}}</span>
            <code><span v-for="(p, i) in line(${ex}).parts" :key="i" :class="{msg: p.msg}">{{p.text}}</span></code>
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
    const conceptHTML = (item) => `<button class="help-concept" @click="openConcept(${item}.id)"><span class="help-pic" v-html="picture(${item}.schema)"></span><b>{{${item}.title}}</b><span>{{${item}.sub}}</span></button>`;
    const cardHTML = (ex, number, known) => `
        <div class="help-msg">
            <h4 v-if="${ex}.title" class="help-way">{{${ex}.title}}</h4>
            <p v-if="${ex}.note" class="help-msg-note"><b v-if="${number}" class="help-n">{{${number}}}</b><span v-if="${ex}.optional" class="help-optional">optional</span>{{${ex}.note}}</p>
            ${anatomyHTML(`shown(${ex})`, known)}
            ${commandHTML(ex)}
            ${resultHTML(`results[${ex}.code]`)}
        </div>`;
    const setupHTML = `<details v-if="currentSender.setup" class="help-setup"><summary>Set up {{currentSender.name}}, once</summary>
            <div class="help-code"><code>{{currentSender.setup}}</code>
                <button class="help-icon" :class="{done: copied == currentSender.setup}" title="Copy" aria-label="Copy the set-up" @click="copy(currentSender.setup)"><i :class="copied == currentSender.setup ? 'icofont-check' : 'icofont-copy'"></i></button>
            </div>
            <small>{{currentSender.setupNote}}</small>
        </details>`;

    const vueHTML = `
        <div class="help-layout">
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

            <div class="help-scroll" ref="scroll">
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
                    <nav class="help-crumb"><button @click="back()"><i class="icofont-simple-left"></i> All</button><span>{{familyById[tile.family].title}}</span></nav>
                    <div class="help-head"><div><h2 class="help-title">{{tile.title}}</h2><p class="help-sub">{{tile.sub}}</p></div><span class="help-thumb" v-html="picture(tile.picture)"></span></div>
                    <template v-if="tile.examples">
                        <h3 class="help-sec">{{tile.examples.length > 1 ? 'The messages' : 'The message'}}<button v-if="tile.examples.length > 1" class="help-act" title="Send these messages to the page, one after the other" @click="sendAll(tile.examples)"><i class="icofont-paper-plane"></i> Send all {{tile.examples.length}}</button></h3>
                        ${setupHTML}
                        <div v-if="tile.family == 'control' && !TP.state.commands" class="help-cmdoff"><span>Commands are off: sliders, buttons and the joystick are not drawn, nothing is sent to your device.</span><button class="help-primary" @click="run('cmd')" title="Commands on or off (C)">Switch on</button></div>
                        <template v-for="(ex, i) in tile.examples" :key="ex.code">${cardHTML("ex", "tile.examples.length > 1 ? (i + 1) + '.' : ''", "knownBefore(tile.examples, i)")}</template>
                        <h3 class="help-sec">How it works</h3>
                        <p class="help-how">{{tile.how}}</p>
                        <details v-if="tile.more" class="help-more"><summary>More ways: {{tile.more.map((m) => m.title.toLowerCase()).join(' · ')}}</summary>
                            <template v-for="ex in tile.more" :key="ex.code">${cardHTML("ex", "''", "[]")}</template>
                        </details>
                    </template>
                    <template v-else>
                        <h3 class="help-sec">How</h3>
                        <p class="help-how">{{tile.how}}</p>
                        <p v-if="tile.keys" class="help-keys-line"><kbd v-for="k in tile.keys" :key="k">{{k}}</kbd></p>
                        <button v-if="tile.action" class="help-primary" @click="run(tile.action)">{{tile.actionLabel}}</button>
                    </template>
                </article>

                <!-- The sheet of a concept -->
                <article v-else-if="concept" class="help-sheet" :key="'c-' + concept.id">
                    <nav class="help-crumb"><button @click="back()"><i class="icofont-simple-left"></i> All</button><span>How Teleplot works</span></nav>
                    <h2 class="help-title">{{concept.title}}</h2>
                    <div class="help-schema" v-html="picture(concept.schema)"></div>
                    <p v-for="(p, i) in concept.text" :key="i" class="help-how">{{p}}</p>
                </article>

                <!-- The gallery -->
                <template v-else>
                    <div v-if="!hasData" class="help-hero">
                        <span class="help-hero-k">Start here</span>
                        <b>A curve: send one number</b>
                        <div class="help-msg">${anatomyHTML("shown(start)", "[]")}${commandHTML("start")}${resultHTML("results[start.code]")}</div>
                        <div class="help-hero-acts">
                            <button class="help-act" @click="openTile('curve')">How it works</button>
                            <button class="help-act" @click="openConcept('flow')">How Teleplot works</button>
                        </div>
                    </div>

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

        .help-hero { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.7rem 0.8rem; border-radius: 0.7rem; border: 1px solid color-mix(in srgb, var(--color-primary) 40%, transparent); background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-light)); }
        .help-hero-k { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-primary); }
        .help-hero > b { font-size: 1.1rem; }
        .help-hero-acts { display: flex; flex-wrap: wrap; gap: 0.3rem; }

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
        .help-crumb { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); font-size: 0.9rem; }
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
        .help-keys-line { display: flex; gap: 0.3rem; }
        .help-setup, .help-more { margin: 0.2rem 0 0.6rem; font-size: 0.9rem; }
        .help-setup > :not(summary) { margin-top: 0.4rem; }
        .help-more > .help-msg { margin-top: 0.6rem; }

        /* A message: a card, its parts named under them, then the command of the language, small */
        .help-msg { padding: 0.75rem 0.8rem 0.55rem; border-radius: 0.65rem; background: var(--color-bg-light); border: 1px solid var(--color-bg-dark); }
        .help-msg + .help-msg { margin-top: 0.6rem; }
        .help-hero .help-msg { border-color: transparent; }
        .help-layout p.help-msg-note { margin: 0 0 0.55rem; line-height: 1.4; }
        .help-n { margin-right: 0.35rem; color: var(--color-primary); }
        .help-layout .help-way { margin: 0 0 0.3rem; font-size: 0.95rem; }
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
        .help-tip b { color: var(--hk); text-transform: capitalize; margin-right: 0.2rem; }
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
    const tileWords = Object.fromEntries(HELP_TILES.map((t) => [t.id, searched([t.title, t.sub, t.how, familyById[t.family].title, ...[...(t.examples || []), ...(t.more || [])].flatMap((e) => [e.code, e.note])])]));
    const conceptWords = Object.fromEntries(HELP_CONCEPTS.map((c) => [c.id, searched([c.title, c.sub, ...c.text])]));

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            const editor = Vue.inject("editor");
            // Constants of the panel: not reactive
            return { TP, ctx, editor, families: HELP_FAMILIES, concepts: HELP_CONCEPTS, senders: HELP_SENDERS, shortcuts: HELP_SHORTCUTS, tileById, familyById, tilesByFamily,
                start: HELP_TILES[0].examples[0] }; // (the very first message to send)
        },
        data() {
            return {
                sender: HELP_SENDERS.some((s) => s.id == remembered()) ? remembered() : "sh", // How the user sends data (remembered)
                open: null,      // {tile} or {concept}: the sheet shown in place of the gallery
                query: "",       // What is searched (local: nothing redraws over it)
                hover: null,     // {code, index}: the part of a message that is pointed at
                tryText: "",     // The message typed in the field at the bottom
                tryResult: null, // {ok, text}: what Teleplot made of the last message sent from the field
                results: {},     // What Teleplot made of each message sent with its Send button, by message
                varied: {},      // The message shown for an example after it was sent: its values nudged (helpVary), so that sending again shows a change
                copied: "",      // The text that was just copied (the button confirms for a moment)
                now: Date.now(), // The time of the page, for the {now} of the messages (every second)
                hasData: false,  // Something was received: no more "Start here" (checked every second: the data store is not reactive)
            }
        },
        computed: {
            currentSender() { return this.senders.find((s) => s.id == this.sender); },
            tryParts() { return this.parts(this.tryText); },
            tile() { return this.open && this.open.tile ? tileById[this.open.tile] : null; },
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
        unmounted() { clearTimeout(this._copiedTimer); clearTimeout(this._showTimer); clearInterval(this._refreshTimer); },
        methods: {
            refresh() {
                const TP = Vue.toRaw(this.TP);
                const hasData = !!TP.datastore && Object.values(TP.datastore.telemetries).some((t) => t.hasContent());
                if (hasData !== this.hasData) this.hasData = hasData;
                this.now = Date.now();
            },
            picture(kind) { return pictures[kind] || (pictures[kind] = helpPicture(kind)); },
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
            openTile(id) { this.query = ""; this.hover = null; this.open = { tile: id }; this.top(); },
            openConcept(id) { this.query = ""; this.open = { concept: id }; this.top(); },
            back() { this.open = null; this.hover = null; this.top(); },
            top() { this.$nextTick(() => { if (this.$refs.scroll) this.$refs.scroll.scrollTop = 0; }); },
            startSample() { startSampleData(this.TP, this.ctx); },
            stopSample() { stopSampleData(this.ctx); },
            setSender(id) {
                this.sender = id;
                try { localStorage.setItem(SENDER_KEY, id); } catch (e) { /* (private browsing...: not remembered) */ }
            },
            codeOf(example) { return this.varied[example.code] || example.code; }, // (with {now})
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
                return helpDescribe(this.TP, code, this.TP.parseDataText(code));
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
            sendAll(examples) { examples.forEach((example) => this.sendExample(example)); },
            closeTry() {
                this.tryText = ""; this.tryResult = null;
                if (this.$refs.tryInput) this.$refs.tryInput.blur();
            },
            syncTryScroll() { if (this.$refs.tryColors && this.$refs.tryInput) this.$refs.tryColors.scrollLeft = this.$refs.tryInput.scrollLeft; }, // The colors follow a long line
        },
        template: vueHTML,
    });
}
