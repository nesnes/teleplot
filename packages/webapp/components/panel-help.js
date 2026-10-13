/*
 * Help panel (left): how to send data, the shortcuts, the sample data.
 * The first screen a newcomer sees (nothing displayed yet) is welcome.js.
 *
 * Sending data is a ladder: numbered steps from one number to images (shapes in 3D and in 2D, frames, point clouds on the way), each with the line to send written for the way the user sends
 * data (a terminal, Python, C++, an Arduino: chosen once with the tiles, remembered). In every line the parts of the message keep
 * their color (name, value, time, unit, flags). A field at the top sends a message to the page itself, to try without a device: it
 * is one quiet line until it is used. Design study: doc/help-panel-mockups.html, -2 and -3.
 */

// Every message format worth knowing, in the order they are worth learning. `code` is exactly what to send (checked against the
// library's parser in tests/help.test.js). `cpp` is the same with the C++ client, for what its sample (clients/cpp/sample.cpp) shows.
const HELP_STEPS = [
    { title: "A number", intro: "A name, a colon, a value: that is a whole message. Send it again whenever the value changes.", examples: [
        { code: "temperature:25.3", note: "It is charted as it arrives, at the time it arrives.", expect: { name: "temperature", type: "number" },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [");"]] },
        { code: "temperature:25.3§°C", note: "A unit, after §: displayed next to the value.", expect: { name: "temperature", type: "number", unit: "°C" },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [", std::nullopt, { .unit = \""], ["°C", "unit"], ["\" });"]] },
    ] },
    { title: "Shown together: labels", intro: "A label after the name, behind a comma, says what belongs together. It works with every kind of message below.", examples: [
        { code: "left,motors:0.4", note: "Telemetries with the same label share a view of the Live dashboard, titled with the label.", expect: { name: "left", type: "number", label: "motors" } },
        { code: "right,motors:0.38", note: "Same label: this one joins the chart of the first. In the Telemetries panel, the label is one card to drag them all at once.", expect: { name: "right", type: "number", label: "motors" } },
        { code: "debug:42|np", note: "The np flag does the opposite: the telemetry stays out of the Live dashboard until you add it yourself (Edit mode).", expect: { name: "debug", type: "number", autoplot: false } },
    ] },
    { title: "Several values, your own time", intro: "Without a time, a value is dated when it arrives. Give one when the device knows better, or to send values in batches.", examples: [
        { code: "temperature:1627551892437:25.3", note: "The time goes before the value, in milliseconds since 1970.", expect: { name: "temperature", type: "number", timestamp: 1627551892.437 },
          cpp: [["Teleplot::instance().update(\""], ["temperature", "name"], ["\", "], ["25.3", "value"], [", "], ["timestamp", "time"], [");  // std::chrono::nanoseconds"]] },
        { code: "speed:1000:1.2;1010:1.3;1020:1.4", note: "Several samples in one message, separated by semicolons: nothing is lost between two sends.", expect: { name: "speed", type: "number", samples: 3 } },
        { code: "speed:0|clr", note: "The clr flag forgets what the telemetry held before this value (a new run, for example).", expect: { name: "speed", type: "number", samples: 1 } },
    ] },
    { title: "Text: states and logs", intro: "Text is either a state (its latest value matters) or a log (lines to read in order). Both views show both; the flag chooses the default one.", examples: [
        { code: "state:forward|t", note: "The t flag: a state, shown as a value.", expect: { name: "state", type: "text", logText: undefined, view: "values" } },
        { code: "state:1627551892437:turning|t", note: "With its own time, like a number.", expect: { name: "state", type: "text", timestamp: 1627551892.437 } },
        { code: "nav,logs:Path clear|log", note: "The log flag: a line of a log, shown in a Log view. With a label, the logs of several parts of a system are read together.", expect: { name: "nav", type: "text", logText: true, view: "log", label: "logs" } },
        { code: ">:Motors armed", note: "A line starting with > goes to the general log, without a name.", expect: { log: true } },
    ] },
    { title: "Ranges and thresholds", intro: "What a number is expected between, and the limits it should not pass: said once, they are shown wherever the number is.", examples: [
        { code: "ATTR|battery|min=9|max=12.6", note: "ATTR| describes a telemetry: here its range. Its value gets a bar from the minimum to the maximum, and a chart can take the range as its scale (Edit mode). Send it once, before or after the values.", expect: { name: "battery", range: [9, 12.6] } },
        { code: "TH|battery:low<10.5:empty<9.9,red", note: "TH| gives thresholds: a name, < or > (the side that is past the limit), a value, and a color if you want one. Charts draw them as dashed lines, values tell which one is passed.", expect: { name: "battery", thresholds: ["empty<9.9,red", "low<10.5"] } },
        { code: "battery:10.2§V", note: "The number itself, as usual: here it is below \"low\".", expect: { name: "battery", type: "number", unit: "V" } },
        { code: "TH|battery:1627551892437:low<10.8", note: "A threshold can change: with a time (before its name) it holds from then on, and what was drawn before keeps the limit it had. low< without a value removes it.", expect: { name: "battery", thresholds: ["low<10.8"] } },
    ] },
    { title: "A position", intro: "Two or three numbers at once make a point instead of a curve.", examples: [
        { code: "position:12.5:4.2|xy", note: "Two numbers and the xy flag: a position, shown on a map (a 2D view) with the trail of where it went.", expect: { name: "position", type: "2d", view: "2d" } },
        { code: "position:12.5:4.2:1627551892437|xy", note: "The time, when there is one, comes after the coordinates.", expect: { name: "position", type: "2d", timestamp: 1627551892.437 } },
        { code: "drone:1.5:0.2:3|xyz", note: "Three numbers and xyz: a point in space, shown in a 3D view with the trail of its last positions.", expect: { name: "drone", type: "3d" } },
    ] },
    { title: "3D shapes", intro: "A line starting with 3D| describes a shape by its properties. x is forward, y to the left, z up. Send everything once, then only what changes.", examples: [
        { code: "3D|box,scene:S:cube:P:1:0:0.5:W:1:D:1:H:1:C:orange", note: "S: cube, sphere, cylinder or stl. P: position. W, D, H: width, depth, height. C: color.", expect: { name: "box", shape: "cube", position: [1, 0, 0.5], label: "scene" } },
        { code: "3D|ball,scene:S:sphere:P:0:1:0.3:RA:0.3:C:red:O:0.5", note: "RA: radius. O: opacity, from 0 to 1. The same label puts both shapes in one scene.", expect: { name: "ball", shape: "sphere", position: [0, 1, 0.3], label: "scene" } },
        { code: "3D|box:P:2:0:0.5:R:0:0:1.57", note: "Later: only the position and the rotation (R: roll, pitch, yaw in radians; or Q: a quaternion w, x, y, z).", expect: { name: "box", shape: "cube", position: [2, 0, 0.5] } },
    ] },
    { title: "2D drawings", intro: "A line starting with 2D| is a 3D| line written flat: x:y positions, one angle. Flat shapes are seen from above in a 2D view, and lie on the ground of a 3D view: nothing is sent twice.", examples: [
        { code: "2D|robot,field:S:rect:P:1.2:0.8:R:0.5:W:0.3:H:0.2:C:blue", note: "S: rect, circle, line, polygon, arrow or text. P: x:y. R: one angle, in radians. W, H: width (x) and height (y). C, O: color and opacity, as in 3D.", expect: { name: "robot", shape: "rect", position: [1.2, 0.8, 0], label: "field", view: "2d" } },
        { code: "2D|route,field:S:line:PT:0:0:1:0.5:2:2:3:2:C:green", note: "PT: the points of a line, as many x:y as needed. It is as thin as the screen draws; add LW:0.2 for a real width, in your units.", expect: { name: "route", shape: "line", label: "field", view: "2d" } },
        { code: "2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3", note: "A polygon is the surface inside its points.", expect: { name: "zone", shape: "polygon", label: "field", view: "2d" } },
        { code: "2D|goal,field:S:text:P:3:2:TX:\"Goal A\"", note: "TX: a text, at a position. TS:0.2 gives it a height in your units; without, it keeps a readable size.", expect: { name: "goal", shape: "text", position: [3, 2, 0], label: "field", view: "2d" } },
        { code: "2D|robot:P:1.5:1:R:0.8", note: "Later: only what changes.", expect: { name: "robot", shape: "rect", position: [1.5, 1, 0] } },
    ] },
    { title: "Frames: relative to something", intro: "With a frame, the positions of a shape are relative to another telemetry: when that one moves or turns, what is in its frame follows, without being sent again.", examples: [
        { code: "2D|heading,field:S:arrow:V:0.4:0:F:robot", note: "F: the name of the frame. V: the vector of an arrow. This one starts at the robot and points where it looks, wherever it goes.", expect: { name: "heading", shape: "arrow", label: "field", frame: "robot", view: "2d" } },
        { code: "2D|bumper,field:S:rect:P:0.2:0:W:0.05:H:0.25:C:black:F:robot", note: "Its position is in the frame: 0.2 in front of the robot. A frame can be in a frame; it works the same in 3D| lines, for points and for point clouds.", expect: { name: "bumper", shape: "rect", label: "field", frame: "robot", view: "2d" } },
    ] },
    { title: "A point cloud", intro: "A lidar scan or the points of a depth camera: all the points of the line are one sample, in the frame of the sensor.", examples: [
        { code: "lidar:1:0:0;0.7:0.7:0;0:1:0|pc", note: "x:y:z for each point, separated by semicolons, and the pc flag. A flat scan sets z to 0: it is shown in a 2D view.", expect: { name: "lidar", cloud: 3, view: "2d" } },
        { code: "lidar:1:0:0:0.9;0.7:0.7:0:0.4;0:1:0:0.1|pc", note: "A fourth value is an intensity: points are colored from the lowest to the highest. Or a color: x:y:z:r:g:b.", expect: { name: "lidar", cloud: 3, intensity: true, view: "2d" } },
        { code: "3D|lidar:P:1:2:0.2:R:0:0:1.57", note: "Where the sensor is, sent like the position of a shape under the same name: each scan is drawn where the sensor was.", expect: { name: "lidar", position: [1, 2, 0.2] } },
    ] },
    { title: "An image and its camera", intro: "A picture is sent as text too. Boxes and texts can be drawn on it, in its pixels. With the parameters of its camera and the label of a scene, the camera shows in that scene and its shapes are drawn over the picture.", examples: [
        { code: "PNG|camera,scene:iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAMAAACWlYwtAAAAD1BMVEXP6P+Kj5jmfiLAOSv///9A9kpQAAAAVElEQVR42u3MQQrAIBBDUfud+5+5uChF6BQhIgTmb0Nea1VVGYY9AJgDIAoyECP1rwgqECEKPG0HrrV4mwcbADLBBYBUOANALiwA/aujwH8FFDC6AfBCBoyP9FOtAAAAAElFTkSuQmCC", note: "PNG| or JPG|, a name, and the file in base64 (here a small picture, 64 x 48 pixels: a cone on a floor). The label is the one of the 3D shapes: the camera joins their scene.", expect: { name: "camera", image: true, label: "scene" } },
        { code: "2D|found:S:rect:P:44:26:W:22:H:28:C:red:O:0.25:LW:1:FPX:camera", note: "FPX: a frame, the pixels of the pictures of an image telemetry (u to the right, v down). A box around the cone: its center at pixel 44, 26, 22 pixels wide and 28 high. What a detector finds is drawn on the picture without knowing anything about the camera.", expect: { name: "found", shape: "rect", pixels: "camera" } },
        { code: "2D|found.name:S:text:P:33:8:TX:\"cone 0.92\":C:red:FPX:camera", note: "A text on the picture, the same way: where it starts, in pixels. It keeps a readable size; TS:6 would make it 6 pixels of the picture high.", expect: { name: "found.name", shape: "text", pixels: "camera" } },
        { code: "3D|camera:K:55:55:32:24:64:48:P:0:0:1", note: "With the camera of the picture, what is in the scene can be drawn over it too. Sent to the name of the image. K: fx, fy, cx, cy, width, height in pixels. P (and R or Q): where the camera is.", expect: { name: "camera", camera: true } },
        { code: "3D|camera:DC:-0.26:0.07:0:0:0", note: "DC: the distortion of its lens (k1, k2, p1, p2, k3), so that what is drawn follows the curves of the picture.", expect: { name: "camera", distortion: [-0.26, 0.07, 0, 0, 0] } },
    ] },
    { title: "Your own dashboard", intro: "A device can say where its telemetries go, and describe whole dashboards, with the same kind of lines. The dashboard menu exports any dashboard as such lines, and imports them.", examples: [
        { code: "speed,Robot/Motion:1.2", note: "A label that is a path: the dashboard, a slash, the view. Both are created if needed.", expect: { name: "speed", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
        { code: "accel,Robot/Motion:0.3", note: "Same path: it joins the chart \"Motion\" of the dashboard \"Robot\".", expect: { name: "accel", type: "number", label: "Robot/Motion", dashboard: "Robot" } },
        { code: "DASH|Robot/Motion:chart|w=4|h=3", note: "A DASH| line describes a view by its path: its type (chart, values, log, timeline, 2d, 3d, image), then options (here its width and height). Send it again to change the view.", expect: { dashboard: "Robot" } },
        { code: "DASH|Robot/side/Log:log:nav,state|maxLines=50", note: "After the type, the telemetries the view shows, by name: they do not have to exist yet. A longer path nests the view in layouts, created on the way.", expect: { dashboard: "Robot" } },
        { code: "DASH|Robot/side:column", note: "A layout has a line too: row, column, grid or stack. Lines can come in any order; the type none removes a view.", expect: { dashboard: "Robot" } },
    ] },
    { title: "States over time, marks on a chart", intro: "A state is also a band on a timeline, and a mark on a chart: the same text telemetry, shown along the time. Both are views you ask for: in Edit mode, or with a DASH| line.", examples: [
        { code: "mode:driving|t", note: "A state, as in step 4: it lasts from this message until the state changes. Sending it again changes nothing.", expect: { name: "mode", type: "text", text: "driving", view: "values" } },
        { code: "mode:|t", note: "An empty text is a state too: nothing. On a timeline it leaves a hole.", expect: { name: "mode", type: "text", text: "" } },
        { code: "DASH|Robot/States:timeline:mode,nav", note: "A Timeline view: a lane per telemetry, a band per state. A log (nav, from step 4) is drawn as a tick per line. Drag to zoom, as on a chart.", expect: { dashboard: "Robot" } },
        { code: "DASH|Robot/Motion:chart:speed,mode", note: "In a chart, a text telemetry has no curve: it is drawn as marks, a line where the state changes with its text next to it (for a log, a mark per line).", expect: { dashboard: "Robot" } },
    ] },
    { title: "Stacks: what is running", intro: "To see what a program spends its time in, send the path of what is running: a state whose text has a slash between levels. It is shown on a timeline, a row per level, like a profiler.", examples: [
        { code: "task:loop|stack", note: "The stack flag: the text is a path. Here one level: loop is running. Send a message each time something starts or ends.", expect: { name: "task", type: "text", text: "loop", stack: true, view: "timeline" } },
        { code: "task:loop/plan|stack", note: "plan starts, in loop: one level deeper. loop goes on: on a timeline it stays one band, with plan under it.", expect: { name: "task", type: "text", text: "loop/plan", stack: true } },
        { code: "task:loop/plan/search|stack", note: "As deep as needed. When search is over, send loop/plan again.", expect: { name: "task", type: "text", text: "loop/plan/search", stack: true } },
        { code: "task:1627551892437.25:loop/plan|stack", note: "With the time of the device, before the path: milliseconds, with decimals when it measures finer than that. Short calls need it: without a time, a message is dated when it arrives.", expect: { name: "task", type: "text", timestamp: 1627551892.43725, stack: true } },
        { code: "task:|stack", note: "An empty text: nothing runs.", expect: { name: "task", type: "text", text: "", stack: true } },
        { code: "DASH|Robot/Tasks:timeline:task|stackDepth=4", note: "A stack gets a timeline by itself on the Live dashboard; this line puts one where you want it. stackDepth is how many rows of full height its lane opens to; a deeper stack gets thinner rows. Hover a band: what it is, what it runs in, and for how long. Something that runs several things at once sends one stack for each.", expect: { dashboard: "Robot" } },
    ] },
];
const HELP_EXAMPLES = HELP_STEPS.flatMap((step) => step.examples);

// How the user sends data. `setup` is what a program needs once, before the first line.
const HELP_SENDERS = [
    { id: "sh", name: "Terminal", sub: "UDP, one line", setup: "", setupNote: "Nothing to install: nc comes with Linux and macOS. The Teleplot server receives UDP port 47269 and passes it on to this page (see Sources)." },
    { id: "py", name: "Python", sub: "UDP socket", setup: "import socket\nsock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)", setupNote: "The Teleplot server receives UDP port 47269 and passes it on to this page (see Sources)." },
    { id: "cpp", name: "C++", sub: "Teleplot.h", setup: "#include \"Teleplot.h\"\n// ... update() calls, then:\nTeleplot::instance().flush();", setupNote: "One header, in clients/cpp. flush() sends what update() queued: call it regularly." },
    { id: "ino", name: "Arduino", sub: "Serial port", setup: "Serial.begin(115200);", setupNote: "Then open the port in the Sources panel (Chrome or Edge). A line that does not start with > is shown as a log." },
];

const HELP_SHORTCUTS = [
    { keys: "Space", label: "Pause or resume" },
    { keys: "T", label: "Telemetries" },
    { keys: "S", label: "Sources" },
    { keys: "H", label: "This help" },
    { keys: "E", label: "Edit the dashboard" },
    { keys: "Esc", label: "Close a panel, leave Edit" },
];

const HELP_KINDS = [["name", "name"], ["value", "value"], ["time", "time (ms)"], ["unit", "§unit"], ["flags", "|flags"]];

// A text message cut in parts, each with what it is: [{text, kind}], kind: "name", "value", "time", "unit", "flags" or "" (separators).
// Only for display: it follows the same rules as the parser of the library without being it.
function helpColorize(message) {
    const parts = [];
    const add = (text, kind = "") => { if (text !== "") parts.push({ text, kind }); };
    let rest = String(message);
    if (rest.startsWith(">")) { // A log line: >:text or >timestamp:text
        const colon = rest.indexOf(":");
        add(">", "flags");
        if (colon < 0) { add(rest.slice(1), "value"); return parts; }
        add(rest.slice(1, colon), "time"); add(":"); add(rest.slice(colon + 1), "value");
        return parts;
    }
    if (rest.startsWith("DASH|")) { // A dashboard line: DASH|path:type:telemetries|option=value|...
        add("DASH|", "flags");
        rest = rest.slice(5);
        const options = rest.indexOf("|");
        const head = options < 0 ? rest : rest.slice(0, options);
        const colon = head.indexOf(":");
        add(colon < 0 ? head : head.slice(0, colon), "name");
        if (colon >= 0) { add(":"); add(head.slice(colon + 1), "value"); }
        if (options >= 0) { add("|"); add(rest.slice(options + 1), "flags"); }
        return parts;
    }
    if (rest.startsWith("ATTR|")) { // Attributes: ATTR|name|key=value|...
        add("ATTR|", "flags");
        rest = rest.slice(5);
        const options = rest.indexOf("|");
        add(options < 0 ? rest : rest.slice(0, options), "name");
        if (options >= 0) { add("|"); add(rest.slice(options + 1), "value"); }
        return parts;
    }
    if (rest.startsWith("TH|")) { // Thresholds: TH|name:time:threshold<value:...;time:...
        add("TH|", "flags");
        rest = rest.slice(3);
        const colon = rest.indexOf(":");
        add(colon < 0 ? rest : rest.slice(0, colon), "name");
        if (colon < 0) return parts;
        add(":");
        rest.slice(colon + 1).split(";").forEach((group, g) => {
            if (g > 0) add(";");
            group.split(":").forEach((field, f) => { if (f > 0) add(":"); add(field, f == 0 && /^[0-9.eE+-]+$/.test(field) ? "time" : "value"); });
        });
        return parts;
    }
    const prefix = /^(3D|2D|JPG|PNG)\|/.exec(rest);
    if (prefix) { add(prefix[0], "flags"); rest = rest.slice(prefix[0].length); }
    let flags = "", unit = "";
    const bar = rest.lastIndexOf("|");
    if (bar >= 0) { flags = rest.slice(bar + 1); rest = rest.slice(0, bar); }
    const section = rest.indexOf("§");
    if (section >= 0) { unit = rest.slice(section + 1); rest = rest.slice(0, section); }
    const colon = rest.indexOf(":");
    add(colon < 0 ? rest : rest.slice(0, colon), "name");
    if (colon >= 0) {
        add(":");
        const values = rest.slice(colon + 1);
        const plain = !prefix && !/xy|pc|t|log/.test(flags); // Numbers: "time:value"
        const timeAt = flags.includes("xyz") ? 3 : (flags.includes("xy") ? 2 : -1); // Points: the time comes after the coordinates
        if (prefix) add(values, "value");
        else values.split(";").forEach((sample, index) => {
            if (index > 0) add(";");
            const fields = sample.split(":");
            if (flags.includes("pc")) { add(sample, fields.length == 1 && index == 0 ? "time" : "value"); return; }
            if (plain && fields.length == 2) { add(fields[0], "time"); add(":"); add(fields[1], "value"); return; }
            if (timeAt > 0 && fields.length == timeAt + 1) { add(fields.slice(0, timeAt).join(":"), "value"); add(":"); add(fields[timeAt], "time"); return; }
            add(sample, "value");
        });
    }
    if (section >= 0) { add("§"); add(unit, "unit"); }
    if (bar >= 0) { add("|"); add(flags, "flags"); }
    return parts;
}

// The line that sends a message, for a sender: {parts: [{text, kind}], note}. The message is in the middle of what wraps it; `note`
// says what the line needs to be told (a message the C++ client has no call for).
function helpLine(senderId, example) {
    const message = helpColorize(example.code);
    const wrap = (before, parts, after) => ({ parts: [{ text: before, kind: "" }, ...parts, { text: after, kind: "" }], note: "" });
    if (senderId == "sh") return wrap("echo \"", message, "\" | nc -u -w0 127.0.0.1 47269");
    if (senderId == "py") return wrap("sock.sendto(\"", message, "\".encode(), (\"127.0.0.1\", 47269))");
    if (senderId == "ino") {
        // On a serial port a line is a log unless it starts with ">": a log is the text alone, anything else gets the ">"
        if (example.code.startsWith(">")) return wrap("Serial.println(\"", [{ text: example.code.slice(example.code.indexOf(":") + 1), kind: "value" }], "\");");
        return wrap("Serial.println(\">", message, "\");");
    }
    if (example.cpp) return { parts: example.cpp.map(([text, kind]) => ({ text, kind: kind || "" })), note: "" };
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
    if (message.startsWith("ATTR|")) {
        const name = message.slice(5).split("|")[0];
        const telem = TP.datastore.getTelemetry(name);
        if (problems > 0 || !telem) return { ok: false, text: "Teleplot did not understand this line. It is ATTR|name|min=value|max=value, for example ATTR|battery|min=9|max=12.6" };
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

    const colored = (list) => `<span v-for="(p, i) in ${list}" :key="i" :class="p.kind ? 'help-k help-k-' + p.kind : ''">{{p.text}}</span>`;

    const vueHTML = `
        <div class="help-layout">
            <!-- Try a message without a device: one line at rest, more once it is used -->
            <div class="help-try" :class="{open: tryOpen}">
                <div class="help-try-line">
                    <div class="help-try-field">
                        <div class="help-try-colors" ref="tryColors" aria-hidden="true">${colored("tryParts")}</div>
                        <input ref="tryInput" type="text" v-model="tryText" spellcheck="false" autocomplete="off" placeholder="Try a message here: temperature:25.3"
                            aria-label="A message to send to this page" @focus="tryOpen = true" @blur="onTryBlur()" @input="tryOpen = true; syncTryScroll()" @scroll="syncTryScroll()" @keyup="syncTryScroll()"
                            @keydown.enter="sendTry()" @keydown.esc.stop="closeTry()">
                    </div>
                    <button class="help-try-send" :disabled="!tryText.trim()" title="Send this message to the page, as if a device had (Enter)" @mousedown.prevent @click="sendTry()">Send</button>
                </div>
                <template v-if="tryOpen">
                    <div v-if="tryResult" class="help-try-result" :class="{bad: !tryResult.ok}" role="status"><i></i><span>{{tryResult.text}}</span></div>
                    <div class="help-key"><b v-for="k in kinds" :key="k[0]" :class="['help-k', 'help-k-' + k[0], {off: !tryKinds.includes(k[0])}]">{{k[1]}}</b></div>
                    <div class="help-try-hint">Enter sends it to this page, as if a device had. Examples:</div>
                    <div class="help-chips">
                        <button v-for="step in steps.slice(0, 6)" :key="step.title" :class="{on: tryText == step.examples[0].code}" @mousedown.prevent @click="tryMessage(step.examples[0].code)">{{step.title}}</button>
                        <button class="help-try-close" title="Close (Esc)" @mousedown.prevent @click="closeTry()">close <i class="icofont-close"></i></button>
                    </div>
                </template>
            </div>

            <section @click="foldTry()">
                <h2>I send data with</h2>
                <div class="help-senders" role="radiogroup" aria-label="How data is sent">
                    <button v-for="s in senders" :key="s.id" role="radio" :aria-checked="sender == s.id" :class="{on: sender == s.id}" @click="setSender(s.id)"><b>{{s.name}}</b><span>{{s.sub}}</span></button>
                </div>
                <div class="help-key help-key-main"><b v-for="k in kinds" :key="k[0]" :class="['help-k', 'help-k-' + k[0]]">{{k[1]}}</b></div>

                <div class="help-step" :class="{open: openStep == 0}">
                    <button class="help-step-head" :aria-expanded="openStep == 0" @click="toggle(0)"><span class="help-step-n zero">0</span><span>Set up, once</span><i class="icofont-simple-right"></i></button>
                    <div class="help-step-fold" :inert="openStep != 0"><div class="help-step-body">
                        <div v-if="currentSender.setup" class="help-code"><code>{{currentSender.setup}}</code>
                            <button class="help-copy" :class="{done: copied == currentSender.setup}" title="Copy" aria-label="Copy the set-up" @click="copy(currentSender.setup)"><i :class="copied == currentSender.setup ? 'icofont-check' : 'icofont-copy'"></i></button>
                        </div>
                        <small>{{currentSender.setupNote}}</small>
                    </div></div>
                </div>
                <div v-for="(step, index) in steps" :key="step.title" class="help-step" :class="{open: openStep == index + 1}">
                    <button class="help-step-head" :aria-expanded="openStep == index + 1" @click="toggle(index + 1)"><span class="help-step-n">{{index + 1}}</span><span>{{step.title}}</span><i class="icofont-simple-right"></i></button>
                    <div class="help-step-fold" :inert="openStep != index + 1"><div class="help-step-body">
                        <p class="help-step-intro">{{step.intro}}</p>
                        <div v-for="ex in step.examples" :key="ex.code" class="help-example">
                            <p class="help-example-note">{{ex.note}}</p>
                            <div class="help-code"><code>${colored("line(ex).parts")}</code>
                                <div class="help-actions">
                                    <button class="help-act" title="Put this message in the field at the top, to change it before sending it" @click.stop="tryMessage(ex.code)"><i class="icofont-edit"></i> Edit</button>
                                    <button class="help-act" :class="{done: sent.code == ex.code && sent.ok}" title="Send this message to the page right away, as if a device had" @click="sendExample(ex)"><i :class="sent.code == ex.code && sent.ok ? 'icofont-check' : 'icofont-paper-plane'"></i> Send</button>
                                    <button class="help-copy" :class="{done: copied == text(ex)}" title="Copy this line" aria-label="Copy this line" @click="copy(text(ex))"><i :class="copied == text(ex) ? 'icofont-check' : 'icofont-copy'"></i></button>
                                </div>
                            </div>
                            <small v-if="sent.code == ex.code" class="help-sent" :class="{bad: !sent.ok}" role="status"><i></i>{{sent.text}}</small>
                            <small v-if="line(ex).note" class="help-missing">{{line(ex).note}}</small>
                        </div>
                    </div></div>
                </div>
            </section>

            <section>
                <h2>Shortcuts</h2>
                <dl class="help-keys">
                    <template v-for="s in shortcuts" :key="s.keys"><dt><kbd>{{s.keys}}</kbd></dt><dd>{{s.label}}</dd></template>
                </dl>
            </section>

            <section>
                <h2>Sample data</h2>
                <p>A simulated robot sends every kind of telemetry (numbers, positions, text, 3D shapes, a lidar, a camera). A quick way to look around.</p>
                <button class="help-sample" @click="ctx.sampleRunning ? stopSample() : startSample()">{{ctx.sampleRunning ? 'Stop sample data' : 'Preview sample data'}}</button>
            </section>

            <footer>
                <a href="https://github.com/nesnes/teleplot" target="_blank" rel="noopener">Documentation and source code</a>
            </footer>
        </div>
    `;

    const vueCSS = `
        .help-layout {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            box-sizing: border-box;
            max-height: calc(100vh - 7rem);
            padding: 0.4rem 0.8rem 1rem 0.2rem;
            overflow-y: auto;
            scrollbar-width: thin;
            color: var(--color-text);
            --help-mono: ui-monospace, Consolas, monospace;
        }
        .help-layout p { margin: 0 0 0.4rem; }
        .help-layout h2 {
            margin: 0 0 0.4rem;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--color-text-muted);
        }
        .help-layout small { display: block; margin-top: 0.2rem; color: var(--color-text-muted); line-height: 1.35; }

        /* Parts of a message: the same color everywhere (lines of the ladder, the field at the top, the keys) */
        .help-k { border-radius: 0.22rem; }
        .help-k-name { background: color-mix(in srgb, var(--color-primary) 22%, transparent); }
        .help-k-value { background: color-mix(in srgb, var(--color-success) 26%, transparent); }
        .help-k-time { background: color-mix(in srgb, #16a085 26%, transparent); }
        .help-k-unit { background: color-mix(in srgb, var(--color-warning) 30%, transparent); }
        .help-k-flags { background: color-mix(in srgb, #8e44ad 24%, transparent); }
        .help-key { display: flex; flex-wrap: wrap; gap: 0.3rem 0.45rem; }
        .help-key b { font: 600 0.85rem var(--help-mono); padding: 0.02rem 0.35rem; }
        .help-key b.off { opacity: 0.35; }
        .help-key-main { margin: 0.5rem 0 0.45rem; }

        /* The field to try a message */
        .help-try { border: 1px solid transparent; border-radius: 0.6rem; }
        .help-try.open { margin: -0.4rem -0.45rem 0; padding: 0.4rem 0.45rem 0.5rem; border-color: color-mix(in srgb, var(--color-primary) 35%, transparent); background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-light)); }
        .help-try-line { display: flex; gap: 0.4rem; }
        .help-try-field { position: relative; flex: 1; min-width: 0; }
        .help-try-field input, .help-try-colors {
            box-sizing: border-box; width: 100%; margin: 0; padding: 0.3rem 0.55rem;
            font: 0.95rem/1.4 var(--help-mono); letter-spacing: 0; white-space: pre;
            border: 1px solid var(--color-bg-dark); border-radius: 0.4rem;
        }
        .help-try-colors { position: absolute; inset: 0; overflow: hidden; border-color: transparent; color: var(--color-text); pointer-events: none; }
        .help-try-field input { position: relative; background: transparent; color: transparent; caret-color: var(--color-text); outline: none; }
        .help-try-field { background: var(--color-bg-light); border-radius: 0.4rem; }
        .help-try-field input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent); }
        .help-try-field input::placeholder { color: var(--color-text-muted); font-family: Verdana, Geneva, Tahoma, sans-serif; font-size: 0.92rem; opacity: 1; }
        .help-try-send { padding: 0 0.8rem; border: 1px solid var(--color-primary); border-radius: 0.5rem; background: var(--color-primary); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
        .help-try-send:disabled { border-color: var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text-muted); cursor: default; }
        .help-try-result { display: flex; gap: 0.4rem; align-items: baseline; margin-top: 0.4rem; font-size: 0.95rem; }
        .help-try-result i { flex: none; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: var(--color-success); }
        .help-try-result.bad i { background: var(--color-danger); }
        .help-try .help-key { margin-top: 0.4rem; }
        .help-try-hint { margin-top: 0.35rem; font-size: 0.9rem; color: var(--color-text-muted); }
        .help-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
        .help-chips button { padding: 0.1rem 0.55rem; border: 1px solid var(--color-bg-dark); border-radius: 1rem; background: var(--color-bg-light); color: var(--color-text); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
        .help-chips button:hover, .help-chips button.on { border-color: var(--color-primary); color: var(--color-primary); }
        .help-chips .help-try-close { margin-left: auto; border-color: transparent; background: none; color: var(--color-text-muted); font-weight: 400; }

        /* How data is sent */
        .help-senders { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.35rem; }
        .help-senders button {
            padding: 0.4rem 0.2rem; border: none; border-bottom: 2px solid var(--color-bg-dark); border-radius: 0.5rem;
            background: var(--color-bg-light); box-shadow: 0 0 3px var(--color-shadow); color: var(--color-text); font: inherit; text-align: center; cursor: pointer;
        }
        .help-senders button.on { border-bottom-color: var(--color-primary); }
        .help-senders button:focus-visible { outline: 2px solid var(--color-primary); }
        .help-senders b { display: block; }
        .help-senders span { display: block; font-size: 0.78rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* The ladder */
        .help-step { margin-top: 0.4rem; border-radius: 0.4rem; background: var(--color-bg-light); box-shadow: 0 0 3px var(--color-shadow); }
        .help-step-head { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.4rem 0.6rem; border: none; background: none; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }
        .help-step.open .help-step-head { font-weight: 700; }
        .help-step-head i { margin-left: auto; color: var(--color-text-muted); transition: transform var(--motion-fast); }
        .help-step.open .help-step-head i { transform: rotate(90deg); }
        .help-step-n { flex: none; display: grid; place-items: center; width: 1.45rem; height: 1.45rem; border-radius: 50%; background: var(--color-text-muted); color: #fff; font-size: 0.85rem; font-weight: 700; }
        .help-step.open .help-step-n:not(.zero) { background: var(--color-primary); }
        /* A step unfolds by sliding its height, fast (the row of a grid goes from nothing to the height of its content) */
        .help-step-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--motion-fast) var(--ease-out); }
        .help-step.open .help-step-fold { grid-template-rows: 1fr; }
        .help-step-body { min-height: 0; overflow: hidden; padding: 0 0.6rem; }
        .help-step-body > :last-child { margin-bottom: 0.55rem; }
        @media (prefers-reduced-motion: reduce) { .help-step-fold { transition: none; } }
        .help-layout p.help-step-intro { margin: 0 0 0.5rem; line-height: 1.4; }
        /* An example is one block: what it does, then the line that does it (and what the page answered) */
        .help-example { padding: 0.45rem 0.5rem 0.5rem; border-radius: 0.45rem; background: var(--color-bg); border-left: 3px solid color-mix(in srgb, var(--color-primary) 55%, transparent); }
        .help-example + .help-example { margin-top: 0.6rem; }
        .help-layout p.help-example-note { margin: 0 0 0.4rem; font-size: 0.9rem; line-height: 1.35; color: var(--color-text); }
        .help-example .help-code code { background: var(--color-bg-light); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text) 10%, transparent); }
        .help-example small { margin-top: 0.35rem; }
        .help-code { position: relative; }
        .help-code code {
            display: block; padding: 0.4rem 0.55rem 1.7rem; border-radius: 0.35rem;
            background: var(--color-bg); font: 0.9rem/1.5 var(--help-mono); white-space: pre-wrap; word-break: break-all;
        }
        /* Under a line: Edit (to the field at the top), Send (to the page, right away), Copy */
        .help-code .help-copy, .help-act { height: 1.4rem; display: inline-flex; align-items: center; gap: 0.25rem; border: none; border-radius: 0.4rem; background: transparent; color: var(--color-text-muted); font: inherit; font-size: 0.85rem; cursor: pointer; }
        .help-code > .help-copy { position: absolute; right: 0.3rem; bottom: 0.2rem; }
        .help-code .help-copy { width: 1.6rem; justify-content: center; }
        .help-actions { position: absolute; right: 0.3rem; bottom: 0.2rem; display: flex; align-items: center; gap: 0.1rem; }
        .help-act { padding: 0 0.4rem; font-weight: 600; color: var(--color-primary); }
        .help-code .help-copy:hover, .help-code .help-copy:focus-visible, .help-act:hover, .help-act:focus-visible { background: color-mix(in srgb, var(--color-text) 9%, transparent); outline: none; }
        .help-code .help-copy.done, .help-act.done { color: var(--color-success); }
        .help-layout small.help-sent { display: flex; gap: 0.4rem; align-items: baseline; color: var(--color-text); }
        .help-sent i { flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--color-success); }
        .help-sent.bad i { background: var(--color-danger); }
        .help-layout small.help-missing { color: var(--color-text); }

        .help-keys { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 0.8rem; align-items: center; margin: 0; }
        .help-keys dt, .help-keys dd { margin: 0; }
        .help-layout kbd {
            font: 0.9rem ui-monospace, Consolas, monospace;
            padding: 0.05rem 0.45rem;
            border: 1px solid var(--color-bg-dark);
            border-radius: 0.35rem;
            background: var(--color-bg-light);
        }
        .help-sample {
            padding: 0.5rem 1rem;
            border: 1px solid var(--color-primary);
            border-radius: 0.6rem;
            background: transparent;
            color: var(--color-primary);
            font: inherit; font-weight: 600;
            cursor: pointer;
            transition: background var(--motion-fast), color var(--motion-fast);
        }
        .help-sample:hover, .help-sample:focus-visible { background: var(--color-primary); color: #fff; outline: none; }
        .help-layout footer a { color: var(--color-primary); }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    const SENDER_KEY = "teleplot.help.sender";
    const remembered = () => { try { return localStorage.getItem(SENDER_KEY); } catch (e) { return null; } };

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                steps: HELP_STEPS,
                senders: HELP_SENDERS,
                shortcuts: HELP_SHORTCUTS,
                kinds: HELP_KINDS,
                sender: HELP_SENDERS.some((s) => s.id == remembered()) ? remembered() : "sh", // How the user sends data (remembered)
                openStep: 1,     // The step of the ladder that is unfolded (0: the set-up, -1: none): opening one folds the others
                tryText: "",     // The message typed in the field at the top (local: nothing redraws over it)
                tryOpen: false,  // The field shows its colors key, examples and result
                tryResult: null, // {ok, text}: what Teleplot made of the last message sent from the field
                sent: { code: "", ok: true, text: "" }, // The example of the ladder that was just sent with its Send button, and what Teleplot made of it
                copied: "",      // The text that was just copied (the button confirms for a moment)
            }
        },
        computed: {
            currentSender() { return this.senders.find((s) => s.id == this.sender); },
            tryParts() { return helpColorize(this.tryText); },
            tryKinds() { return this.tryParts.map((p) => p.kind); },
        },
        methods: {
            startSample() { startSampleData(this.TP, this.ctx); },
            stopSample() { stopSampleData(this.ctx); },
            setSender(id) {
                this.sender = id;
                try { localStorage.setItem(SENDER_KEY, id); } catch (e) { /* (private browsing...: not remembered) */ }
            },
            toggle(index) { this.openStep = this.openStep == index ? -1 : index; },
            line(example) { return helpLine(this.sender, example); },
            text(example) { return this.line(example).parts.map((p) => p.text).join(""); },
            copy(text) {
                if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                this.copied = text;
                clearTimeout(this._copiedTimer);
                this._copiedTimer = setTimeout(() => { this.copied = ""; }, 1200);
            },
            // The field at the top: a message of the ladder is put in it ("Try"), sent to the page, and it folds back when it is left empty
            tryMessage(code) {
                this.tryText = code;
                this.tryResult = null;
                this.tryOpen = true;
                this.$nextTick(() => { if (this.$refs.tryInput) { this.$refs.tryInput.focus(); this.$el.scrollTop = 0; this.syncTryScroll(); } });
            },
            sendTry() {
                const message = this.tryText.trim();
                if (!message) return;
                this.tryOpen = true;
                if (this.TP.state.isPaused) { this.tryResult = { ok: false, text: "Data is paused: resume (Space) and send again." }; return; }
                this.tryResult = helpDescribe(this.TP, message, this.TP.parseDataText(message));
            },
            // "Send" of an example: its message goes to the page right away, and the result is said under it
            sendExample(example) {
                const answer = this.TP.state.isPaused ? { ok: false, text: "Data is paused: resume (Space) and send again." } : helpDescribe(this.TP, example.code, this.TP.parseDataText(example.code));
                this.sent = { code: example.code, ok: answer.ok, text: answer.text };
            },
            closeTry() {
                this.tryText = ""; this.tryResult = null; this.tryOpen = false;
                if (this.$refs.tryInput) this.$refs.tryInput.blur();
            },
            foldTry() { if (this.tryOpen && document.activeElement !== this.$refs.tryInput) this.tryOpen = false; }, // (a click in the ladder)
            onTryBlur() { if (!this.tryText.trim()) { this.tryOpen = false; this.tryResult = null; } },
            syncTryScroll() { if (this.$refs.tryColors && this.$refs.tryInput) this.$refs.tryColors.scrollLeft = this.$refs.tryInput.scrollLeft; }, // The colors follow a long line
        },
        unmounted() { clearTimeout(this._copiedTimer); },
        template: vueHTML,
    });
}
