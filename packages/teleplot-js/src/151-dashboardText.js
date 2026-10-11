/*
 * Dashboards as text: one line per view, addressed by its path in the dashboard. The same lines are a file (export / import), a message
 * of the text protocol and the content of the binary section SECTION_TYPE_DASHBOARD. See doc/dashboard-text.md.
 *
 *     DASH|Robot:grid
 *     DASH|Robot/top:row
 *     DASH|Robot/top/Motion:chart:speed,accel|w=2
 *     DASH|Robot/top/side/Log:log:robot.log|maxLines=50
 *
 *     DASH|<dashboard>[/<view>...][:<type>[:<telemetry>,<telemetry>...]][|<option>=<value>...]
 *
 * - Path: the dashboard, then the views down to the one described. Layouts that are missing on the way are created (grids), so lines can
 *   come in any order, and a line can be sent again to change its view. The last name is the key of the view among its siblings and, for
 *   a view that shows telemetries, its title; a key that starts with "#" is only a key (no title).
 * - Type: "row", "column", "grid", "stack" (layouts), "chart", "values", "log", "3d", "image", or "none" (removes the view, or the
 *   dashboard). Without a type an existing view keeps its own, a new one gets what suits its first telemetry (a grid without telemetry).
 * - Telemetries: by name. They do not have to exist yet: the view waits for them.
 * - Options: the layout (w, h, align, gap, columnWidth...) and the options of the view (maxLines, displayGrid...), plus "title",
 *   "time" (time group: "inherit", "dashboard" or the name of a group) and "follow" (labels the view follows). Only what is written changes.
 * - Names and values write the characters % / : , | = and line breaks as %XX (the hexadecimal code of the character).
 *
 * A telemetry can also say where it goes with its view label: "speed,Robot/Motion:12.5" puts speed in the view "Motion" of the dashboard
 * "Robot", both created if needed (see placeTelemetry). Like any label it only decides the first placement.
 */
const _dashText_PREFIX = "DASH|";
const _dashText_LAYOUTS = ["row", "column", "grid"];
const _dashText_LEAF_TYPES = { "teleplot-chart": "chart", "teleplot-current-value": "values", "teleplot-log": "log", "teleplot-3d": "3d", "teleplot-image": "image" };
const _dashText_ALIASES = { w: "width", h: "height" };
const _dashText_LAYOUT_SKIPPED = ["type", "selected"];                                              // Not options of a line: the type has its own field
const _dashText_OPTIONS_SKIPPED = ["_telemetry", "title", "followLabels", "timeGroup", "timeGroupName"]; // Written another way ("title", "follow", "time"), or not at all

// What was received, by dashboard name: { lines: Map(path -> line), dashboardId }. A line is applied when it differs from the last one
// received for its path: what the user changed by hand stays until the sender changes its mind.
// (Dashboards are compared by id, and always taken from TELEPLOT.dashboards.dashboards: an application may wrap the library in
// proxies, and an object and its proxy are not equal.)
TELEPLOT.dashboards.received = TELEPLOT.Vue.markRaw({});
// Called with the dashboard when one is created by what was received (a DASH line or a label path): applications can display it
TELEPLOT.dashboards.onReceivedDashboardHooks = [];

TELEPLOT.dashboards.textEncode = function(text) {
    return String(text).replace(/[%\/:,|=\r\n]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}
TELEPLOT.dashboards.textDecode = function(text) {
    return String(text).replace(/%([0-9A-Fa-f]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function _dashText_isContainer(view) { return Array.isArray(view.views); }

// "row", "column", "grid", "stack", "chart", "values", "log", "3d" or "image"
function _dashText_typeOf(view) {
    if(_dashText_isContainer(view)) return view.type === "teleplot-stack" ? "stack" : view.layout.type;
    return _dashText_LEAF_TYPES[view.type];
}

// Key of a view among its siblings: the one it was given by a line, or its title. "" when it has none.
function _dashText_keyOf(view) {
    if(view.key) return view.key;
    let title = (!_dashText_isContainer(view) && view.options.title) ? String(view.options.title) : "";
    return title.startsWith("#") ? "" : title;
}

function _dashText_create(type, group) {
    let view;
    if(type === "stack") view = new TELEPLOT.view.ViewStack("", group);
    else if(_dashText_LAYOUTS.includes(type)) {
        view = new TELEPLOT.view.ViewLayout("", group);
        view.layout.type = type;
        view.layout.align = "stretch"; // Views of a line share its height, as in the dashboards made by hand
    }
    else view = TELEPLOT.view.createView(type, [], group);
    return view;
}

// Layout and options a view of a type has when nothing is said: only what differs is written
const _dashText_defaultsCache = {};
function _dashText_defaults(type) {
    if(_dashText_defaultsCache[type] === undefined) {
        let view = _dashText_create(type, "default");
        _dashText_defaultsCache[type] = { layout: JSON.parse(JSON.stringify(view.layout)), options: JSON.parse(JSON.stringify(view.options)) };
    }
    return _dashText_defaultsCache[type];
}

function _dashText_telemetryName(entry) {
    if(typeof entry === "string") return entry;
    let telem = TELEPLOT.datastore.getTelemetry(entry);
    if(telem !== undefined) return telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || "";
    let map = TELEPLOT.datastore.telemetriesNameMap; // A telemetry that was forgotten: its name still has its id
    for(let name in map) if(map[name] === entry) return name;
    return "";
}

/*
 * Export
 */

// The lines of a dashboard (of all of them without a name), one per view, parents first. "" for an unknown or empty dashboard.
TELEPLOT.dashboards.exportText = function(name) {
    let dashboards = name === undefined ? Object.values(TELEPLOT.dashboards.dashboards) : [TELEPLOT.dashboards.getDashboard(name)];
    let encode = TELEPLOT.dashboards.textEncode;
    let lines = [];
    let visit = (view, path, key) => {
        let type = _dashText_typeOf(view);
        if(type === undefined) return;
        let defaults = _dashText_defaults(type);
        let line = _dashText_PREFIX + path + ":" + type;
        let options = [];
        if(!_dashText_isContainer(view)) {
            let names = Array.from(view.telemetryIdOrNameList || []).map(_dashText_telemetryName).filter((n) => n !== "");
            if(names.length) line += ":" + names.map(encode).join(",");
            let title = view.options.title ? String(view.options.title) : "";
            if(key !== undefined && title !== (key.startsWith("#") ? "" : key)) options.push("title=" + encode(title));
            else if(key === undefined && title !== "") options.push("title=" + encode(title));
        }
        for(let k in view.layout) {
            if(_dashText_LAYOUT_SKIPPED.includes(k) || view.layout[k] === defaults.layout[k]) continue;
            options.push((k === "width" ? "w" : (k === "height" ? "h" : k)) + "=" + encode(view.layout[k]));
        }
        for(let k in view.options) {
            let value = view.options[k];
            if(_dashText_OPTIONS_SKIPPED.includes(k) || value === defaults.options[k] || (typeof value === "object" && value !== null)) continue;
            options.push(k + "=" + encode(value));
        }
        let follow = Array.isArray(view.options.followLabels) ? Array.from(view.options.followLabels) : [];
        if(follow.length) options.push("follow=" + follow.map(encode).join(","));
        let mode = view.options.timeGroup, group = String(view.options.timeGroupName || "");
        if(mode === "dashboard") options.push("time=dashboard");
        else if(mode === "custom" && group !== "") {
            if(group === "dashboard" || group === "inherit") options.push("timeGroup=custom", "timeGroupName=" + group);
            else options.push("time=" + encode(group));
        }
        lines.push(line + options.map((o) => "|" + o).join(""));

        if(!_dashText_isContainer(view)) return;
        // Keys of the children: their own when it is free, "#1", "#2"... otherwise
        let keys = new Map(), used = new Set();
        for(let child of view.views) { let k = child.key || ""; if(k !== "" && !used.has(k)) { keys.set(child.id, k); used.add(k); } }
        for(let child of view.views) {
            if(keys.has(child.id)) continue;
            let k = _dashText_keyOf(child);
            if(k === "" || used.has(k)) { for(let n = 1; ; n++) { k = "#" + n; if(!used.has(k)) break; } }
            keys.set(child.id, k); used.add(k);
        }
        for(let child of view.views) visit(child, path + "/" + encode(keys.get(child.id)), keys.get(child.id));
    };
    for(let dashboard of dashboards) {
        if(dashboard === undefined || !dashboard.view) continue;
        visit(dashboard.view, encode(dashboard.name), undefined);
    }
    return lines.join("\n");
}

/*
 * Reading lines
 */

// {name, segments, type, telemetries (undefined: not said), options: [[key, value]]}, or undefined for a line that is not a dashboard line
TELEPLOT.dashboards.parseLine = function(line) {
    line = String(line).replace(/[\r\n]+$/, "");
    if(!line.startsWith(_dashText_PREFIX)) return undefined;
    let decode = TELEPLOT.dashboards.textDecode;
    let parts = line.slice(_dashText_PREFIX.length).split("|");
    let fields = parts[0].split(":");
    let segments = fields[0].split("/").filter((s) => s !== "").map(decode);
    if(!segments.length) return undefined;
    let options = [];
    for(let part of parts.slice(1)) {
        if(part === "") continue;
        let at = part.indexOf("=");
        if(at <= 0) return undefined;
        options.push([part.slice(0, at).trim(), part.slice(at + 1)]);
    }
    return {
        name: segments[0],
        segments: segments.slice(1),
        type: (fields[1] || "").trim().toLowerCase(),
        telemetries: fields.length > 2 ? fields.slice(2).join(":").split(",").filter((n) => n !== "").map(decode) : undefined,
        options: options
    };
}

// Dashboard and view path a view label points at ("Robot/top/Motion"), undefined for a label that is only a label (no "/")
TELEPLOT.dashboards.getLabelPath = function(label) {
    if(typeof label !== "string" || !label.includes("/")) return undefined;
    let segments = label.split("/").map((s) => TELEPLOT.dashboards.textDecode(s));
    let name = segments.shift();
    segments = segments.filter((s) => s !== "");
    if(name === "") return undefined;
    return { name: name, segments: segments };
}

function _dashText_findChild(container, key) {
    return container.views.find((child) => _dashText_keyOf(child) === key);
}

// Puts a view where another one was (same parent, same place), or as the view of the dashboard
function _dashText_replace(dashboard, parent, old, view) {
    view.key = old.key;
    view.layout.width = old.layout.width;
    if(_dashText_isContainer(old) && _dashText_isContainer(view)) {
        let children = Array.from(old.views);
        old.views.splice(0, old.views.length); // (they are not forgotten with the old view)
        for(let child of children) { TELEPLOT.view.disposeView(child, true); view.addView(child); }
    }
    else if(!_dashText_isContainer(old) && !_dashText_isContainer(view)) {
        for(let entry of old.telemetryIdOrNameList) view.telemetryIdOrNameList.push(entry);
        view.options.title = old.options.title;
    }
    if(parent === undefined) {
        TELEPLOT.view.removeView(old);
        dashboard.setView(view);
    }
    else {
        let index = parent.views.findIndex((child) => child.id === old.id);
        parent.removeView(old.id);
        TELEPLOT.view.removeView(old);
        parent.addView(view, index);
    }
    return view;
}

// The dashboard a received name stands for: the one it created (even renamed since), or the one that has this name
function _dashText_dashboardFor(name) {
    let record = TELEPLOT.dashboards.received[name];
    let own = record && record.dashboardId ? Object.values(TELEPLOT.dashboards.dashboards).find((d) => d.id === record.dashboardId) : undefined;
    return own !== undefined ? own : TELEPLOT.dashboards.getDashboard(name);
}

function _dashText_isListed(dashboard) {
    let listed = TELEPLOT.dashboards.getDashboard(dashboard.name);
    return listed !== undefined && listed.id === dashboard.id;
}

function _dashText_addDashboard(name) {
    return TELEPLOT.dashboards.getDashboard(TELEPLOT.dashboards.addDashboard(name).name);
}

// The layout at a path of a dashboard, created with everything missing on the way (grids). A view that shows telemetries and stands
// on the way gives its place to a layout.
function _dashText_container(dashboard, segments) {
    let group = dashboard.getGroupName();
    if(!dashboard.view) dashboard.setView(_dashText_create("grid", group));
    else if(!_dashText_isContainer(dashboard.view)) _dashText_replace(dashboard, undefined, dashboard.view, _dashText_create("grid", group));
    let container = dashboard.view;
    for(let key of segments) {
        let child = _dashText_findChild(container, key);
        if(child === undefined) {
            child = _dashText_create("grid", group);
            child.key = key;
            container.addView(child);
        }
        else if(!_dashText_isContainer(child)) child = _dashText_replace(dashboard, container, child, _dashText_create("grid", group));
        container = child;
    }
    return container;
}

function _dashText_setValue(target, key, text) {
    let current = target[key];
    if(typeof current === "boolean") {
        if(!["true", "false", "1", "0"].includes(text)) return false;
        target[key] = text === "true" || text === "1";
    }
    else if(typeof current === "number") {
        let value = Number(text);
        if(text.trim() === "" || !isFinite(value)) return false;
        target[key] = value;
    }
    else if(typeof current === "string" || current === undefined) target[key] = TELEPLOT.dashboards.textDecode(text);
    else return false;
    return true;
}

// Telemetries of a view from a line: the list of the line, and what a label path put in the view (the line does not know about them)
function _dashText_setTelemetries(view, names, path) {
    let entries = [];
    let add = (entry) => {
        let telem = TELEPLOT.datastore.getTelemetry(entry);
        let value = telem !== undefined ? telem.id : entry;
        if(!entries.includes(value)) entries.push(value);
    };
    names.forEach(add);
    for(let entry of view.telemetryIdOrNameList) {
        let telem = TELEPLOT.datastore.getTelemetry(entry);
        let label = telem !== undefined ? TELEPLOT.dashboards.getLabelPath(telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL)) : undefined;
        if(label !== undefined && [label.name, ...label.segments].join("/") === path) add(entry);
    }
    let list = view.telemetryIdOrNameList;
    if(list.length !== entries.length || entries.some((entry, i) => list[i] !== entry)) list.splice(0, list.length, ...entries);
}

// Applies a parsed line to a dashboard. Returns the number of things that could not be understood (0: all good).
function _dashText_apply(dashboard, parsed) {
    let group = dashboard.getGroupName();
    let type = parsed.type;
    let known = type === "" || type === "none" || type === "stack" || _dashText_LAYOUTS.includes(type) || Object.values(_dashText_LEAF_TYPES).includes(type);
    if(!known) return 1;

    let isRoot = parsed.segments.length === 0;
    let key = isRoot ? undefined : parsed.segments[parsed.segments.length - 1];
    let parent, view;
    if(isRoot) view = dashboard.view;
    else if(type === "none") {
        // (nothing is created to remove something)
        parent = dashboard.view;
        for(let k of parsed.segments.slice(0, -1)) parent = parent && _dashText_isContainer(parent) ? _dashText_findChild(parent, k) : undefined;
        view = parent && _dashText_isContainer(parent) ? _dashText_findChild(parent, key) : undefined;
    }
    else {
        parent = _dashText_container(dashboard, parsed.segments.slice(0, -1));
        view = _dashText_findChild(parent, key);
    }

    if(type === "none") {
        if(isRoot) TELEPLOT.dashboards.removeDashboard(dashboard.name);
        else if(view) { parent.removeView(view.id); TELEPLOT.view.removeView(view); }
        return 0;
    }
    if(type === "") {
        if(view) type = _dashText_typeOf(view);
        else if(parsed.telemetries && parsed.telemetries.length) type = TELEPLOT.view.suggestViewType(parsed.telemetries[0]);
        else type = "grid";
    }

    if(view === undefined) {
        view = _dashText_create(type, group);
        if(isRoot) dashboard.setView(view);
        else {
            view.key = key;
            if(!_dashText_isContainer(view) && !key.startsWith("#")) view.options.title = key;
            parent.addView(view);
        }
    }
    else if(_dashText_typeOf(view) !== type) {
        if(_dashText_LAYOUTS.includes(type) && _dashText_LAYOUTS.includes(_dashText_typeOf(view))) view.layout.type = type;
        else view = _dashText_replace(dashboard, parent, view, _dashText_create(type, group));
    }
    if(!isRoot && !view.key) view.key = key; // (a view found by its title: it keeps this key if the title changes)

    let problems = 0;
    let leaf = !_dashText_isContainer(view);
    if(parsed.telemetries !== undefined) {
        if(leaf) _dashText_setTelemetries(view, parsed.telemetries, [parsed.name, ...parsed.segments].join("/"));
        else if(parsed.telemetries.length) problems++;
    }
    for(let [name, text] of parsed.options) {
        let k = _dashText_ALIASES[name] || name;
        let ok = true;
        if(k === "title") { if(leaf) view.options.title = TELEPLOT.dashboards.textDecode(text); else ok = false; }
        else if(k === "follow") {
            if(leaf && typeof view.followLabel === "function") {
                view.options.followLabels.splice(0, view.options.followLabels.length);
                text.split(",").filter((l) => l !== "").forEach((l) => view.followLabel(TELEPLOT.dashboards.textDecode(l)));
            }
            else ok = false;
        }
        else if(k === "time") {
            let value = TELEPLOT.dashboards.textDecode(text).trim();
            if(value === "" || value === "inherit") { view.options.timeGroup = "inherit"; view.options.timeGroupName = ""; }
            else if(value === "dashboard") { view.options.timeGroup = "dashboard"; view.options.timeGroupName = ""; }
            else { view.options.timeGroup = "custom"; view.options.timeGroupName = value; }
        }
        else if(k in view.layout && !_dashText_LAYOUT_SKIPPED.includes(k)) ok = _dashText_setValue(view.layout, k, text);
        else if(k in view.options && k !== "_telemetry" && k !== "followLabels") ok = _dashText_setValue(view.options, k, text);
        else ok = false;
        if(!ok) problems++;
    }
    return problems;
}

function _dashText_created(dashboard) {
    for(let hook of TELEPLOT.dashboards.onReceivedDashboardHooks) {
        try { hook(dashboard); }
        catch(e) { console.error("Teleplot received dashboard hook failed:", e); }
    }
}

// A dashboard line that was received (text protocol, binary section): applied when it differs from the last one received for the same
// path. Returns false for a line that could not be understood, at least in part.
TELEPLOT.dashboards.receiveLine = function(line) {
    let parsed = TELEPLOT.dashboards.parseLine(line);
    if(parsed === undefined) return false;
    line = String(line).trim();
    let record = TELEPLOT.dashboards.received[parsed.name];
    if(record === undefined) record = TELEPLOT.dashboards.received[parsed.name] = { lines: new Map(), dashboardId: undefined };
    let path = parsed.segments.map(TELEPLOT.dashboards.textEncode).join("/");
    if(record.lines.get(path) === line) return true; // Already applied: what was changed by hand since stays

    let dashboard = _dashText_dashboardFor(parsed.name);
    let problems = 0, created = false;
    if(dashboard === undefined && !(parsed.type === "none" && parsed.segments.length === 0)) {
        dashboard = _dashText_addDashboard(parsed.name);
        created = true;
        // A dashboard that was deleted comes back whole when its sender changes something: everything it said so far is applied again
        for(let previous of record.lines.values()) {
            let again = TELEPLOT.dashboards.parseLine(previous);
            if(again !== undefined && again.type !== "none") _dashText_apply(dashboard, again);
        }
    }
    record.dashboardId = dashboard !== undefined ? dashboard.id : undefined;
    if(parsed.type === "none" && parsed.segments.length === 0) record.lines.clear(); // What was said before is not said again
    record.lines.set(path, line);
    if(dashboard !== undefined) problems = _dashText_apply(dashboard, parsed);
    if(created && _dashText_isListed(dashboard)) {
        if(!dashboard.view) dashboard.setView(_dashText_create("grid", dashboard.getGroupName()));
        _dashText_created(dashboard);
    }
    return problems === 0;
}

// Several lines (a message, the content of a binary section). Returns the number of dashboard lines that were not understood.
TELEPLOT.dashboards.receiveText = function(text) {
    let problems = 0;
    for(let line of String(text).split("\n")) {
        if(line.trim() === "") continue;
        if(!TELEPLOT.dashboards.receiveLine(line)) problems++;
    }
    return problems;
}

// Dashboards from a text someone chose to load (a file...): every line is applied. A dashboard of the text whose name is taken is
// created under a free name ("Robot 2"): nothing that exists is changed. Empty lines and lines that start with "#" are skipped.
// Returns { dashboards: names of the dashboards created, problems: number of lines not understood (at least in part) }.
TELEPLOT.dashboards.importText = function(text) {
    let created = {}, problems = 0;
    for(let line of String(text).split("\n")) {
        line = line.trim();
        if(line === "" || line.startsWith("#")) continue;
        let parsed = TELEPLOT.dashboards.parseLine(line);
        if(parsed === undefined) { problems++; continue; }
        if(created[parsed.name] === undefined) created[parsed.name] = _dashText_addDashboard(parsed.name);
        let dashboard = created[parsed.name];
        if(!_dashText_isListed(dashboard)) continue; // (removed by a "none" line of the text)
        if(_dashText_apply(dashboard, parsed) > 0) problems++;
    }
    let names = [];
    for(let dashboard of Object.values(created)) {
        if(!_dashText_isListed(dashboard)) continue;
        if(!dashboard.view) dashboard.setView(_dashText_create("grid", dashboard.getGroupName()));
        names.push(dashboard.name);
    }
    TELEPLOT.dashboards.resolveTimeGroups();
    return { dashboards: names, problems: problems };
}

/*
 * A view label that is a path ("speed,Robot/Motion:12.5" in text, TELEM_ATTR_VIEW_LABEL in binary) places its telemetry: in the
 * dashboard "Robot", in the view "Motion", both created if needed. As with labels in the automatic dashboard, telemetries of a path
 * that are displayed the same way share one view, titled with the last name of the path; the others get a view of their own kind
 * next to it (key "Motion#values"), and a view also takes what else it can show of its path (the camera of a 3D scene, the shapes to
 * draw over a picture). A path that ends with "/" ("speed,Robot/") only names the dashboard: the telemetry gets its own view.
 * Returns the view the telemetry was put in, undefined when its label is not a path (or when it is not to be displayed: autoplot off).
 */
TELEPLOT.dashboards.placeTelemetry = function(telem) {
    const P = TELEPLOT.protocol;
    let label = telem.getAttribute(P.TELEM_ATTR_VIEW_LABEL);
    let path = TELEPLOT.dashboards.getLabelPath(label);
    if(path === undefined || telem.getAttribute(P.TELEM_ATTR_AUTOPLOT) === false) return undefined;
    if(Object.keys(telem.data)[0] === undefined && telem.getAttribute(P.TELEM_ATTR_SHAPE) === undefined) return undefined; // No data (yet): nothing to display

    let dashboard = _dashText_dashboardFor(path.name);
    let created = dashboard === undefined;
    if(created) {
        dashboard = _dashText_addDashboard(path.name);
        if(TELEPLOT.dashboards.received[path.name] === undefined) TELEPLOT.dashboards.received[path.name] = { lines: new Map(), dashboardId: undefined };
        TELEPLOT.dashboards.received[path.name].dashboardId = dashboard.id;
    }
    let container = _dashText_container(dashboard, path.segments.slice(0, -1));
    let key = path.segments.length ? path.segments[path.segments.length - 1] : "";
    let type = TELEPLOT.view.suggestViewType(telem.id);
    let siblings = key === "" ? [] : container.views.filter((v) => !_dashText_isContainer(v) && (_dashText_keyOf(v) === key || _dashText_keyOf(v).startsWith(key + "#")));
    let view = siblings.find((v) => _dashText_typeOf(v) === type);
    if(view !== undefined) view.addTelemetry(telem.id);
    else {
        view = TELEPLOT.view.createView(type, [telem.id], dashboard.getGroupName());
        if(key !== "") {
            view.key = siblings.some((v) => _dashText_keyOf(v) === key) ? key + "#" + type : key;
            view.options.title = key;
            // What already has this path and belongs in this view too
            for(let id in TELEPLOT.datastore.telemetries) {
                let other = TELEPLOT.datastore.telemetries[id];
                if(other.id === telem.id || other.getAttribute(P.TELEM_ATTR_VIEW_LABEL) !== label) continue;
                if(TELEPLOT.view.suggestViewType(other.id) !== type && view.suitsTelemetry(other)) view.addTelemetry(other.id);
            }
        }
        container.addView(view);
    }
    for(let other of siblings) {
        if(other.id !== view.id && typeof other.suitsTelemetry === "function" && other.suitsTelemetry(telem)) other.addTelemetry(telem.id);
    }
    if(created) _dashText_created(dashboard);
    return view;
}

TELEPLOT.datastore.onNewTelemetryHooks.push((telem) => { TELEPLOT.dashboards.placeTelemetry(telem); });
