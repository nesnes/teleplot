/*
 * Reference of the Help panel (its tab "Reference"): what every value does, for every kind of telemetry, shape, view, dashboard and
 * client call, written for the language picked at the top of the panel (HELP_SENDERS of panel-help.js).
 *
 * REF_ROWS: one row per value: its name in words (the same in every language), the text protocol (`text`), the call of the clients
 * (`call`: C++; `py` / `ino` when they differ, null when a client has none), its default, what it does, the values it takes, and an
 * example (a message of the Help: {code, lib, py, ino, libNote}). REF_THINGS: the pages, in families (REF_FAMILIES): a thing lists
 * its rows; shapes and views have a drawing whose parts are named with the names of their rows (refDrawing) and point at what they
 * change. Views also get a row per option of the view, made from its getOptionsSchema() (refViewRows) with a sentence of REF_OPTIONS.
 * refMarkdown() writes doc/reference.md from the same entries (tools/reference-md.js; a test checks they are the same).
 * Tested in tests/reference.test.js: every property, flag, key and option the library knows, and every call of the C++ reference,
 * has a row; every call exists in its client; every example is understood. clients/tools/help_lines.js runs the examples of the
 * clients like those of the gallery.
 */

const REF_FAMILIES = [
    { id: "telemetries", title: "Telemetries", sub: "what a device sends" },
    { id: "shapes", title: "Shapes", sub: "2D| and 3D| lines" },
    { id: "describe", title: "Describe", sub: "unit, range, limits, groups" },
    { id: "commands", title: "Commands", sub: "what the page may change or call" },
    { id: "views", title: "Views", sub: "what shows it, and its options" },
    { id: "dashboards", title: "Dashboards", sub: "DASH| lines" },
    { id: "client", title: "Client", sub: "the library of your language" },
];

// ---------------------------------------------------------------------------------------------------------------- rows
// row(id, name, text, call, def, what, values[, more]): `more` gives py, ino (null: none in that client), alt (long names), note, ex
const REF_ROWS = {};
function refRow(id, name, text, call, def, what, values, more) {
    REF_ROWS[id] = Object.assign({ id, name, text, call, def, what, values }, more || {});
}
// An example: the message, its C++ calls (py / ino when they cannot be derived), or why a client has none
const refEx = (code, lib, more) => Object.assign({ code, lib }, more || {});
const NO_CLR = "No call for |clr: send the line as text (tp.dashboard() takes DASH| lines only).";

// Numbers, points, texts
refRow("value", "value", "name:value", "tp.update(\"name\", v)", "", "A sample: the same name again adds one.", "a number with a point for decimals (25.3, -4, 1e3); true and false are 1 and 0 in the clients",
    { ex: refEx("temperature:25.3", "tp.update(\"temperature\", 25.3);") });
refRow("time", "time", "name:time:value", "tp.update(\"name\", v, Teleplot::ms(t))", "when it arrives", "When the sample was measured.", "milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line)",
    { ex: refEx("temperature:{now}:25.3", "tp.update(\"temperature\", 25.3, Teleplot::ms({now}));") });
refRow("samples", "several samples", "name:t:v;t:v", "", "", "Several samples of one telemetry in one line, each with its time.", "separated by ;", { call: null, note: "In a client: one update per sample, each with its time (they are packed together anyway).", ex: refEx("temperature:{now}:25.3;{now}:25.4", null, { libNote: "One update per sample: tp.update(\"temperature\", 25.3, Teleplot::ms(t)) for each." }) });
refRow("unit", "unit", "name:value§unit", ".unit(\"V\")", "none", "Written after its values; kept: once is enough.", "any text without , ; : | (also ATTR|name|unit=V)", { alt: "ATTR unit",
    ex: refEx("temperature:25.3§°C", "tp.telemetry(\"temperature\").unit(\"°C\").update(25.3);") });
refRow("label", "group", "name,group:value", ".label(\"motors\")", "none", "Telemetries of a group share a view of the Live dashboard, and views can follow a group.", "any text after a comma (a / means nothing special); one group per telemetry",
    { ex: refEx("left,motors:0.42", "tp.telemetry(\"left\").label(\"motors\").update(0.42);") });
refRow("np", "not on Live", "name:value|np", ".autoplot(false)", "shown", "Not put on the Live dashboard by itself (it stays in the Telemetries panel).", "the flag np",
    { ex: refEx("debug:42|np", "tp.telemetry(\"debug\").autoplot(false).update(42);") });
refRow("clr", "clear first", "name:value|clr", null, "", "What the telemetry held is forgotten before this sample (a new run, a new scan).", "the flag clr", { note: "No call in the clients: send the line as text.", ex: refEx("temperature:20|clr", null, { libNote: NO_CLR }) });
refRow("timeout", "data window", null, ".timeout(Teleplot::ms(5000))", "the page's (all, up to the memory limit)", "How long the page keeps the samples of this telemetry.", "a duration; 0: kept until the memory limit", { ino: ".timeout(Teleplot::ms(5000))", note: "Binary protocol only: the text protocol and the Arduino library (accepted, does nothing) have none." });
refRow("maxRate", "most per second", null, ".maxRate(50)", "0: all", "The client keeps at most that many samples per second (the others are not sent).", "samples per second");
refRow("precise", "exact numbers", null, ".precise()", "float32", "Numbers sent as float64: no rounding.", "on or off", { note: "The text protocol writes numbers as given (the Arduino library: 9 significant digits, 15 with precise())." });
refRow("xy", "2D position", "name:x:y|xy", "tp.update(\"name\", Teleplot::Number2D{x, y})", "", "A position on a map, with the trail of where it went.", "x forward, y to the left, in your units; a time can follow: x:y:time",
    { ex: refEx("rover:1.2:0.8|xy", "tp.update(\"rover\", Teleplot::Number2D{1.2, 0.8});") });
refRow("xyz", "3D point", "name:x:y:z|xyz", "tp.update(\"name\", Teleplot::Number3D{x, y, z})", "", "A point in a 3D view, with its trail.", "x forward, y to the left, z up; a time can follow: x:y:z:time",
    { ex: refEx("drone:1.5:0.2:3|xyz", "tp.update(\"drone\", Teleplot::Number3D{1.5, 0.2, 3});", { py: "tp.update(\"drone\", (1.5, 0.2, 3))" }) });
refRow("pointFrame", "frame", "2D|name:F:other", ".frame(\"robot\")", "the scene", "The position is relative to another telemetry, which carries it along.", "the name of a telemetry that has a place (up to 16 levels); F: empty: back in the scene",
    { ex: refEx("2D|tool:F:rover", "tp.telemetry(\"tool\").frame(\"rover\");") });
refRow("state", "state", "name:text|t", "tp.update(\"name\", \"text\")", "", "A text whose latest value matters (a mode, a status); the same text again continues it.", "any text, colons included; a first field that is a number is its time",
    { ex: refEx("mode:docking|t", "tp.update(\"mode\", \"docking\");") });
refRow("emptyState", "nothing", "name:|t", "tp.update(\"name\", \"\")", "", "An empty text: no state (a hole in a timeline).", "",
    { ex: refEx("mode:|t", "tp.update(\"mode\", \"\");") });
refRow("log", "log line", "name:text|log", "tp.log(\"name\", \"text\")", "", "A line to read with the others, an instant.", "any text",
    { ex: refEx("nav:Path clear|log", "tp.log(\"nav\", \"Path clear\");") });
refRow("logLine", "general log", ">:text", "tp.log(\"text\")", "", "A line of the log named log (on a serial port, any line that does not start with >).", ">time:text with its time (ms)",
    { ex: { from: ">:Motors armed" } });
refRow("logKind", "a log", "name:text|log", ".log()", "a state", "Makes a text telemetry a log (its default view: a log view) without sending a line.", "");
refRow("stackKind", "a stack", "name:path|stack", ".stack()", "a state", "Makes a text telemetry a stack without sending a path.", "");
refRow("stack", "what runs", "name:a/b/c|stack", "tp.stack(\"name\", \"a/b/c\")", "", "The path of what runs, outer level first: a timeline row per level.", "levels separated by /; empty: nothing runs",
    { ex: refEx("task:loop/plan/search|stack", "tp.stack(\"task\", \"loop/plan/search\");") });
refRow("stackStatus", "status", "name:path=status|stack", "tp.stack(\"name\", \"path=failure\")", "runs", "What a path ended with; a path without status runs.", "any word: failure, error, fail (red); timeout, warning (yellow); success, ok, done (green); others gray",
    { ex: refEx("bt:root/patrol/battery_ok=success,root/patrol/goto|stack", "tp.stack(\"bt\", \"root/patrol/battery_ok=success,root/patrol/goto\");") });
refRow("stackMany", "at once", "name:a/b,c/d|stack", "tp.stack(\"name\", \"a/b,c/d\")", "", "Several paths at once, separated by commas.", "", { ex: refEx("task:nav/follow,arm/idle|stack", "tp.stack(\"task\", \"nav/follow,arm/idle\");") });
refRow("stackParts", "parts of a tick", "name:time:path|stack", "tp.stack(\"name\", \"path\", Teleplot::ms(t))", "", "Lines with the same time (yours) are parts of one sample: a tick too long for one message.", "the same time on each part",
    { ex: refEx("task:{now}.25:loop/plan|stack", "tp.stack(\"task\", \"loop/plan\", Teleplot::ms({now}.25));") });
refRow("stackLevel", "a level while it lives", null, "Teleplot::Stack(tp, \"name\", \"level\")", "", "A level pushed when the object is made, popped when it ends (other threads: name.thread).", "", { py: "with Teleplot.Stack(tp, \"name\", \"level\"):", note: "Clients only: the text protocol sends the paths (stack row)." });
refRow("oneThread", "one thread", null, ".oneThread()", "named per thread", "A stack used from one thread only: no thread names.", "");
refRow("enum", "states, nodes", "name:a,b/c#kind|enum", ".enumValues({\"a\", \"b/c#kind\"})", "", "The structure of a graph: its states or nodes, a path each (b/c: c inside b). Also the texts a setting can take.", "paths separated by commas; same time = parts of one; a newer time replaces it",
    { ex: refEx("mode:idle,mission/goto,mission/grasp,error|enum", "tp.telemetry(\"mode\").enumValues({\"idle\", \"mission/goto\", \"mission/grasp\", \"error\"});") });
refRow("kind", "kind", "name:node#kind|enum", ".enumValues({\"node#kind\"})", "none", "Free text written above a node (fallback, sequence...); for a setting, a caption of the choice.", "after #",
    { ex: refEx("bt:root#fallback,root/patrol#sequence,root/dock#action|enum", "tp.telemetry(\"bt\").enumValues({\"root#fallback\", \"root/patrol#sequence\", \"root/dock#action\"});") });
refRow("edges", "transitions", "name:from>to=event|edges", ".edges({\"from>to=event\"})", "none: a tree", "The transitions of a state machine and what makes them happen; without edges, the paths make a tree.", "from>to or from>to=event, separated by commas",
    { ex: refEx("mode:idle>mission=start,mission/goto>mission/grasp=arrived|edges", "tp.telemetry(\"mode\").edges({\"idle>mission=start\", \"mission/goto>mission/grasp=arrived\"});") });
refRow("escape", "special characters", "%XX", "", "", "In names of nodes, thresholds, dashboards and in ATTR| values, these characters are written %XX (their code in hexadecimal).", "% , ; | # / > = : < and line breaks, depending on where (%2C for a comma)", { call: null, note: "The clients escape by themselves." });

// Pictures
refRow("png", "PNG picture", "PNG|name:base64", "tp.telemetry(\"name\").image(Teleplot::Png, bytes, size)", "", "A picture: the bytes of a .png file, in base64. An image view shows the one of the time shown.", "base64 of the file; a time can come first (PNG|name:time:…)",
    { py: "tp.telemetry(\"name\").image(Teleplot.Png, data)", ex: { from: "camera,scene:iVBOR" } });
refRow("jpg", "JPEG picture", "JPG|name:base64", "tp.telemetry(\"name\").image(Teleplot::Jpeg, bytes, size)", "", "The same with the bytes of a .jpg file.", "base64 of the file",
    { py: "tp.telemetry(\"name\").image(Teleplot.Jpeg, data)", ex: { from: "JPG|camera" } });
refRow("parts", "in parts", "PNG|name:time:i/n:part", "", "one message", "A picture cut in parts, each in its own message: part i of n, from 1.", "the parts of one picture share its time; any order; a lost part loses that picture", { call: null, note: "The clients cut pictures in parts by themselves." });
refRow("raw", "values picture", "RAW|name:base64", "tp.telemetry(\"name\").image(Teleplot::Raw, bytes, size)", "", "Plain numbers (a depth map): width and height (2 bytes each), the format (0 gray16, 1 float32), 3 bytes at 0, then the numbers, little-endian.", "base64 of all of it; a 16-bit gray PNG works too",
    { py: "tp.telemetry(\"name\").image(Teleplot.Raw, data)", ex: { from: "RAW|depth" } });
refRow("scale", "value scale", "ATTR|name|scale=0.001", ".depthMap(0.001)", "1", "What a number of the picture is worth: number x scale, in the unit of the telemetry.", "a number, not 0",
    { ex: refEx("ATTR|depth|unit=m|scale=0.001", "tp.telemetry(\"depth\").unit(\"m\").depthMap(0.001);") });
refRow("nodata", "no measure", "ATTR|name|nodata=0", ".depthMap(0.001, 0)", "0", "The number of a pixel that has no measure (NaN never is one).", "a number; nodata= empty: every number is a measure (NAN in the clients)");
refRow("depth", "distances", "ATTR|name|depth=1", ".depthMap(s) / .pixelValues(s)", "1: distances", "Distances along the camera's axis are placed in 3D and 2D views (when it has a camera); depth=0 for other values (a temperature).", "1 or 0",
    { ex: refEx("ATTR|thermal|unit=°C|scale=0.01|depth=0", "tp.telemetry(\"thermal\").unit(\"°C\").pixelValues(0.01);") });

// Point clouds
refRow("pc", "point cloud", "name:x:y:z;x:y:z|pc", ".cloud(points)", "", "All the points of the line are one sample (a scan), in the frame of the sensor.", "x:y:z per point, separated by ; (a flat scan: z = 0, shown in 2D)",
    { ino: ".cloud(points, n)", ex: refEx("lidar:1:0:0;0.7:0.7:0;0:1:0|pc", "std::vector<Teleplot::Number3D> scan = {{1, 0, 0}, {0.7, 0.7, 0}, {0, 1, 0}};\ntp.telemetry(\"lidar\").cloud(scan);",
        { py: "tp.telemetry(\"lidar\").cloud([(1, 0, 0), (0.7, 0.7, 0), (0, 1, 0)])", ino: "static const Teleplot::Number3D SCAN[] = {{1, 0, 0}, {0.7, 0.7, 0}, {0, 1, 0}};\ntp.telemetry(\"lidar\").cloud(SCAN, 3);" }) });
refRow("intensity", "intensity", "x:y:z:i", ".cloud(points, intensities)", "none", "A value per point: points are colored from the lowest to the highest.", "a 4th number per point", { ino: ".cloud(points, n, intensities)" });
refRow("pointColor", "point colors", "x:y:z:r:g:b", ".cloud(points, colors)", "of the telemetry", "A color per point (x:y:z:i:r:g:b: both).", "red, green, blue from 0 to 255", { ino: ".cloud(points, n, colors)" });
refRow("cloudTime", "time of a scan", "name:time;x:y:z…|pc", ".at(Teleplot::ms(t)).cloud(points)", "when it arrives", "A field alone at the start: the time of the scan.", "milliseconds");

// Shapes: the properties of 2D| and 3D| lines
refRow("shape", "kind", "S:kind", ".shape(Teleplot::Rect)", "rect in 2D|, cube in 3D|", "What the shape is.", "rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl", { alt: "shape" });
refRow("position", "position", "P:x:y[:z]", ".position(x, y[, z])", "0, 0, 0", "Where its center is (the start of a line or an arrow).", "in your units: x forward, y to the left, z up; P::2 changes y only", { alt: "position" });
refRow("rotation", "rotation", "R:angle  or  R:roll:pitch:yaw", ".yaw(a)  or  .rotation(roll, pitch, yaw)", "0", "Turns it around its center (around its start for a line or an arrow).", "radians, counterclockwise; 3D|: around x, y, z", { alt: "rotation" });
refRow("quaternion", "quaternion", "Q:x:y:z:w", ".quaternion(w, x, y, z)", "none", "A rotation as a quaternion (the latest of R and Q is used).", "w last in a line, first in the calls", { alt: "quaternion" });
refRow("size", "size", "SC:x:y[:z]  or  SC:s", ".size(x, y[, z])  or  .size(s)", "1", "Its size along its own axes (an STL: its units times this).", "SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps", { alt: "scale" });
refRow("radius", "radius", "RA:r", ".size(2 * r)", "0.5", "Radius of a circle, a sphere or a cylinder (SC of twice that).", "in your units", { alt: "radius" });
refRow("v1size", "V1 sizes", "W:x  D:y  H:z", ".size(x, y, z)", "", "Sizes of Teleplot V1, still understood (H is y in a 2D| line).", "SC replaces them", { alt: "width depth height" });
refRow("precision", "precision", "PR:n", "", "", "Accepted for Teleplot V1, ignored: spheres and cylinders are always smooth.", "", { call: null, alt: "precision", note: "Nothing to send: it does nothing." });
refRow("color", "color", "C:color", ".color(\"orange\")", "of the palette", "Its color (of the whole shape).", "a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b})", { alt: "color" });
refRow("opacity", "opacity", "O:a", ".opacity(a)", "1", "0 invisible, 1 solid.", "0 to 1", { alt: "opacity" });
refRow("texture", "picture on it", "T:url:\"url\"  or  T:telem:picture", ".texture(\"url\")  or  .textureFrom(\"picture\")", "none", "A picture on its faces: a file, or the pictures of an image telemetry (the one of the time shown). Multiplied by its color: white shows it as it is.", "an url the browser can fetch, or the name of an image telemetry", { alt: "texture" });
refRow("url", "file", "U:\"url\"", ".stl(\"url\")", "", "The STL file of an stl shape (binary or text).", "between quotes: relative to the page, or on a site that allows it (CORS)", { alt: "url" });
refRow("points", "points", "PT:x:y:x:y…", ".points(pts)", "none", "The points of a line or a polygon, in the frame of the shape.", "as many as needed", { alt: "points", ino: ".points(pts, n)" });
refRow("vector", "vector", "V:x:y[:z]", ".vector(x, y[, z])", "0, 0: not drawn", "Where an arrow points and how long it is, from its start; the head is a quarter of it.", "in your units, turned by the rotation", { alt: "vector" });
refRow("lineWidth", "line width", "LW:w", ".lineWidth(w)", "1.5 px on screen", "Width of its lines, outlines included.", "in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line", { alt: "linewidth" });
refRow("text", "text", "TX:\"text\"", ".text(\"text\")", "", "What a text shape says.", "between quotes it can hold : and |", { alt: "text" });
refRow("textSize", "text size", "TS:h", ".textSize(h)", "steady on screen", "Height of a text, in your units (it then follows the zoom).", "in your units", { alt: "textsize" });
refRow("frame", "frame", "F:other", ".frame(\"other\")", "the scene", "Positions and rotations relative to another telemetry: it moves, this follows.", "the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene", { alt: "frame" });
refRow("pixels", "in the pixels of", "FPX:picture", ".pixelsOf(\"picture\")", "", "Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too.", "the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel", { alt: "pixels" });
refRow("intrinsics", "camera", "K:fx:fy:cx:cy:w:h", ".intrinsics(w, h, fx, fy, cx, cy)", "none", "On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures.", "in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention)", { alt: "intrinsics" });
refRow("distortion", "lens distortion", "DC:k1:k2:p1:p2:k3", ".distortion(k1, k2, p1, p2, k3)", "none", "The distortion of its lens: what is drawn over the picture is distorted the same (the picture never is).", "Brown-Conrady coefficients, as OpenCV gives them", { alt: "distortion" });
refRow("cameraPose", "camera pose", "P:x:y:z:R:… on the picture", ".position(x, y, z).rotation(r, p, y)", "at the origin", "Where the camera is in the scene: it looks along its x, y to the left of the picture, z up. SC: how far its pyramid is drawn.", "as for a shape");
refRow("shapeLine", "a 2D| or 3D| line", "2D|name,group:time:P…|flags", "", "", "A shape is a telemetry: its properties, each followed by its values. Send everything once, then only what changes.", "2D|: x:y and one angle, flat shapes seen from above; 3D|: x:y:z; time: and ; for several updates", { call: null, note: "In a client every call of a chain is a property." });

// Describe
refRow("color.attr", "color", "ATTR|name|color=teal", ".color(\"teal\")", "of the palette", "Its color in every view.", "a CSS name or #rrggbb; color= empty gives it back its own",
    { ex: refEx("ATTR|tank|color=teal", "tp.telemetry(\"tank\").color(\"teal\");") });
refRow("desc", "description", "ATTR|name|desc=…", ".desc(\"…\")", "none", "A sentence: the tooltip of its name wherever it is shown.", "any text (% | , = : and line breaks written %XX)",
    { ex: refEx("ATTR|tank|desc=Water left in the tank", "tp.telemetry(\"tank\").desc(\"Water left in the tank\");") });
refRow("unit.attr", "unit", "ATTR|name|unit=L", ".unit(\"L\")", "none", "Its unit, without a sample.", "", { ex: refEx("ATTR|tank|unit=L", "tp.telemetry(\"tank\").unit(\"L\");") });
refRow("min", "lowest", "ATTR|name|min=9", ".min(9)", "none", "The value it is expected above: the start of its bar, the bottom of a chart in range scale.", "a number; min= empty forgets it", { ex: refEx("ATTR|battery|min=9", "tp.telemetry(\"battery\").min(9);") });
refRow("max", "highest", "ATTR|name|max=12.6", ".max(12.6)", "none", "The value it is expected below.", "a number", { ex: refEx("ATTR|battery|max=12.6", "tp.telemetry(\"battery\").max(12.6);") });
refRow("range", "range", "ATTR|name|min=9|max=12.6", ".range(9, 12.6)", "none", "Both ends: a number with both gets a gauge on the Live dashboard.", "",
    { ex: refEx("ATTR|battery|min=9|max=12.6", "tp.telemetry(\"battery\").range(9, 12.6);") });
refRow("threshold", "threshold", "TH|name:low<10.5:hot>70", ".threshold(\"low\", Teleplot::Below, 10.5)", "none", "A limit with a name: < past when below, > past when above. Charts draw it, values say which one is passed.", "name<value or name>value; several separated by :",
    { ex: refEx("TH|battery:low<10.5:empty<9.9,red", "tp.telemetry(\"battery\").threshold(\"low\", Teleplot::Below, 10.5).threshold(\"empty\", Teleplot::Below, 9.9, \"red\");") });
refRow("thColor", "threshold color", "TH|name:hot>70,red", ".threshold(\"hot\", Teleplot::Above, 70, \"red\")", "the theme's", "The color of a limit.", "after a comma");
refRow("thTime", "from when", "TH|name:time:low<10.8", ".at(Teleplot::ms(t)).threshold(…)", "when it arrives", "Limits hold from their time on: what was drawn before keeps the limit it had.", "milliseconds, before the limits",
    { ex: refEx("TH|battery:{now}:low<10.8", "tp.telemetry(\"battery\").at(Teleplot::ms({now})).threshold(\"low\", Teleplot::Below, 10.8);") });
refRow("thRemove", "remove a limit", "TH|name:low<", ".removeThreshold(\"low\")", "", "A limit without value is removed from then on; the same name again replaces it.", "",
    { ex: refEx("TH|battery:empty<", "tp.telemetry(\"battery\").removeThreshold(\"empty\");") });
refRow("attrLine", "an ATTR| line", "ATTR|name|key=value|key…", "", "", "Describes a telemetry without a sample: sent once (again at will), before or after its data. A line with an unknown key is refused as a whole.", "keys: unit color desc min max scale nodata depth, and those of commands", { call: null, note: "In a client every call of a chain is a key." });

// Commands
refRow("write", "writable", "ATTR|name|write[=type]", "tp.param(\"name\", &variable)", "not writable", "The page may change it (switch CMD on): it sends the line your device would send, your device applies it and sends it back.", "write alone: the type of its data; write= empty: no more",
    { py: "tp.param(\"name\", initial)", ex: refEx("ATTR|speed_limit|write|min=0|max=2|step=0.1", "float speedLimit = 1.2f;\ntp.param(\"speed_limit\", &speedLimit).range(0, 2).step(0.1);", { py: "speed_limit = tp.param(\"speed_limit\", 1.2).range(0, 2).step(0.1)", ino: "static float speedLimit = 1.2f;\ntp.param(\"speed_limit\", &speedLimit).range(0, 2).step(0.1);" }) });
refRow("writeType", "type", "write=number|bool|text|xy|xyz|pose2d", "the type of the variable", "of its data", "What it holds: number (a slider), bool (a switch: 0 or 1), text, xy, xyz, pose2d (x, y, an angle in radians).", "number, bool, text, xy, xyz, pose2d", { call: "float, double, int, bool, std::string, Number2D, Number3D, Pose2D", ino: "float, double, int, bool, char[N], Number2D, Number3D, Pose2D", py: "float, int, bool, str, Number2D, Number3D, Pose2D" });
refRow("step", "step", "ATTR|name|write|step=0.1", ".step(0.1)", "none", "What the slider moves by (also how close the echo must be).", "a number");
refRow("choices", "choices", "name:a,b#caption|enum", ".enumValues({\"a\", \"b#caption\"})", "any text", "The texts a text setting can take; #caption: words shown with a choice.", "an enum, as for a graph");
refRow("echo", "applied", "name:value", "", "", "What the page sends is the line your device would send, without a time; your device sends the value back: that is how the page knows.", "", { call: null, note: "The clients apply, answer and publish by themselves in poll()." });
refRow("refuse", "refused", "ACK|name:err:why", "return Teleplot::error(\"why\")", "", "Your device refuses a value (optional: its value already tells). For a joystick, answered to each value it cannot apply now.", "", { call: ".onChange([](float v) { return Teleplot::error(\"why\"); })", py: ".onChange(lambda v: Teleplot.error(\"why\"))" });
refRow("rate", "rate", "ATTR|name|write=…|rate=20", ".rate(20)", "none", "Continuous: while it is held, the page sends the value that many times per second (a joystick).", "per second");
refRow("hold", "hold", "ATTR|name|write=…|hold=200", ".hold(200)", "none", "Your device stops by itself when nothing came for that long: the safety is on the device.", "milliseconds");
refRow("axes", "axes", "ATTR|name|write=pose2d|axes=x,yaw", ".axes(Teleplot::X | Teleplot::Yaw)", "x, y, yaw", "Which axes of a pose2d move: x,yaw is a base that cannot go sideways (one stick).", "x, y, yaw separated by commas");
refRow("action", "action", "ATTR|name|action", "tp.action(\"name\", handler)", "", "A button: the page calls it, your device answers.", "action= empty: no more",
    { ex: refEx("ATTR|reset|action|title=Reset odometry|confirm", "tp.action(\"reset\", [](Teleplot::Args const&) { resetOdometry(); return Teleplot::ok(); }).title(\"Reset odometry\").confirm();",
        { py: "tp.action(\"reset\", lambda args: (resetOdometry(), Teleplot.ok())[1]).title(\"Reset odometry\").confirm()", ino: "tp.action(\"reset\", [](Teleplot::Args const&) { resetOdometry(); return Teleplot::ok(); }).title(\"Reset odometry\").confirm();" }) });
refRow("title", "button text", "ATTR|name|action|title=…", ".title(\"…\")", "its name", "The text of the button.", "any text");
refRow("confirm", "asks first", "ATTR|name|action|confirm", ".confirm()", "no", "The button asks before calling.", "a flag (confirm=0: no)");
refRow("longpress", "hold to press", "ATTR|name|action|longpress", ".longpress()", "no", "The button must be held 1 s.", "a flag");
refRow("actionColor", "button color", "ATTR|name|action|color=red", ".color(\"red\")", "the theme's", "The color of the button.", "a CSS name or #rrggbb");
refRow("arg", "argument", "ATTR|name|arg=a|type=…", ".arg(Teleplot::Arg(\"a\", Teleplot::Arg::Number))", "none", "One line per argument, in order: the button opens a form.", "type= empty removes it", { py: ".arg(Teleplot.Arg(\"a\", Teleplot.Arg.Number))" });
refRow("argType", "argument type", "type=number", "Teleplot::Arg(\"a\", Teleplot::Arg::XY)", "number", "What the argument holds.", "number, bool, text, xy, xyz, pose2d");
refRow("optional", "optional", "optional", ".optional()", "needed", "The form can leave it empty.", "a flag");
refRow("default", "default", "default=…", ".defaultValue(v)", "none", "What the form starts with.", "a value of its type");
refRow("argEnum", "argument choices", "enum=a,b", ".enumValues({\"a\", \"b\"})", "any text", "The texts a text argument can take.", "separated by commas");
refRow("argMore", "limits of an argument", "min= max= step= unit= desc=", ".range(0, 1).step(0.1).unit(\"m\").desc(\"…\")", "none", "As for a setting.", "");
refRow("call", "a call", "!name#id:a=v:b=v", "", "", "What the page sends: an id that grows, then the arguments by name (several numbers separated by commas: target=1.5,2).", "", { call: null, note: "The clients read it in poll() and call the handler with its Args." });
refRow("answer", "the answer", "ACK|name#id:run | ok[:result] | err:why", "return Teleplot::ok(\"result\")", "", "Started, done (with a short result), failed. A call sent again with its id is answered again, never run twice.", "", { call: "Teleplot::ok(), Teleplot::error(\"why\"), Teleplot::running()", ino: "Teleplot::ok(), Teleplot::error(\"why\")" });

// Dashboards
refRow("dash", "a DASH| line", "DASH|dashboard/…/view:type:telemetries|option=value", "tp.dashboard(\"DASH|…\")", "", "One line per view, addressed by its path: missing layouts are created. Lines can come in any order and again: a line only does something when it changed.", "the last name is the title of the view; #1 is a name without title",
    { ex: refEx("DASH|Robot/Motion:chart:speed,accel|w=4|h=3", "tp.dashboard(\"DASH|Robot/Motion:chart:speed,accel|w=4|h=3\");") });
refRow("dashType", "type", ":chart", "", "what suits its first telemetry", "What it is.", "chart, values, log, timeline, graph, 2d, 3d, image, joystick; row, column, grid, stack (layouts); none removes it", { call: null });
refRow("dashTelemetries", "telemetries", ":speed,accel", "", "none", "What it shows, by name: they do not have to exist yet.", "names separated by commas", { call: null });
refRow("w", "width", "|w=4", "", "2 (a chart), 1 (values)", "Columns of a grid, a share of a row.", "a whole number", { call: null });
refRow("h", "height", "|h=3", "", "what it needs", "Steps of 4 em (a share of a column).", "a whole number", { call: null });
refRow("dashTitle", "title", "|title=…", "", "the last name of the path", "The text in the corner.", "title= empty: none", { call: null });
refRow("time.group", "time group", "|time=Live", "", "inherit", "Views of a group zoom and point at the same time; another group stays on its own.", "inherit, dashboard, or a name shared by the views that zoom together", { call: null,
    ex: refEx("DASH|Robot/Camera:image:camera|time=Live", "tp.dashboard(\"DASH|Robot/Camera:image:camera|time=Live\");") });
refRow("follow", "follows groups", "|follow=motors", "", "none", "The view takes the telemetries of these groups that it can display, those received and those to come.", "groups separated by commas", { call: null,
    ex: refEx("DASH|Robot/Speeds:chart|follow=motors", "tp.dashboard(\"DASH|Robot/Speeds:chart|follow=motors\");") });
refRow("justify", "justify", "|justify=start", "", "start", "Of a row or a column: where its views go along it.", "start, center, end, space-between, space-around", { call: null });
refRow("align", "align", "|align=stretch", "", "stretch (start in the editor)", "Of a row or a column: where its views go across it.", "start, center, end, stretch", { call: null });
refRow("gap", "gap", "|gap=1", "", "1", "Of a layout: the space between its views.", "in em", { call: null });
refRow("columnWidth", "column width", "|columnWidth=16", "", "16", "Of a grid: the minimum width of a column; the number of columns follows the width.", "in em, 8 to 40", { call: null });
refRow("appearance", "appearance", "|appearance=flat", "", "card at the top", "Of a layout: views as cards, flat (hairlines, no gap), or as the layout around.", "card, flat, inherit", { call: null });
refRow("accent", "top color", "|accent=off", "", "on at the top", "Of a layout: the colored line on top of its views.", "on, off, inherit", { call: null });
refRow("dashAlone", "the dashboard alone", "DASH|dashboard:type", "", "grid", "Its top layout.", "row, column, grid, stack", { call: null });

// Client
refRow("instance", "the client", null, "Teleplot& tp = Teleplot::instance()", "127.0.0.1:47269", "The default client: UDP to the Teleplot server (Arduino: the serial port).", "", { py: "tp = Teleplot.instance()", ino: "Teleplot tp(Serial)" });
refRow("constructor", "a client of your own", null, "Teleplot tp(Teleplot::Options().udp(\"10.0.0.2\", 47269).file(\"run.teleplot\").output(fn))", "", "Where it sends: as many outputs as wanted.", "Options: udp(host, port), file(path) (a binary data file), output(function)", { py: "tp = Teleplot(udp=(\"10.0.0.2\", 47269), file=\"run.teleplot\", output=fn)", ino: "Teleplot tp(udp, host, port)" });
refRow("options", "options", null, "Teleplot::Options().name(\"rover\").clientId(0).flushInterval(Teleplot::ms(20)).sendFrom(Teleplot::Thread).describeInterval(Teleplot::ms(5000)).publishInterval(Teleplot::ms(200)).maxQueuedBytes(1 << 20).nonBlocking(false)", "", "name (default: the program's), clientId (0: from the name), flushInterval (20 ms; 0: on flush() and poll()), sendFrom (the caller or a thread of its own), describeInterval (descriptions sent again, 5 s), publishInterval (settings, 200 ms), maxQueuedBytes (1 MB: beyond, the oldest go first), nonBlocking.", "", { py: "Teleplot(name=\"rover\", flushInterval=0.02, sendFrom=Teleplot.Thread, describeInterval=5.0, publishInterval=0.2, maxQueuedBytes=1 << 20, nonBlocking=False)", ino: null, note: "setOptions(Options) changes them later, options() reads them." });
refRow("setOptions", "change the options", null, "tp.setOptions(Teleplot::Options().flushInterval(Teleplot::ms(0))); tp.options()", "", "Options changed later; tp.options() reads them.", "", { ino: null, py: "tp.setOptions(flushInterval=0); tp.options()" });
refRow("addOutput", "another destination", null, null, "", "A second Print (a file on an SD card): it gets the plain lines.", "", { ino: "tp.addOutput(file)", py: null });
refRow("telemetryHandle", "a handle", null, "Teleplot::Telemetry speed = tp.telemetry(\"speed\")", "", "The handle of a telemetry: faster than by name in a loop; its calls chain; name() gives the name back.", "", { py: "speed = tp.telemetry(\"speed\")", ino: "auto speed = tp.telemetry(\"speed\")" });
refRow("update", "a sample", null, "tp.update(\"name\", value[, time])", "", "A number, bool, text, Number2D or Number3D.", "", {});
refRow("logCall", "a log line", null, "tp.log([\"name\",] \"text\"[, time])", "", "A log line (default name: log).", "");
refRow("stackCall", "what runs", null, "tp.stack(\"name\", \"path\"[, time])", "", "The path of a stack.", "");
refRow("dashboardCall", "dashboard lines", null, "tp.dashboard(\"DASH|…\")", "", "Sends DASH| lines (several separated by \\n).", "");
refRow("at", "a time of yours", null, ".at(Teleplot::ms(t))", "now (one for the chain)", "Every sample of the chain gets that time: first in a chain only.", "a Teleplot::Time");
refRow("timeHelpers", "times", null, "Teleplot::now(), Teleplot::ms(x), Teleplot::us(x), Teleplot::ns(x)", "", "Times: now() is the clock of the client (system time; micros() since boot on Arduino).", "");
refRow("clock", "the clock", null, "tp.clock(fn)", "system_clock / micros()", "Where now comes from (a simulation or ROS time).", "a function giving a Time; tp.currentTime() reads it", { ino: "tp.clock(fn)" });
refRow("currentTime", "now", null, "tp.currentTime()", "", "Now, on the clock of this client.", "", { ino: null });
refRow("deg", "degrees", null, "Teleplot::deg(90)", "", "Degrees to radians (angles are radians).", "");
refRow("flush", "send now", null, "tp.flush()", "every 20 ms", "Sends what is queued now.", "");
refRow("poll", "read and answer", null, "tp.poll()", "", "Reads what the page sent, applies settings, answers calls, publishes settings, sends: call it in your loop when the page can change something.", "");
refRow("nonBlocking", "never wait", null, ".nonBlocking()", "Options' (false)", "Never waits for the lock of the client: a sample that cannot be queued at once is dropped (counted).", "", { ino: null });
refRow("enable", "off", null, "tp.disable() / tp.enable()", "on", "Off at run time; #define TELEPLOT_DISABLE compiles it out.", "", { py: "tp.disable() / tp.enable()" });
refRow("handle", "what came back", null, "tp.handlePacket(data, size)", "", "What the page sent, when it reaches you by another way.", "", { ino: "tp.handleLine(\"text\")", py: "tp.handlePacket(data)" });
refRow("param", "a setting", null, "tp.param(\"name\", &variable)", "", "A setting the page may write: Param<T> chains range, min, max, step, unit, desc, enumValues, rate, hold, axes, onChange. A number is clamped to the range and rounded to the step.", "", { py: "tp.param(\"name\", initial)  or  tp.param(\"name\", object, \"attribute\")" });
refRow("onChange", "when it changes", null, ".onChange([](float const& v) { return Teleplot::ok(); })", "applied", "Called with the value the page wrote: return ok, or error(why) to refuse.", "", { py: ".onChange(lambda v: Teleplot.ok())" });
refRow("actionCall", "an action", null, "tp.action(\"name\", [](Teleplot::Args const& args) { return Teleplot::ok(); })", "", "An action the page may call: Action chains title, desc, color, confirm, longpress, arg.", "", { py: "tp.action(\"name\", handler)  or  @tp.action(\"name\")" });
refRow("argCall", "an argument", null, "Teleplot::Arg(\"speed\", Teleplot::Arg::Number).optional().defaultValue(0.5).range(0, 1).step(0.1).unit(\"m/s\").enumValues({}).desc(\"…\")", "", "An argument of an action.", "types Number, Bool, Text, XY, XYZ, Pose2D", { py: "Teleplot.Arg(\"speed\", Teleplot.Arg.Number).optional().defaultValue(0.5)" });
refRow("args", "the arguments", null, "args.has(\"a\"), args.number(\"a\"), args.flag(\"a\"), args.text(\"a\"), args.xy(\"a\"), args.xyz(\"a\"), args.pose2d(\"a\"), args.call()", "", "What the handler gets: the arguments by name; call() keeps the call to answer it later.", "", { ino: "args.has(\"a\"), args.number(\"a\"), args.flag(\"a\"), args.text(\"a\"), args.xy(\"a\"), args.xyz(\"a\"), args.pose2d(\"a\")" });
refRow("results", "answers", null, "Teleplot::ok(\"text\"), Teleplot::error(\"why\"), Teleplot::running()", "", "What a handler returns; running(): finished later with tp.answer(call, result).", "", { ino: "Teleplot::ok(\"text\"), Teleplot::error(\"why\")" });
refRow("answerCall", "answer later", null, "tp.answer(call, Teleplot::ok())", "", "Finishes a call whose handler returned running().", "", { ino: null });
refRow("imageCall", "a picture", null, ".image(Teleplot::Jpeg, bytes, size)  or  .image(picture)", "", "JPEG, PNG or RAW bytes, cut in parts by the client.", "", { py: ".image(Teleplot.Jpeg, data)  or  .image(picture)" });
refRow("encode", "encode pixels", null, "TeleplotImage::encode(pixels[, TeleplotImage::Jpeg{80}])", "JPEG 80", "Pixels to a JPEG or PNG (or RAW for depth): Pixels{data, width, height, format, stride}; formats Gray8, Gray16, Float32, RGB8, BGR8, RGBA8, BGRA8, YUYV.", "Png{} keeps the pixels exactly (16-bit gray for depth)", { ino: null, py: "TeleplotImage.encode(pixels, TeleplotImage.Jpeg(80))" });
refRow("sendImage", "send pixels", null, "TeleplotImage::send(tp.telemetry(\"camera\"), pixels)", "", "Encoded on a thread of the client then sent: the picture being encoded always finishes, only the latest one waits.", "", { ino: null, py: "TeleplotImage.send(tp.telemetry(\"camera\"), pixels)" });
refRow("imageTools", "picture tools", null, "TeleplotImage::load(path), TeleplotImage::typeOf(bytes, size), TeleplotImage::shrink(pixels, factor), TeleplotImage::copy(pixels), TeleplotImage::stats(tp)", "", "A file as it is, its type, smaller by a whole factor, a copy, the counts of the encoder.", "", { ino: null, py: "TeleplotImage.load(path), TeleplotImage.typeOf(data), TeleplotImage.shrink(pixels, factor), TeleplotImage.stats(tp)" });
refRow("sendStats", "statistics", null, "tp.sendStats(Teleplot::ms(1000)); tp.statsInterval()", "off", "The counts of the client as telemetries (groups teleplot sent, teleplot problems, teleplot images).", "how often; Teleplot::ms(0): off; tp.statsInterval() reads it");
refRow("stats", "counts", null, "tp.stats()", "", "packets, bytes, samples, dropped, tooBig, sendErrors, wrongThread.", "", { py: "tp.stats()" });
refRow("threads", "threads", null, "tp.threadPriority(Teleplot::Low); tp.threadAffinity(Teleplot::ThreadAffinity::cpus({3}))", "BelowCaller, automatic", "Priority and CPUs of the threads of the client (sending, encoding pictures).", "BelowCaller, Normal, Low, ThreadPriority::realtime(p), ThreadPriority::value(v); ThreadAffinity::automatic(), followCaller(), any(), cpus({…})", { ino: null, py: "tp.threadPriority(Teleplot.Low)" });
refRow("threadName", "a thread's name", null, "Teleplot::threadName(\"camera\")", "", "The name of the calling thread, for the telemetries of its stacks (name.thread).", "", { ino: null });
refRow("extension", "companions", null, "tp.extension<T>()", "", "The state a companion header keeps in the client (TeleplotImage.h's thread).", "", { ino: null, py: null });
refRow("lines", "lines", "line\\nline", null, "", "Several lines in one packet or one write, separated by a line break. A UDP packet should stay under about 1400 bytes.", "", { note: "The clients pack lines by themselves." });
refRow("serial", "on a serial port", ">line", null, "", "Telemetry starts with >; any other line is a log line of the port.", "", { ino: null, note: "The Arduino library writes the > by itself." });

// ---------------------------------------------------------------------------------------------------------------- the pages
// A thing: its family, title, a few words, its rows (in order), a drawing (refDrawing), the view whose options it lists, a first example
const REF_THINGS = [
    // Telemetries
    { id: "number", family: "telemetries", title: "Number", sub: "a value over time", rows: ["value", "time", "samples", "unit", "label", "np", "clr", "timeout", "maxRate", "precise"] },
    { id: "position", family: "telemetries", title: "2D position", sub: "a point on a map, its trail", rows: ["xy", "time", "label", "pointFrame", "np", "clr"] },
    { id: "point3d", family: "telemetries", title: "3D point", sub: "a point in space, its trail", rows: ["xyz", "time", "label", "pointFrame", "np", "clr"] },
    { id: "state", family: "telemetries", title: "State", sub: "a text whose latest value matters", rows: ["state", "emptyState", "time", "choices", "label"] },
    { id: "log", family: "telemetries", title: "Log", sub: "lines to read in order", rows: ["log", "logLine", "logKind", "time", "label"] },
    { id: "stack", family: "telemetries", title: "Stack", sub: "what runs, as a path", rows: ["stack", "stackStatus", "stackMany", "stackParts", "stackKind", "stackLevel", "oneThread"] },
    { id: "graph", family: "telemetries", title: "Graph structure", sub: "states, nodes, transitions", rows: ["enum", "kind", "edges", "stackStatus", "escape"] },
    { id: "picture", family: "telemetries", title: "Picture", sub: "PNG or JPEG", rows: ["png", "jpg", "parts", "time", "label", "intrinsics", "imageCall"] },
    { id: "depthmap", family: "telemetries", title: "Depth map", sub: "a picture of values", rows: ["raw", "scale", "nodata", "depth", "unit.attr", "intrinsics"] },
    { id: "cloud", family: "telemetries", title: "Point cloud", sub: "a scan: points as one sample", rows: ["pc", "intensity", "pointColor", "cloudTime", "position", "rotation", "frame", "clr"] },
    // Shapes
    { id: "applies", family: "shapes", title: "What applies to what", sub: "every property, every shape", matrix: true, rows: [] },
    { id: "rect", family: "shapes", title: "Rectangle", sub: "2D, the default of 2D| lines", drawing: "rect", rows: ["shape", "position", "size", "rotation", "lineWidth", "color", "opacity", "texture", "frame", "pixels", "shapeLine"],
        ex: refEx("2D|robot,field:S:rect:P:1.2:0.8:R:0.5:SC:0.3:0.2:C:blue", "tp.telemetry(\"robot\").label(\"field\").shape(Teleplot::Rect).position(1.2, 0.8).yaw(0.5).size(0.3, 0.2).color(\"blue\");") },
    { id: "circle", family: "shapes", title: "Circle", sub: "2D, a disc", drawing: "circle", rows: ["shape", "position", "radius", "size", "lineWidth", "color", "opacity", "frame", "pixels"],
        ex: refEx("2D|spot,field:S:circle:P:2.5:1.5:RA:0.3:C:orange:O:0.5", "tp.telemetry(\"spot\").label(\"field\").shape(Teleplot::Circle).position(2.5, 1.5).size(0.6).color(\"orange\").opacity(0.5);") },
    { id: "line", family: "shapes", title: "Line", sub: "2D, through points", drawing: "line", rows: ["shape", "points", "position", "rotation", "lineWidth", "color", "opacity", "frame", "pixels"],
        ex: refEx("2D|route,field:S:line:PT:0:0:1:0.5:2:2:3:2:C:green:LW:0.05", "std::vector<Teleplot::Number2D> route = {{0, 0}, {1, 0.5}, {2, 2}, {3, 2}};\ntp.telemetry(\"route\").label(\"field\").shape(Teleplot::Line).points(route).color(\"green\").lineWidth(0.05);",
            { py: "tp.telemetry(\"route\").label(\"field\").shape(Teleplot.Line).points([(0, 0), (1, 0.5), (2, 2), (3, 2)]).color(\"green\").lineWidth(0.05)", ino: "static const Teleplot::Number2D ROUTE[] = {{0, 0}, {1, 0.5}, {2, 2}, {3, 2}};\ntp.telemetry(\"route\").label(\"field\").shape(Teleplot::Line).points(ROUTE, 4).color(\"green\").lineWidth(0.05);" }) },
    { id: "polygon", family: "shapes", title: "Polygon", sub: "2D, a surface", drawing: "polygon", rows: ["shape", "points", "position", "rotation", "lineWidth", "color", "opacity", "frame", "pixels"],
        ex: refEx("2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3", "std::vector<Teleplot::Number2D> zone = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};\ntp.telemetry(\"zone\").label(\"field\").shape(Teleplot::Polygon).points(zone).color(\"red\").opacity(0.3);",
            { py: "tp.telemetry(\"zone\").label(\"field\").shape(Teleplot.Polygon).points([(0, 0), (1, 0), (1, 1), (0, 1)]).color(\"red\").opacity(0.3)", ino: "static const Teleplot::Number2D ZONE[] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};\ntp.telemetry(\"zone\").label(\"field\").shape(Teleplot::Polygon).points(ZONE, 4).color(\"red\").opacity(0.3);" }) },
    { id: "arrow", family: "shapes", title: "Arrow", sub: "2D and 3D, from a point along a vector", drawing: "arrow", rows: ["shape", "position", "vector", "lineWidth", "rotation", "color", "opacity", "frame", "pixels"],
        ex: refEx("2D|wind,field:S:arrow:P:0.5:2:V:0.8:0.3:C:purple:LW:0.05", "tp.telemetry(\"wind\").label(\"field\").shape(Teleplot::Arrow).position(0.5, 2).vector(0.8, 0.3).color(\"purple\").lineWidth(0.05);") },
    { id: "textshape", family: "shapes", title: "Text", sub: "2D, words in the scene", drawing: "text", rows: ["shape", "text", "position", "textSize", "rotation", "color", "opacity", "frame", "pixels"],
        ex: refEx("2D|goal,field:S:text:P:3:2:TX:\"Goal A\":TS:0.3", "tp.telemetry(\"goal\").label(\"field\").shape(Teleplot::Text).position(3, 2).text(\"Goal A\").textSize(0.3);") },
    { id: "cube", family: "shapes", title: "Cube", sub: "3D, the default of 3D| lines", drawing: "cube", rows: ["shape", "position", "size", "rotation", "quaternion", "color", "opacity", "texture", "frame", "v1size", "shapeLine"],
        ex: refEx("3D|box,scene:S:cube:P:1:0:0.5:SC:1:1:1:C:orange", "tp.telemetry(\"box\").label(\"scene\").shape(Teleplot::Cube).position(1, 0, 0.5).size(1, 1, 1).color(\"orange\");") },
    { id: "sphere", family: "shapes", title: "Sphere", sub: "3D", drawing: "sphere", rows: ["shape", "position", "radius", "size", "rotation", "color", "opacity", "texture", "frame", "precision"],
        ex: refEx("3D|ball,scene:S:sphere:P:0:1:0.5:RA:0.5:C:red", "tp.telemetry(\"ball\").label(\"scene\").shape(Teleplot::Sphere).position(0, 1, 0.5).size(1).color(\"red\");") },
    { id: "cylinder", family: "shapes", title: "Cylinder", sub: "3D, standing along z", drawing: "cylinder", rows: ["shape", "position", "radius", "size", "rotation", "quaternion", "color", "opacity", "texture", "frame", "precision"],
        ex: refEx("3D|post,scene:S:cylinder:P:-1:0:0.5:SC:0.4:0.4:1:C:gray", "tp.telemetry(\"post\").label(\"scene\").shape(Teleplot::Cylinder).position(-1, 0, 0.5).size(0.4, 0.4, 1).color(\"gray\");") },
    { id: "stl", family: "shapes", title: "Mesh", sub: "3D, an STL file", drawing: "stl", rows: ["shape", "url", "size", "position", "rotation", "quaternion", "color", "opacity", "frame"],
        ex: refEx("3D|pawn,scene:S:stl:U:\"media/pawn.stl\":P:0:0:0:C:orange", "tp.telemetry(\"pawn\").label(\"scene\").stl(\"media/pawn.stl\").position(0, 0, 0).color(\"orange\");") },
    { id: "camera", family: "shapes", title: "Camera", sub: "of an image telemetry", drawing: "camera", rows: ["intrinsics", "distortion", "cameraPose", "position", "rotation", "quaternion", "size", "frame"],
        ex: refEx("3D|camera:K:55:55:32:24:64:48:P:0:0:1", "tp.telemetry(\"camera\").intrinsics(64, 48, 55, 55, 32, 24).position(0, 0, 1);") },
    { id: "frames", family: "shapes", title: "Frames", sub: "moving together, drawing on pictures", drawing: "frames", rows: ["frame", "pixels", "pointFrame"],
        ex: refEx("2D|heading,field:S:arrow:V:0.4:0:F:robot", "tp.telemetry(\"heading\").label(\"field\").frame(\"robot\").shape(Teleplot::Arrow).vector(0.4, 0);") },
    // Describe
    { id: "describe", family: "describe", title: "Unit, color, description", sub: "ATTR| lines", rows: ["attrLine", "unit.attr", "unit", "color.attr", "desc", "escape"] },
    { id: "range", family: "describe", title: "Range", sub: "what a number is expected between", rows: ["range", "min", "max"] },
    { id: "thresholds", family: "describe", title: "Thresholds", sub: "limits with a name", rows: ["threshold", "thColor", "thTime", "thRemove", "escape"] },
    { id: "groups", family: "describe", title: "Groups", sub: "what goes together", rows: ["label", "follow"] },
    { id: "keeping", family: "describe", title: "Showing and keeping", sub: "Live dashboard, data window", rows: ["np", "clr", "timeout"] },
    // Commands
    { id: "setting", family: "commands", title: "Setting", sub: "a value the page may change", rows: ["write", "writeType", "min", "max", "step", "choices", "desc", "unit.attr", "echo", "refuse", "param", "onChange"] },
    { id: "continuous", family: "commands", title: "Continuous setting", sub: "driven by a joystick", rows: ["rate", "hold", "axes", "writeType", "refuse"],
        ex: refEx("ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200", "Teleplot::Pose2D velocity{0, 0, 0};\ntp.param(\"cmd_vel\", &velocity).axes(Teleplot::X | Teleplot::Yaw).rate(20).hold(200);",
            { py: "cmd_vel = tp.param(\"cmd_vel\", Teleplot.Pose2D(0, 0, 0)).axes(Teleplot.X | Teleplot.Yaw).rate(20).hold(200)", ino: "static Teleplot::Pose2D velocity{0, 0, 0};\ntp.param(\"cmd_vel\", &velocity).axes(Teleplot::X | Teleplot::Yaw).rate(20).hold(200);" }) },
    { id: "actionthing", family: "commands", title: "Action", sub: "a button that calls your device", rows: ["action", "title", "confirm", "longpress", "actionColor", "desc", "call", "answer", "actionCall", "args", "results", "answerCall"] },
    { id: "argument", family: "commands", title: "Argument", sub: "a field of an action's form", rows: ["arg", "argType", "optional", "default", "argEnum", "argMore", "argCall"] },
    // Views (their options are added from the views themselves)
    { id: "chart", family: "views", title: "Chart", sub: "numbers over time", view: "chart", drawing: "chart", rows: ["unit", "color.attr", "threshold", "range", "state", "log"],
        mouse: "Drag: zoom (the views of its time group follow) · double click: back to live · a legend entry: click to hide, point to highlight" },
    { id: "values", family: "views", title: "Values", sub: "the latest value of each", view: "values", drawing: "values", rows: ["unit", "range", "threshold", "desc", "write"],
        mouse: "With CMD on, a setting is changed in place: drag its bar or type a value" },
    { id: "logview", family: "views", title: "Log", sub: "text lines in order", view: "log", drawing: "log", rows: ["log", "logLine", "state", "color.attr"],
        mouse: "Follows the time of its group: pointing at a chart shows the line of that moment" },
    { id: "timeline", family: "views", title: "Timeline", sub: "states over time", view: "timeline", drawing: "timeline", rows: ["state", "log", "stack", "stackStatus", "threshold"],
        mouse: "Drag: zoom (its time group follows) · double click: back to live · point at a band: its text and how long it lasted" },
    { id: "graphview", family: "views", title: "Graph", sub: "a state machine or a behavior tree", view: "graph", drawing: "graph", rows: ["enum", "kind", "edges", "stack", "stackStatus"],
        mouse: "Drag: move · wheel: zoom · double click: fit" },
    { id: "map", family: "views", title: "2D map", sub: "the scene from above", view: "2d", drawing: "map", rows: ["xy", "shape", "pc", "frame", "color", "label"],
        mouse: "Drag: move · wheel: zoom · double click: fit · with CMD on, a writable pose is moved and turned" },
    { id: "scene", family: "views", title: "3D scene", sub: "shapes, points and clouds", view: "3d", drawing: "scene", rows: ["xyz", "shape", "pc", "intrinsics", "frame", "label"],
        mouse: "Drag: turn · right drag: move · wheel: zoom" },
    { id: "imageview", family: "views", title: "Image", sub: "a picture, drawn over", view: "image", drawing: "image", rows: ["png", "intrinsics", "distortion", "pixels", "raw", "scale"],
        mouse: "Point at a values picture: the value under the pointer" },
    { id: "joystick", family: "views", title: "Joystick", sub: "drives a continuous setting", view: "joystick", drawing: "joystick", rows: ["writeType", "rate", "hold", "axes", "refuse"],
        mouse: "Drag the pad or the rocker; with keyboard=arrows, the arrows while the view has the focus" },
    // Dashboards
    { id: "dashline", family: "dashboards", title: "DASH| lines", sub: "a view per line", rows: ["dash", "dashType", "dashTelemetries", "w", "h", "dashTitle", "time.group", "follow", "dashAlone", "escape"] },
    { id: "layouts", family: "dashboards", title: "Layouts", sub: "row, column, grid, stack", rows: ["dashType", "justify", "align", "gap", "columnWidth", "appearance", "accent", "w", "h"],
        ex: refEx("DASH|Robot/side:column|align=stretch|gap=0.5", "tp.dashboard(\"DASH|Robot/side:column|align=stretch|gap=0.5\");") },
    // Client
    { id: "setup", family: "client", title: "Set-up", sub: "where it sends", rows: ["instance", "constructor", "options", "setOptions", "addOutput", "clock", "currentTime", "enable", "lines", "serial"] },
    { id: "sending", family: "client", title: "Sending", sub: "samples, times, rates", rows: ["update", "logCall", "stackCall", "dashboardCall", "telemetryHandle", "at", "timeHelpers", "deg", "flush", "poll", "maxRate", "precise", "nonBlocking", "handle"] },
    { id: "clientcommands", family: "client", title: "Commands", sub: "settings and actions in code", rows: ["param", "onChange", "actionCall", "argCall", "args", "results", "answerCall", "poll"] },
    { id: "pictures", family: "client", title: "Pictures", sub: "pixels to JPEG or PNG", rows: ["imageCall", "encode", "sendImage", "imageTools"] },
    { id: "running", family: "client", title: "Threads and statistics", sub: "how the client runs", rows: ["sendStats", "stats", "threads", "threadName", "oneThread", "extension", "stackLevel"] },
];

// What a sentence says of each option of a view (the names and values come from the views: getOptionsSchema)
const REF_OPTIONS = {
    displayNumberDecimals: "Digits after the point of the values written.",
    decimation: "Draws the lowest and highest sample of each pixel instead of every sample: fast with millions of samples, nothing hidden.",
    thresholds: "In view: the scale includes the limits; If in view: drawn when the scale reaches them; Hidden.",
    scale: "Auto: the scale fits what is drawn; Range: the range of the telemetries (ATTR min max).",
    displayLayoutRow: "The values side by side instead of one under the other.",
    displayTelemetryName: "The name of each telemetry is written.",
    displayTelemetryColor: "The color of each telemetry is shown.",
    displayScale: "The ends of the range and the names of the limits under the bar.",
    displayTimestamp: "The time of each line is written.",
    maxLines: "The lines kept on screen (the data window keeps the samples).",
    stackDepth: "Levels of a stack drawn as full rows; deeper ones get thinner rows (0: no limit).",
    numbers: "Auto: a number is a line (bands when it has limits); As text: its values as states.",
    trail: "The recent path is drawn: where it went before reaching the current state.",
    events: "The events of the transitions are written on them.",
    kinds: "The kinds of the nodes (#kind) are written above them.",
    displayGrid: "The grid of the ground.",
    displayAxes: "The axes of the scene at its origin.",
    axisRight: "Which axis of the scene goes to the right of the map (also decides what is drawn on top).",
    axisUp: "Which axis of the scene goes to the top of the map.",
    displayLegend: "The names and values of what it shows.",
    trailLength: "Positions drawn behind a moving point (0: none).",
    pointSize: "Size of the points of positions and clouds, in pixels.",
    pointColorByHeight: "Points of clouds colored by their height instead of their intensity or color.",
    cloudCount: "Clouds drawn together: the latest and the ones before it.",
    cloudInterval: "Time between the clouds drawn together (0: the ones that came).",
    depthPoints: "Most points drawn from a depth map (it is thinned to that).",
    outline: "Shapes over the picture drawn as outlines only.",
    outlineWidth: "Width of those outlines, in pixels.",
    overlayOpacity: "How much of the shapes and points is drawn over the picture.",
    pixelDrawings: "Draws what is sent in the pixels of its picture (FPX).",
    colormap: "Colors of a values picture.",
    valueRange: "Colors spread over the range of the telemetry, or over what each picture holds.",
    displayColorScale: "The scale of the colors with its values.",
    keyboard: "Drive it with the keyboard while the view has the focus.",
    orientation: "Rocker of a number: horizontal (right for +) or vertical (up for +).",
};
// The options every view has: in the DASH| line (w, h, title, time, follow) and in the Edit panel
const REF_VIEW_COMMON = ["w", "h", "dashTitle", "time.group", "follow"];

// The rows of the options of a view, from the view itself: {id, name, text, call (the same in every language), def, what, values, src: "view", ex}
function refViewRows(TP, type) {
    const view = TP.view.createView(type, []);
    return view.getOptionsSchema().filter((o) => o.key != "title").map((o) => {
        const def = view.options[o.key];
        const other = o.type == "bool" ? !def : (o.type == "choice" ? (o.choices.find((c) => c[0] != def) || o.choices[0])[0] : (o.type == "int" || o.type == "number" ? Math.min(o.max !== undefined ? o.max : Infinity, Math.max(o.min !== undefined ? o.min : -Infinity, Number(def) ? Math.round(Number(def) * 2) : 1)) : def));
        const values = o.type == "bool" ? "true or false" : (o.type == "choice" ? o.choices.map((c) => c[0] + (c[1] != c[0] ? " (" + c[1] + ")" : "")).join(", ") : (o.min !== undefined ? "from " + o.min + " to " + o.max : o.type));
        const line = "DASH|Reference/" + type + ":" + type + "|" + o.key + "=" + other;
        return { id: "opt." + type + "." + o.key, name: o.label.toLowerCase(), text: "|" + o.key + "=", call: "|" + o.key + "=", py: "|" + o.key + "=", ino: "|" + o.key + "=", option: true,
            def: String(def), what: REF_OPTIONS[o.key] || "", values, src: "view", ex: { code: line, lib: "tp.dashboard(\"" + line + "\");" } };
    });
}

// ---------------------------------------------------------------------------------------------------------------- languages
// The call of a row for a sender: {text, none} (none: this language has no call; text then says what to do)
function refCall(row, senderId) {
    if (senderId == "raw" || senderId == "sh") {
        if (row.text === null || row.text === undefined) return { text: "", none: true };
        return { text: row.text, none: false };
    }
    let call = row.call;
    if (senderId == "py") call = row.py !== undefined ? row.py : (row.call ? helpPython(row.call) : row.call);
    else if (senderId == "ino") call = row.ino !== undefined ? row.ino : row.call;
    if (call === null || call === undefined || call === "") return { text: "", none: true };
    return { text: call, none: false };
}
// The example of a row, or of a thing: a message of the Help ({code, lib, py, ino, libNote}); `from` takes the message of a gallery example
function refExample(item) {
    const ex = item && item.ex;
    if (!ex) return null;
    if (ex.from) {
        const found = HELP_EXAMPLES.find((e) => e.code.startsWith(ex.from) || e.code.includes(ex.from));
        return found || null; // (with its calls in every client, already run by their tests)
    }
    if (ex.lib === null) return { code: ex.code, lib: null, libNote: ex.libNote || "No call in the clients: send the line as text." };
    return ex;
}

// ---------------------------------------------------------------------------------------------------------------- finding
const refThingById = Object.fromEntries(REF_THINGS.map((t) => [t.id, t]));
// The rows of a thing (options of its view included, then what every view has): row objects
function refRowsOf(thing, optionRows) {
    const rows = thing.rows.map((id) => REF_ROWS[id]);
    if (thing.view) rows.push(...(optionRows[thing.view] || []), ...REF_VIEW_COMMON.map((id) => REF_ROWS[id]));
    return rows;
}
// The things a row is on
function refThingsOf(rowId) {
    if (rowId.startsWith("opt.")) { const type = rowId.split(".")[1]; return REF_THINGS.filter((t) => t.view == type); }
    return REF_THINGS.filter((t) => t.rows.includes(rowId) || (t.view && REF_VIEW_COMMON.includes(rowId)));
}
// The options of every view, once (they need the library)
function refOptionRows(TP) {
    return Object.fromEntries(TP.view.VIEW_TYPES.map((type) => [type, refViewRows(TP, type)]));
}
// A search: the things and the rows whose words have every term (rows of options once per key)
function refSearch(query, senderId, optionRows) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return { things: [], rows: [] };
    const match = (text) => { text = text.toLowerCase(); return terms.every((term) => text.includes(term)); };
    const things = REF_THINGS.filter((t) => match([t.title, t.sub, t.id].join(" ")));
    const all = [...Object.values(REF_ROWS), ...Object.values(optionRows).flat()];
    const seen = new Set(), rows = [];
    for (const row of all) {
        const key = row.option ? row.text : row.id;
        if (seen.has(key)) continue;
        if (match([row.name, row.text || "", row.alt || "", refCall(row, senderId).text, row.what, row.values || ""].join(" "))) { seen.add(key); rows.push(row); }
    }
    // What is named so first, then what is written so, then what is said so
    const rank = (row) => match(row.name) ? 0 : (match([row.text || "", row.alt || "", refCall(row, senderId).text].join(" ")) ? 1 : 2);
    return { things, rows: rows.map((row, i) => [rank(row), i, row]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((r) => r[2]) };
}
// What applies to what: the properties of shapes (rows) by shape (columns)
function refMatrix() {
    const shapes = REF_THINGS.filter((t) => t.family == "shapes" && t.drawing && !["camera", "frames"].includes(t.id));
    const props = ["position", "rotation", "quaternion", "size", "radius", "points", "vector", "lineWidth", "text", "textSize", "color", "opacity", "texture", "url", "frame", "pixels"];
    return { shapes, rows: props.map((id) => ({ row: REF_ROWS[id], cells: shapes.map((s) => s.rows.includes(id)) })) };
}

// ---------------------------------------------------------------------------------------------------------------- drawings
// A drawing: its art (SVG, the colors of the theme) and its parts: [row id, x, y, anchor, [x, y] it points at (none: named in the
// corner, it is the whole thing)]. The names are the names of the rows: words, the same in every language.
const RA = "var(--hp-1)", RB = "var(--hp-3)", RC = "var(--hp-4)", RD = "var(--hp-2)", RE = "var(--hp-5)";
const REF_DRAWINGS = {
    rect: { art: `<g transform="translate(150 80) rotate(-20)"><rect x="-60" y="-30" width="120" height="60" fill="${RA}" fill-opacity=".35" stroke="${RA}" stroke-width="3"/></g><circle cx="150" cy="80" r="3" fill="var(--hp-text)"/><path d="M150 80 H215" stroke="var(--hp-muted)" stroke-dasharray="3 3"/><path d="M205 80 A55 55 0 0 0 202 62" fill="none" stroke="var(--hp-muted)"/>`,
        parts: [["position", 112, 126, "middle", [149, 83]], ["size", 250, 132, "middle", [200, 92]], ["rotation", 222, 64, "start", [207, 70]], ["lineWidth", 64, 40, "middle", [96, 66]], ["color"], ["opacity"], ["texture"], ["frame"]] },
    circle: { art: `<circle cx="150" cy="80" r="45" fill="${RC}" fill-opacity=".4" stroke="${RC}" stroke-width="3"/><circle cx="150" cy="80" r="3" fill="var(--hp-text)"/><path d="M150 80 L182 48" stroke="var(--hp-muted)" stroke-dasharray="3 3"/>`,
        parts: [["position", 108, 140, "middle", [148, 84]], ["radius", 222, 40, "start", [170, 58]], ["lineWidth", 242, 112, "start", [192, 96]], ["color"], ["opacity"], ["frame"]] },
    line: { art: `<polyline points="40,120 110,96 180,48 270,48" fill="none" stroke="${RD}" stroke-width="4" stroke-linejoin="round"/>${[[40, 120], [110, 96], [180, 48], [270, 48]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--hp-text)"/>`).join("")}`,
        parts: [["points", 210, 92, "middle", [181, 52]], ["position", 40, 142, "middle", [40, 124]], ["lineWidth", 270, 80, "middle", [250, 52]], ["color"], ["opacity"], ["rotation"], ["frame"]] },
    polygon: { art: `<polygon points="70,120 120,40 230,52 250,118" fill="${RE}" fill-opacity=".3" stroke="${RE}" stroke-width="3"/>${[[70, 120], [120, 40], [230, 52], [250, 118]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--hp-text)"/>`).join("")}`,
        parts: [["points", 40, 40, "middle", [116, 40]], ["position", 70, 142, "middle", [70, 124]], ["lineWidth", 280, 86, "middle", [242, 86]], ["color"], ["opacity"], ["rotation"], ["frame"]] },
    arrow: { art: `<path d="M60 116 L232 56 M232 56 L208 56 M232 56 L216 75" stroke="${RB}" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="60" cy="116" r="4" fill="var(--hp-text)"/><path d="M60 116 H120" stroke="var(--hp-muted)" stroke-dasharray="3 3"/><path d="M112 116 A52 52 0 0 0 109 99" fill="none" stroke="var(--hp-muted)"/><text x="312" y="150" font-size="9.5" text-anchor="end" fill="var(--hp-muted)">head: ¼ of the vector</text>`,
        parts: [["position", 40, 140, "middle", [57, 120]], ["rotation", 126, 108, "start", [113, 105]], ["vector", 150, 50, "middle", [150, 82]], ["lineWidth", 262, 30, "middle", [236, 50]], ["color"], ["opacity"], ["frame"]] },
    text: { art: `<g transform="translate(150 86) rotate(-12)"><text x="0" y="0" font-size="34" font-weight="700" text-anchor="middle" fill="${RA}">Goal A</text></g><circle cx="150" cy="86" r="3" fill="var(--hp-text)"/><path d="M262 64 V100" stroke="var(--hp-muted)"/>`,
        parts: [["text", 90, 40, "middle", [118, 72]], ["position", 150, 136, "middle", [150, 90]], ["textSize", 272, 120, "middle", [262, 100]], ["rotation", 236, 40, "middle", [210, 62]], ["color"], ["opacity"], ["frame"]] },
    cube: { art: `<path d="M110 60 L170 40 L230 60 L170 80 Z" fill="${RC}" fill-opacity=".55"/><path d="M110 60 L170 80 L170 130 L110 110 Z" fill="${RC}" fill-opacity=".8"/><path d="M170 80 L230 60 L230 110 L170 130 Z" fill="${RC}" fill-opacity=".4"/><circle cx="170" cy="85" r="3" fill="var(--hp-text)"/>`,
        parts: [["position", 110, 144, "middle", [168, 88]], ["size", 262, 90, "start", [232, 86]], ["rotation", 236, 30, "start", [214, 50]], ["color"], ["opacity"], ["texture"], ["quaternion"], ["frame"]] },
    sphere: { art: `<circle cx="160" cy="82" r="48" fill="${RE}" fill-opacity=".55"/><ellipse cx="160" cy="82" rx="48" ry="12" fill="none" stroke="var(--hp-muted)" stroke-dasharray="3 3"/><circle cx="160" cy="82" r="3" fill="var(--hp-text)"/><path d="M160 82 H208" stroke="var(--hp-text)"/>`,
        parts: [["position", 110, 144, "middle", [158, 86]], ["radius", 246, 70, "start", [200, 80]], ["color"], ["opacity"], ["texture"], ["frame"]] },
    cylinder: { art: `<path d="M120 50 V112 A40 12 0 0 0 200 112 V50" fill="var(--hp-muted)" fill-opacity=".35"/><ellipse cx="160" cy="50" rx="40" ry="12" fill="var(--hp-muted)" fill-opacity=".55"/><circle cx="160" cy="82" r="3" fill="var(--hp-text)"/><path d="M214 50 V112" stroke="var(--hp-muted)"/>`,
        parts: [["position", 110, 144, "middle", [158, 86]], ["radius", 248, 40, "start", [196, 48]], ["size", 248, 88, "start", [216, 82]], ["color"], ["opacity"], ["rotation"], ["frame"]] },
    stl: { art: `<path d="M150 40 C135 40 132 60 142 68 C128 74 132 96 140 100 L124 124 H176 L160 100 C168 96 172 74 158 68 C168 60 165 40 150 40 Z" fill="${RC}" fill-opacity=".7"/>`,
        parts: [["url", 230, 52, "start", [166, 56]], ["size", 230, 100, "start", [176, 116]], ["position", 100, 144, "middle", [146, 124]], ["color"], ["opacity"], ["rotation"], ["frame"]] },
    camera: { art: `<rect x="40" y="62" width="34" height="24" rx="4" fill="var(--hp-text)"/><path d="M74 74 L250 30 L250 118 Z" fill="${RA}" fill-opacity=".14" stroke="${RA}"/><rect x="200" y="42" width="50" height="64" fill="none" stroke="${RA}" stroke-dasharray="4 3"/><path d="M200 74 Q225 64 250 74" fill="none" stroke="var(--hp-muted)"/>`,
        parts: [["cameraPose", 56, 112, "middle", [56, 88]], ["intrinsics", 158, 30, "middle", [200, 52]], ["distortion", 268, 140, "end", [226, 70]], ["size", 140, 126, "middle", [150, 92]], ["frame"]] },
    frames: { art: `<g transform="translate(110 92) rotate(-25)"><rect x="-36" y="-22" width="72" height="44" fill="${RA}" fill-opacity=".3" stroke="${RA}" stroke-width="2"/><path d="M0 0 L60 0 M60 0 L50 -6 M60 0 L50 6" stroke="${RB}" stroke-width="3" fill="none"/></g><rect x="190" y="38" width="100" height="74" fill="var(--hp-grid)" stroke="var(--hp-line)"/><rect x="228" y="56" width="30" height="34" fill="none" stroke="${RE}" stroke-width="2"/>`,
        parts: [["frame", 100, 30, "middle", [138, 78]], ["pixels", 240, 132, "middle", [244, 92]], ["pointFrame"]] },
    chart: { art: `<rect x="40" y="40" width="260" height="90" fill="none" stroke="var(--hp-line)"/>${[56, 78, 100, 122].map((y) => `<line x1="40" x2="300" y1="${y}" y2="${y}" stroke="var(--hp-grid)"/>`).join("")}<line x1="40" x2="300" y1="58" y2="58" stroke="${RE}" stroke-dasharray="5 3"/><line x1="214" x2="214" y1="40" y2="130" stroke="${RB}"/><polyline points="${Array.from({ length: 52 }, (_, i) => (42 + i * 5) + "," + (100 - 26 * Math.sin(i / 6) - i * 0.3).toFixed(1)).join(" ")}" fill="none" stroke="${RA}" stroke-width="1.8"/><circle cx="46" cy="24" r="4" fill="${RA}"/><text x="54" y="28" font-size="10" fill="var(--hp-text)">motor.temp <tspan font-weight="700">27.4</tspan> <tspan fill="var(--hp-muted)">°C</tspan></text>`,
        parts: [["opt.chart.displayNumberDecimals", 210, 18, "start", [140, 24]], ["unit", 168, 40, "start", [150, 28]], ["threshold", 296, 52, "end", [270, 57]], ["state", 222, 146, "start", [215, 126]], ["opt.chart.scale", 18, 146, "start", [34, 124]], ["color.attr", 110, 146, "middle", [118, 106]]] },
    values: { art: `<text x="20" y="38" font-size="11" fill="var(--hp-muted)">battery</text><text x="290" y="44" font-size="26" font-weight="700" text-anchor="end" fill="var(--hp-text)">10.2<tspan font-size="11" fill="var(--hp-muted)"> V</tspan></text><rect x="196" y="12" width="40" height="15" rx="7" fill="${RE}" fill-opacity=".2"/><text x="216" y="23" font-size="9" text-anchor="middle" fill="${RE}">low</text><rect x="20" y="58" width="270" height="6" rx="3" fill="var(--hp-grid)"/><rect x="20" y="58" width="114" height="6" rx="3" fill="${RC}"/><line x1="146" x2="146" y1="54" y2="68" stroke="var(--hp-text)"/><text x="20" y="80" font-size="8" fill="var(--hp-muted)">9</text><text x="290" y="80" font-size="8" text-anchor="end" fill="var(--hp-muted)">12.6</text><text x="146" y="80" font-size="8" text-anchor="middle" fill="var(--hp-muted)">LOW</text>`,
        parts: [["unit", 300, 110, "end", [278, 44]], ["range", 60, 110, "middle", [24, 64]], ["threshold", 168, 110, "middle", [146, 72]], ["opt.values.displayScale", 240, 140, "middle", [270, 82]], ["desc", 52, 140, "middle", [40, 40]]] },
    log: { art: `${[["12:00:01", "Path clear", "var(--hp-text)"], ["12:00:03", "[WARN] motor current 1.9 A", "var(--hp-warn)"], ["12:00:04", "Turning left", "var(--hp-text)"], ["12:00:06", "Battery 24.8 V", "var(--hp-text)"]].map(([t, s, c], i) => `<text x="16" y="${34 + i * 22}" font-size="10" font-family="monospace" fill="var(--hp-muted)">${t}</text><text x="76" y="${34 + i * 22}" font-size="10" font-family="monospace" fill="${c}">${s}</text>`).join("")}`,
        parts: [["opt.log.displayTimestamp", 40, 140, "middle", [40, 104]], ["log", 200, 140, "middle", [150, 104]], ["opt.log.maxLines", 286, 22, "end", [250, 30]]] },
    timeline: { art: `<text x="10" y="44" font-size="10" fill="var(--hp-text)">mode</text><rect x="70" y="32" width="70" height="18" fill="${RA}" fill-opacity=".35"/><rect x="140" y="32" width="40" height="18" fill="${RE}" fill-opacity=".45"/><rect x="180" y="32" width="110" height="18" fill="${RA}" fill-opacity=".35"/><text x="10" y="80" font-size="10" fill="var(--hp-text)">task</text><rect x="70" y="68" width="220" height="12" fill="var(--hp-grid)"/><rect x="90" y="82" width="90" height="12" fill="${RD}" fill-opacity=".45"/><rect x="200" y="82" width="50" height="12" fill="${RE}" fill-opacity=".45"/><text x="10" y="116" font-size="10" fill="var(--hp-text)">motor</text><rect x="70" y="106" width="60" height="14" fill="${RC}" fill-opacity=".45"/>`,
        parts: [["state", 106, 22, "middle", [106, 34]], ["stack", 20, 140, "start", [40, 78]], ["stackStatus", 230, 140, "middle", [224, 94]], ["threshold", 150, 140, "middle", [110, 120]], ["opt.timeline.stackDepth", 300, 66, "end", [292, 76]]] },
    graph: { art: `<rect x="20" y="40" width="70" height="30" rx="6" fill="none" stroke="var(--hp-muted)"/><text x="55" y="60" font-size="11" text-anchor="middle" fill="var(--hp-text)">idle</text><rect x="130" y="24" width="160" height="90" rx="8" fill="none" stroke="var(--hp-line)"/><rect x="146" y="50" width="56" height="30" rx="6" fill="${RA}" fill-opacity=".2" stroke="${RA}" stroke-width="2"/><text x="174" y="70" font-size="11" text-anchor="middle" fill="var(--hp-text)">goto</text><rect x="222" y="50" width="56" height="30" rx="6" fill="none" stroke="var(--hp-muted)"/><text x="250" y="70" font-size="11" text-anchor="middle" fill="var(--hp-text)">grasp</text><path d="M90 55 H130" stroke="var(--hp-muted)" marker-end="url(#hp-arrow)"/><text x="110" y="50" font-size="8" text-anchor="middle" fill="var(--hp-muted)">start</text><path d="M202 65 H222" stroke="var(--hp-muted)"/><text x="146" y="44" font-size="8" fill="var(--hp-muted)">sequence</text><text x="202" y="92" font-size="8" text-anchor="end" fill="${RA}">running</text>`,
        parts: [["enum", 210, 140, "middle", [210, 112]], ["edges", 64, 104, "middle", [110, 58]], ["kind", 160, 16, "middle", [160, 40]], ["stackStatus", 270, 140, "middle", [196, 92]], ["stack", 100, 140, "middle", [160, 80]]] },
    map: { art: `${[60, 120, 180, 240].map((x) => `<line x1="${x}" x2="${x}" y1="20" y2="140" stroke="var(--hp-grid)"/>`).join("")}${[50, 90, 130].map((y) => `<line x1="20" x2="300" y1="${y}" y2="${y}" stroke="var(--hp-grid)"/>`).join("")}<polyline points="60,120 90,110 120,100 150,86 170,70" fill="none" stroke="${RA}" stroke-width="2" stroke-dasharray="1 3"/><circle cx="170" cy="70" r="5" fill="${RA}"/><g transform="translate(240 90) rotate(-30)"><rect x="-20" y="-12" width="40" height="24" fill="${RC}" fill-opacity=".45" stroke="${RC}"/></g>${[[200, 40], [214, 36], [228, 38], [242, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${RD}"/>`).join("")}`,
        parts: [["xy", 120, 30, "middle", [166, 68]], ["opt.2d.trailLength", 70, 146, "middle", [96, 110]], ["shape", 276, 136, "middle", [250, 100]], ["pc", 286, 22, "end", [242, 42]], ["opt.2d.displayGrid", 30, 16, "start", [60, 30]]] },
    scene: { art: `<path d="M20 120 L120 80 L300 80 L220 140 Z" fill="var(--hp-grid)" stroke="var(--hp-line)"/><path d="M150 96 L180 86 L210 96 L180 106 Z" fill="${RC}" fill-opacity=".6"/><path d="M150 96 L180 106 L180 126 L150 116 Z" fill="${RC}" fill-opacity=".85"/><path d="M180 106 L210 96 L210 116 L180 126 Z" fill="${RC}" fill-opacity=".45"/><circle cx="90" cy="60" r="5" fill="${RA}"/><polyline points="40,100 60,84 76,70 90,60" fill="none" stroke="${RA}" stroke-dasharray="1 3" stroke-width="2"/><path d="M250 40 L280 30 L280 60 Z" fill="none" stroke="${RB}"/>`,
        parts: [["xyz", 70, 30, "middle", [88, 56]], ["shape", 230, 146, "middle", [196, 116]], ["intrinsics", 290, 82, "end", [276, 50]], ["opt.3d.displayGrid", 40, 146, "middle", [70, 112]]] },
    image: { art: `<rect x="40" y="20" width="200" height="120" fill="${RA}" fill-opacity=".15" stroke="var(--hp-line)"/><path d="M40 110 L110 70 L170 96 L240 60 V140 H40 Z" fill="${RD}" fill-opacity=".35"/><rect x="150" y="40" width="44" height="40" fill="none" stroke="${RE}" stroke-width="2"/><path d="M60 128 Q140 112 220 128" fill="none" stroke="${RB}" stroke-width="2"/>`,
        parts: [["png", 60, 12, "start", [80, 24]], ["pixels", 280, 50, "start", [196, 56]], ["intrinsics", 280, 120, "start", [218, 126]], ["opt.image.overlayOpacity", 140, 152, "middle", [140, 120]]] },
    joystick: { art: `<circle cx="110" cy="80" r="56" fill="var(--hp-grid)" stroke="var(--hp-line)"/><circle cx="130" cy="58" r="16" fill="${RA}"/><rect x="200" y="70" width="100" height="20" rx="10" fill="var(--hp-grid)" stroke="var(--hp-line)"/><circle cx="270" cy="80" r="11" fill="${RA}"/><text x="110" y="152" font-size="9" text-anchor="middle" fill="var(--hp-muted)">x forward, y sideways</text><text x="250" y="110" font-size="9" text-anchor="middle" fill="var(--hp-muted)">yaw</text>`,
        parts: [["axes", 30, 20, "start", [86, 40]], ["rate", 200, 24, "start", [140, 52]], ["opt.joystick.orientation", 250, 140, "middle", [250, 92]], ["hold"], ["refuse"]] },
};
// A drawing: the art, then the name of each part (a row of the thing): pointed at with a line, or in the corner when it is the whole
// thing. `lit`: the row pointed at in the list (its part in the primary color). Names carry data-ref-row: a click opens the row.
function refDrawing(thing, lit, names) {
    const drawing = REF_DRAWINGS[thing.drawing];
    if (!drawing) return "";
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let out = "", corner = [];
    for (const [rowId, x, y, anchor, to] of drawing.parts) {
        const name = names[rowId];
        if (!name) continue;
        const on = rowId == lit;
        if (x === undefined) { corner.push([rowId, name]); continue; }
        if (to) out += `<path d="M${x} ${y + (y > to[1] ? -10 : 3)} L${to[0]} ${to[1]}" fill="none" stroke="${on ? "var(--color-primary)" : "var(--hp-muted)"}" stroke-width="${on ? 1.4 : 0.8}" ${on ? "" : 'stroke-dasharray="3 2"'}/>`;
        out += `<text class="ref-part${on ? " on" : ""}" data-ref-row="${rowId}" x="${x}" y="${y}" text-anchor="${anchor || "start"}">${esc(name)}</text>`;
    }
    let cx = 8;
    const cornerText = corner.map(([rowId, name]) => { const t = `<text class="ref-part${rowId == lit ? " on" : ""}" data-ref-row="${rowId}" x="${cx}" y="14">${esc(name)}</text>`; cx += name.length * 5.8 + 12; return t; }).join("");
    return `<svg viewBox="0 0 320 156" width="100%" role="img" aria-label="${esc(thing.title)}, its parts named"><defs><marker id="hp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--hp-muted)"/></marker></defs>${drawing.art}${out}${cornerText}</svg>`;
}

// ---------------------------------------------------------------------------------------------------------------- doc/reference.md
// The same entries as a page of the documentation: a section per family, a table per thing (every language in its columns)
function refMarkdown(TP) {
    const optionRows = refOptionRows(TP);
    const cell = (text) => String(text === null || text === undefined ? "" : text).replace(/\|/g, "\\|").replace(/\n/g, " ");
    const code = (text) => text ? "`" + String(text).replace(/`/g, "'").replace(/\|/g, "\\|") + "`" : "";
    const calls = (row, sender) => { const c = refCall(row, sender); return c.none ? "—" : code(c.text); };
    const out = ["# Reference", "",
        "What every value does, for every kind of telemetry, shape, view, dashboard and client call. Written from the entries of the Help",
        "panel's Reference tab ([`help-reference.js`](../packages/webapp/components/help-reference.js)) by `node packages/webapp/tools/reference-md.js`:",
        "do not edit it by hand (a test of the webapp fails when they differ). The text protocol is described in [`textProtocol.md`](textProtocol.md),",
        "the clients in [`cpp-client-api.md`](cpp-client-api.md) and [`python-client-api.md`](python-client-api.md).", "",
        "Calls: C++ and Arduino (when the Arduino library differs, both are given), Python. — : that language has none (the line can be sent as text).", ""];
    for (const family of REF_FAMILIES) {
        out.push("## " + family.title, "");
        for (const thing of REF_THINGS.filter((t) => t.family == family.id)) {
            out.push("### " + thing.title, "", thing.sub[0].toUpperCase() + thing.sub.slice(1) + ".", "");
            if (thing.matrix) {
                const m = refMatrix();
                out.push("| | " + m.shapes.map((s) => s.title).join(" | ") + " |", "|---|" + m.shapes.map(() => ":-:").join("|") + "|");
                for (const r of m.rows) out.push("| " + r.row.name + " | " + r.cells.map((c) => c ? "●" : "").join(" | ") + " |");
                out.push("");
                continue;
            }
            const ex = refExample(thing);
            if (ex && ex.code) out.push("```", ex.code, "```", "");
            if (thing.mouse) out.push(thing.mouse + ".", "");
            out.push("| Value | Text | C++ / Arduino | Python | Default | What it does |", "|---|---|---|---|---|---|");
            for (const row of refRowsOf(thing, optionRows)) {
                const cpp = calls(row, "cpp"), ino = calls(row, "ino");
                const both = cpp == ino ? cpp : cpp + "<br>Arduino: " + ino;
                const what = cell(row.what) + (row.values ? " Values: " + cell(row.values) + "." : "") + (row.note ? " " + cell(row.note) : "");
                out.push("| " + [cell(row.name), row.text ? code(row.text) : "—", both, calls(row, "py"), cell(row.def), what].join(" | ") + " |");
            }
            out.push("");
        }
    }
    out.push("---", "", "[All documentation](README.md) · [Teleplot](../README.md)", "");
    return out.join("\n");
}
