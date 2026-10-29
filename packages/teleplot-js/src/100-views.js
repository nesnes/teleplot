class Views{
    constructor(divId="", group="default"){
        if (this.constructor === Views)
        {
            throw new Error("Views is an abstract class, it should only be inherited but never instanciated !");
        }
        this.name = "view";
        this.id = "view-"+crypto.randomUUID();
        this.divId = divId.length ? divId : this.id;
        this.group = group;
        this.type = "";
        TELEPLOT.view.ensureGroup(this.group);

        this.layout = TELEPLOT.Vue.reactive({
            width: 4,
            height: 4
        });

        // View options
        this.options = TELEPLOT.Vue.reactive({
            _telemetry:{},                  // Telemetry-specific options
            displayNumberDecimals: 3,       // Number of decimal for values when displayed
            // Time group: the views of a group share their zoom and their cursor. "inherit" (the group of the layout the view is in),
            // "dashboard" (the main group, whatever the layouts say) or "custom" (the group named timeGroupName). Applied to a tree of
            // views by TELEPLOT.view.resolveTimeGroups (dashboards do it by themselves), which sets "group".
            timeGroup: "inherit",
            timeGroupName: "",
        });
        this.timeGroupMark = TELEPLOT.Vue.markRaw({ label: "", color: "", parent: "" }); // Where a time group starts: what to show (set by resolveTimeGroups)
    }
    
    init(){
        let element = document.getElementById(this.divId);
        if (element == null)
        {
            throw new Error(`Element with id '${this.divId}' not found`);
            return;
        }
        element.setAttribute("v-pre", ""); // Prevent an eventual higher-level Vue-js from parsing this element
                                           // Also used for initialization check
        element.classList.add("teleplot-js-style");
        element.classList.add("teleplot-js-view");
        
        this.vue = TELEPLOT.Vue.createApp({
            data() {
                return {}
            }
        });
    }

    __before_update(){
        // Check init
        let element = document.getElementById(this.divId);
        let isInitialized = () => {return element && element.hasAttribute("v-pre")};
        
        if(element && !isInitialized()) {
            this.dispose(); // The view moved to a new element (parent changed, stack tab switched): drop what was mounted on the old one
            this.init();
            return isInitialized();
        }
        if(element) this.__sync(element);
        
        return true;
    }

    // Unmounts the view from the page. It mounts again by itself (next update) when an element with its divId shows up.
    dispose() {
        if(this.vue) {
            try { this.vue.unmount(); } catch(e) { console.error("Teleplot view unmount failed:", this.id, e); }
            this.vue = undefined;
        }
    }

    // Brings what the view shows on its element up to date (called by every update): the "title" option, and for views that show telemetries
    // their top color and empty state. The elements are added next to what the view's own Vue app renders.
    __sync(element) {
        let title = (!Array.isArray(this.views) && this.options.title) ? String(this.options.title) : "";
        let label = Array.from(element.children).find((c) => c.classList.contains("teleplot-js-view-title"));
        if(!title) { if(label) label.remove(); }
        else {
            if(!label) {
                label = document.createElement("div");
                label.className = "teleplot-js-view-title";
                element.appendChild(label);
            }
            if(label.textContent !== title) label.textContent = title;
        }
        element.classList.toggle("teleplot-js-has-title", title !== "");
        this.__syncTimeGroup(element);
    }

    // Where a time group starts (a view or a layout that does not follow its parent), a tag says so: its name and color, the period
    // it is zoomed on, and a button to go back to the latest data. A layout also gets a frame. Shown while the group (or the one
    // around it) is zoomed, or all the time with TELEPLOT.view.showTimeGroups (an editor...). While the pointer is over a chart or
    // a log of the same dashboard, the tag alone is shown (no frame: nothing must move under the pointer), after a short delay: it
    // tells which views follow that cursor and which do not.
    // Returns "" (nothing), "tag" or "frame" (tag, and frame on a layout).
    getTimeGroupMarkState() {
        let mark = this.timeGroupMark;
        if(mark.label === "") return "";
        let group = TELEPLOT.view.groups[this.group];
        let around = mark.parent ? TELEPLOT.view.groups[mark.parent] : undefined;
        if(TELEPLOT.view.showTimeGroups || (group && group.cursorActive) || (around && around.cursorActive)) return "frame";
        let hovered = TELEPLOT.view.hoveredGroup;
        let base = (name) => String(name).split(TELEPLOT.view.TIME_GROUP_SEPARATOR)[0];
        return (hovered !== "" && base(hovered) === base(this.group)) ? "tag" : "";
    }

    __syncTimeGroup(element) {
        let mark = this.timeGroupMark;
        let group = TELEPLOT.view.groups[this.group];
        let zoomed = !!(group && group.cursorActive);
        let state = this.getTimeGroupMarkState();
        let shown = state !== "";
        let tag = Array.from(element.children).find((c) => c.classList.contains("teleplot-js-time-group"));
        if(!shown) {
            if(tag) { tag.remove(); element.classList.remove("teleplot-js-time-group-frame"); element.style.removeProperty("--teleplot-time-group"); }
            return;
        }
        if(!tag) {
            tag = document.createElement("div");
            tag.className = "teleplot-js-time-group";
            tag.innerHTML = '<i></i><b></b><span></span><button type="button" title="Back to the latest data" aria-label="Back to the latest data">\u21BA</button>';
            tag.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); TELEPLOT.view.backToLive(this.group); });
            element.appendChild(tag);
        }
        let period = zoomed && group.timestampFrom < group.timestampTo ? Views.formatClock(group.timestampFrom) + " \u2013 " + Views.formatClock(group.timestampTo) : "";
        let name = tag.children[1], when = tag.children[2], reset = tag.children[3];
        if(name.textContent !== mark.label) name.textContent = mark.label;
        if(when.textContent !== period) when.textContent = period;
        if(reset.hidden !== !zoomed) reset.hidden = !zoomed;
        if(element.style.getPropertyValue("--teleplot-time-group") !== mark.color) element.style.setProperty("--teleplot-time-group", mark.color);
        tag.classList.toggle("teleplot-js-time-group-hover", state === "tag");
        element.classList.toggle("teleplot-js-time-group-frame", state === "frame" && Array.isArray(this.views));
    }

    // "18:57:02" for a timestamp in seconds
    static formatClock(timestamp) {
        let date = new Date(timestamp * 1000);
        return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
    }

    // Copy of the view with the same content, layout and options (not displayed until it is added to a layout). Overridden by each kind of view.
    clone() {
        throw new Error(`${this.constructor.name} cannot be cloned`);
    }

    __copyStateTo(copy) {
        copy.name = this.name;
        Object.assign(copy.layout, JSON.parse(JSON.stringify(this.layout)));
        Object.assign(copy.options, JSON.parse(JSON.stringify(this.options)));
        return copy;
    }

    setOption(name, value) {
        this.options[name] = value;
    }

    getOption(name) {
        return this.options[name];
    }

    setSize(width, height) { // No units, relative to other views in a layout, used as flex-grow attributes
        if(width !== undefined) this.layout.width = width;   // undefined: keep the current value
        if(height !== undefined) this.layout.height = height;
    }
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-view {
                position: relative;
            }
            /* Time group that starts on this view: a tag in its top right corner (inside: a view at the top of the page has no room above it); a layout gets a frame with the tag inside, at the top */
            .teleplot-js-time-group {
                position: absolute; top: 0.35em; right: 0.5em; z-index: 4;
                display: inline-flex; align-items: center; gap: 0.35em; max-width: calc(100% - 1em);
                padding: 0.05em 0.5em; border-radius: 0.8em; font-size: 0.85em; line-height: 1.5; white-space: nowrap;
                color: var(--teleplot-text, inherit); background: var(--teleplot-surface, Canvas);
                box-shadow: inset 0 0 0 1px var(--teleplot-time-group);
            }
            .teleplot-js-time-group-hover { animation: teleplot-js-time-group-in 0.15s 0.3s both; } /* Not for a pointer that only passes by */
            @keyframes teleplot-js-time-group-in { from { opacity: 0; } to { opacity: 1; } }
            .teleplot-js-time-group i { flex: none; width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--teleplot-time-group); }
            .teleplot-js-time-group b { font-weight: 700; }
            .teleplot-js-time-group span { color: var(--teleplot-muted, gray); overflow: hidden; text-overflow: ellipsis; }
            .teleplot-js-time-group span:empty { display: none; }
            .teleplot-js-time-group button { all: unset; cursor: pointer; padding: 0 0.15em; color: var(--teleplot-muted, gray); }
            .teleplot-js-time-group button:hover { color: var(--teleplot-time-group); }
            .teleplot-js-time-group button[hidden] { display: none; }
            .teleplot-js-time-group-frame {
                box-sizing: border-box; padding: 2em 0.5em 0.5em; border-radius: 0.8em;
                background: color-mix(in srgb, var(--teleplot-time-group) 7%, transparent);
                box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--teleplot-time-group) 50%, transparent);
            }
            .teleplot-js-time-group-frame > .teleplot-js-time-group { top: 0.25em; right: 0.6em; background: none; box-shadow: none; }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = Views.vueCSS;
    document.head.appendChild(elem);
}


TELEPLOT.view = {
    views: [],
    groups: {},
    showTimeGroups: false, // true: time groups are marked on the views all the time (an editor), not only while they are zoomed
    hoveredGroup: ""       // Group of the chart or log the pointer is over ("" when it is over none)
};

// State of a group of views (created if needed), see doc/time.md "Time shown":
//   mode       "live" | "held" | "replay"
//   at         the time shown when not live (seconds, never negative); speed: of a replay; span: the zoom (seconds, 0: the whole window)
//   cursorActive, timestampFrom, timestampTo: the window in force (the period on the axis of charts and timelines). Always set while
//              held or replaying (frozen, or placed around "at"), and while live with a span (the last "span" seconds, moved on each update)
//   cursorTimestamp: the moment the views show (-1: the latest). "at" while not live, or the moment the pointer is on (a preview)
TELEPLOT.view.ensureGroup = function(name){
    if(TELEPLOT.view.groups[name] === undefined) {
        TELEPLOT.view.groups[name] = { cursorActive: false, cursorTimestamp: -1, timestampFrom: -1, timestampTo: -1, mode: "live", at: -1, speed: 1, span: 0 };
    }
    return TELEPLOT.view.groups[name];
}

/*
 * Time groups. Every view and layout has a "timeGroup" option: "inherit" (default), "dashboard" or "custom" (+ "timeGroupName").
 * resolveTimeGroups(root, base) walks a tree of views and gives each one its group: "base" for the root and for "dashboard", the
 * group of its parent for "inherit", and base + separator + name for "custom" (so that two trees can use the same names).
 * Returns the custom groups found: [{name, key, color, views}] ("views": views that display something, layouts excluded).
 */
TELEPLOT.view.TIME_GROUP_SEPARATOR = " \u203A ";
TELEPLOT.view.TIME_GROUP_COLORS = ["hsl(268, 60%, 60%)", "hsl(22, 90%, 52%)", "hsl(168, 70%, 38%)", "hsl(330, 70%, 56%)", "hsl(48, 90%, 44%)", "hsl(200, 80%, 50%)"];
TELEPLOT.view.__managedGroups = new Set(); // Groups that resolveTimeGroups gave or took: dropped once no view uses them

// Color of a custom time group, from its name: "Time 2", "Time 3"... take the colors in order, other names a color of their own
TELEPLOT.view.timeGroupColor = function(name){
    let colors = TELEPLOT.view.TIME_GROUP_COLORS;
    let number = /(\d+)\s*$/.exec(name);
    let index = number ? Math.max(0, Number(number[1]) - 2) : Array.from(String(name)).reduce((sum, c) => sum + c.charCodeAt(0), 0);
    return colors[index % colors.length];
}

TELEPLOT.view.resolveTimeGroups = function(root, base){
    let found = new Map();
    let managed = TELEPLOT.view.__managedGroups;
    let visit = (view, parentGroup) => {
        let mode = view.options.timeGroup || "inherit";
        let name = String(view.options.timeGroupName || "").trim();
        let group = parentGroup, label = "", color = "";
        if(mode === "dashboard") { group = base; label = "Dashboard"; color = "var(--teleplot-accent-default, hsl(204, 64%, 44%))"; }
        else if(mode === "custom" && name !== "") {
            group = base + TELEPLOT.view.TIME_GROUP_SEPARATOR + name;
            label = name; color = TELEPLOT.view.timeGroupColor(name);
            if(!found.has(name)) found.set(name, { name, key: group, color, views: 0 });
        }
        if(group === parentGroup) label = ""; // Nothing starts here
        if(view.group !== group) { managed.add(view.group); managed.add(group); view.group = group; }
        TELEPLOT.view.ensureGroup(group);
        let mark = view.timeGroupMark;
        if(mark.label !== label) mark.label = label;
        if(mark.color !== color) mark.color = color;
        let parent = label !== "" ? parentGroup : "";
        if(mark.parent !== parent) mark.parent = parent;
        if(Array.isArray(view.views)) { for(let child of view.views) visit(child, group); }
        else {
            let custom = group.startsWith(base + TELEPLOT.view.TIME_GROUP_SEPARATOR) ? found.get(group.slice((base + TELEPLOT.view.TIME_GROUP_SEPARATOR).length)) : undefined;
            if(custom) custom.views++;
        }
    };
    if(root) visit(root, base);
    return Array.from(found.values());
}

// Forget the groups that resolveTimeGroups handled and that no view uses any more (a custom group whose last view left, a renamed dashboard)
TELEPLOT.view.pruneTimeGroups = function(){
    let managed = TELEPLOT.view.__managedGroups;
    if(managed.size === 0) return;
    let used = new Set(TELEPLOT.view.views.map((view) => view.group));
    for(let name of Array.from(managed)) {
        if(used.has(name)) continue;
        delete TELEPLOT.view.groups[name];
        managed.delete(name);
    }
}

// The tooltip of the name of a telemetry, wherever a view shows it: its name and unit, then its description (ATTR|name|desc=...)
TELEPLOT.view.telemetryTip = function(telem) {
    if(!telem) return "";
    let name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id), unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
    let desc = telem.getDescription();
    return name + (unit ? " (" + unit + ")" : "") + (desc ? "\n" + desc : "");
}

TELEPLOT.view.addView = function(view){
    if(TELEPLOT.view.getView(view.id) !== undefined) { return; }
    TELEPLOT.view.views.push(view);
}

TELEPLOT.view.getView = function(viewId){
    return TELEPLOT.view.views.find((v)=> v.id === viewId);
}

// Whether a group of views (or any of them, without a name) shows a window of its own instead of all the data (a zoom, held, replay)
TELEPLOT.view.isZoomed = function(group){
    let groups = group === undefined ? Object.values(TELEPLOT.view.groups) : [TELEPLOT.view.groups[group]];
    return groups.some((g) => !!g && g.cursorActive);
}

// Back to the latest data: drops the zoom and the cursor of a group of views (of all of them, without a name), live again.
// Returns whether there was something to drop.
TELEPLOT.view.backToLive = function(group){
    let groups = group === undefined ? Object.values(TELEPLOT.view.groups) : [TELEPLOT.view.groups[group]];
    let changed = false;
    for(let g of groups) {
        if(!g) continue;
        if(g.cursorActive || g.cursorTimestamp >= 0 || (g.mode !== undefined && g.mode !== "live")) changed = true;
        _views_live(g);
        g.span = 0;
        g.cursorActive = false;
        g.timestampFrom = -1;
        g.timestampTo = -1;
    }
    return changed;
}

/*
 * Time shown (doc/time.md). Every group of views is live, held at a moment or replaying, on its own. What the views show is the last
 * sample at or before that moment: nothing is interpolated. Held, the window of the charts is frozen (data that keeps coming is
 * stored, not drawn); with a span it is placed so that the moment sits at PLACE of its width. Moves asked by the keyboard and the
 * wheel (move) are added up and applied once per update (__updateTime, a hook of the update loop), like the replay clock.
 */
TELEPLOT.view.PLACE = 0.7;      // Where the moment sits in a window of a span
TELEPLOT.view.ROOM = 0.06;      // Empty room before the moment when it is the oldest sample (the cursor line is never on the frame)
TELEPLOT.view.SPEEDS = [0.25, 0.5, 1, 2, 5, 10];

function _views_live(g) {
    g.mode = "live";
    g.at = -1;
    g.resume = undefined;
    g.pending = undefined;
    g.movedWithWindow = false;
    g.cursorTimestamp = -1;
}

// Telemetries shown by the views of a group (ids or names, once each)
TELEPLOT.view.groupTelemetries = function(name){
    let found = new Set();
    for(let view of TELEPLOT.view.views) {
        if(view.group !== name || !Array.isArray(view.telemetryIdOrNameList)) continue;
        for(let idOrName of view.telemetryIdOrNameList) found.add(idOrName);
    }
    return Array.from(found);
}

// The data entries of the telemetries of a group (what has samples, meta data types left out: thresholds and structures are not content)
function _views_groupEntries(name) {
    let entries = [];
    for(let idOrName of TELEPLOT.view.groupTelemetries(name)) {
        let telem = TELEPLOT.datastore.getTelemetry(idOrName);
        if(telem === undefined) continue;
        for(let dataType in telem.data) {
            if(TELEPLOT.protocol.isMetaDataType(Number(dataType))) continue;
            let entry = telem.data[dataType];
            if(entry && entry.timestamps && entry.timestamps.length) entries.push(entry);
        }
    }
    return entries;
}

// {from, to}: the oldest and the newest sample shown by a group, undefined without data
TELEPLOT.view.groupExtent = function(name){
    let from = Infinity, to = -Infinity;
    for(let entry of _views_groupEntries(name)) {
        if(entry.timestamps[0] < from) from = entry.timestamps[0];
        let last = entry.timestamps[entry.timestamps.length - 1];
        if(last > to) to = last;
    }
    return to === -Infinity ? undefined : { from, to };
}

// The window of a group that is not live, for its moment: a span placed with the moment at PLACE (within the data), or the whole
// data up to the newest sample when it was held (or up to the moment, when a replay goes further). Room is left before a moment that
// is the oldest sample.
function _views_place(g, extent) {
    let at = g.at, oldest = extent ? extent.from : at, newest = Math.max(g.frozenTo !== undefined ? g.frozenTo : at, at);
    let from, to;
    if(g.span > 0) {
        from = at - TELEPLOT.view.PLACE * g.span;
        to = from + g.span;
        if(to > newest) { to = newest; from = to - g.span; }
        if(from < oldest) { from = oldest; to = from + g.span; }
    }
    else { from = oldest; to = newest; }
    if(!(to > from)) { from = at - 1; to = at + 1; }
    if(at <= from) from = at - TELEPLOT.view.ROOM * (to - at) / (1 - TELEPLOT.view.ROOM);
    g.timestampFrom = from;
    g.timestampTo = to;
    g.cursorActive = true;
}

// The moment a group shows, and the window of its charts: {mode, at, from, to, speed, span} (live: "at" is its newest sample, and
// from / to the last span or, without one, the whole data)
TELEPLOT.view.timeOf = function(name){
    let g = TELEPLOT.view.ensureGroup(name);
    if(g.mode !== "live") return { mode: g.mode, at: g.at, from: g.timestampFrom, to: g.timestampTo, speed: g.speed, span: g.span, movedWithWindow: !!g.movedWithWindow };
    let extent = TELEPLOT.view.groupExtent(name);
    let to = extent ? extent.to : -1, from = extent ? (g.span > 0 ? Math.max(extent.from, to - g.span) : extent.from) : -1;
    return { mode: "live", at: to, from, to, speed: g.speed, span: g.span, movedWithWindow: false };
}

TELEPLOT.view.isLive = function(name){
    let g = TELEPLOT.view.groups[name];
    return !g || g.mode === undefined || g.mode === "live";
}

// Hold a group at a moment (default: what it shows now). Returns false when the group has no data to hold.
TELEPLOT.view.hold = function(name, at){
    let g = TELEPLOT.view.ensureGroup(name);
    let extent = TELEPLOT.view.groupExtent(name);
    if(extent === undefined) return false;
    let wasLive = g.mode === "live";
    if(at === undefined) at = wasLive ? (g.cursorTimestamp >= 0 ? g.cursorTimestamp : extent.to) : g.at;
    at = Math.min(Math.max(at, extent.from), extent.to);
    if(wasLive) {
        g.frozenTo = extent.to;
        g.resume = at >= extent.to ? "live" : "replay"; // (Space again: live when it was held at the latest data)
    }
    else if(g.mode === "replay") g.resume = "replay";
    g.mode = "held";
    g.at = at;
    g.movedWithWindow = false;
    g.cursorTimestamp = at;
    _views_place(g, extent);
    TELEPLOT.view.lastHeld = { name, count: (TELEPLOT.view.lastHeld ? TELEPLOT.view.lastHeld.count : 0) + 1 }; // (a GUI can follow the group last held: a click in one of its views)
    return true;
}

// Show another moment: held there (a replay goes on from it)
TELEPLOT.view.seek = function(name, at){
    let g = TELEPLOT.view.ensureGroup(name);
    let replaying = g.mode === "replay";
    if(!TELEPLOT.view.hold(name, at)) return false;
    if(g.resume === "live" && at !== undefined) g.resume = "replay";
    if(replaying) { g.mode = "replay"; g.lastTick = undefined; }
    return true;
}

// Replay from the moment shown (from the start of the window on screen when live)
TELEPLOT.view.play = function(name, speed){
    let g = TELEPLOT.view.ensureGroup(name);
    if(speed !== undefined) g.speed = speed;
    if(g.mode === "live") {
        let time = TELEPLOT.view.timeOf(name);
        if(!(time.from >= 0) || !TELEPLOT.view.hold(name, time.from)) return false;
    }
    g.mode = "replay";
    g.lastTick = undefined;
    g.resume = "replay";
    return true;
}

// Space: live or replaying -> held at the moment shown; held -> live again when it was held at the latest data, else replaying
TELEPLOT.view.togglePlay = function(name){
    let g = TELEPLOT.view.ensureGroup(name);
    if(g.mode === "held") {
        if(g.resume === "live") {
            let span = g.span;
            TELEPLOT.view.backToLive(name);
            g.span = span;
            return true;
        }
        return TELEPLOT.view.play(name);
    }
    return TELEPLOT.view.hold(name);
}

TELEPLOT.view.setSpeed = function(name, speed){
    let g = TELEPLOT.view.ensureGroup(name);
    g.speed = speed;
    if(g.mode === "replay") return true;
    return TELEPLOT.view.play(name, speed);
}

// Slower / faster in SPEEDS (dir -1 / +1)
TELEPLOT.view.changeSpeed = function(name, dir){
    let g = TELEPLOT.view.ensureGroup(name), list = TELEPLOT.view.SPEEDS;
    let index = list.indexOf(g.speed);
    if(index < 0) index = list.indexOf(1);
    return TELEPLOT.view.setSpeed(name, list[Math.min(list.length - 1, Math.max(0, index + dir))]);
}

// The zoom of a group: a duration (0: the whole window). Live: the last "span" seconds; otherwise placed again around the moment
TELEPLOT.view.setSpan = function(name, span){
    let g = TELEPLOT.view.ensureGroup(name);
    g.span = span > 0 ? span : 0;
    if(g.mode === "live") {
        if(g.span > 0) _views_liveWindow(g, TELEPLOT.view.groupExtent(name));
        else { g.cursorActive = false; g.timestampFrom = -1; g.timestampTo = -1; }
    }
    else _views_place(g, TELEPLOT.view.groupExtent(name));
}

// A period selected on a chart or a timeline: the group is held, the window is that period (and its duration the span)
TELEPLOT.view.zoomTo = function(name, from, to){
    let g = TELEPLOT.view.ensureGroup(name);
    if(!(to > from)) return false;
    let at = g.mode !== "live" ? g.at : (g.cursorTimestamp >= 0 ? g.cursorTimestamp : to);
    at = Math.min(Math.max(at, from), to);
    if(!TELEPLOT.view.hold(name, at)) return false;
    g.span = to - from;
    g.timestampFrom = from;
    g.timestampTo = to;
    g.cursorActive = true;
    return true;
}

// The previous / next real sample (dir -1 / +1) of the telemetries of a group, from the moment shown (or "from"). undefined: none.
TELEPLOT.view.sampleNear = function(name, dir, from){
    if(from === undefined) from = TELEPLOT.view.timeOf(name).at;
    let best = undefined;
    for(let entry of _views_groupEntries(name)) {
        let t = entry.timestamps, low = 0, high = t.length;
        if(dir > 0) { // First sample > from
            while(low < high) { let mid = (low + high) >> 1; if(t[mid] <= from) low = mid + 1; else high = mid; }
            if(low < t.length && (best === undefined || t[low] < best)) best = t[low];
        }
        else { // Last sample < from
            while(low < high) { let mid = (low + high) >> 1; if(t[mid] < from) low = mid + 1; else high = mid; }
            if(low > 0 && (best === undefined || t[low - 1] > best)) best = t[low - 1];
        }
    }
    return best;
}

TELEPLOT.view.step = function(name, dir){
    let at = TELEPLOT.view.sampleNear(name, dir);
    if(at === undefined) return false;
    return TELEPLOT.view.seek(name, at);
}

// Asked by the keyboard and the wheel: {seconds} and / or {samples}, added up and applied on the next update
TELEPLOT.view.move = function(name, by){
    let g = TELEPLOT.view.ensureGroup(name);
    let pending = g.pending || (g.pending = { seconds: 0, samples: 0 });
    pending.seconds += by.seconds || 0;
    pending.samples += by.samples || 0;
}

// Every group of a dashboard (its own and its custom ones) live again
TELEPLOT.view.allLive = function(base){
    let changed = false;
    for(let name of Object.keys(TELEPLOT.view.groups)) {
        if(name === base || name.startsWith(base + TELEPLOT.view.TIME_GROUP_SEPARATOR)) changed = TELEPLOT.view.backToLive(name) || changed;
    }
    return changed;
}

// The pointer left a view of the group: the views show the group's moment again (the latest one when live)
TELEPLOT.view.pointerLeft = function(name){
    let g = TELEPLOT.view.ensureGroup(name);
    g.cursorTimestamp = g.mode === "live" ? -1 : g.at;
}

function _views_liveWindow(g, extent) {
    if(!extent) return;
    if(g.timestampTo === extent.to && g.cursorActive) return;
    g.timestampTo = extent.to;
    g.timestampFrom = extent.to - g.span;
    g.cursorActive = true;
}

// Once per update: replays move on (on performance.now(), so a slow update shows a later time instead of slowing down), moves asked
// are applied, a held moment older than the data moves with the oldest sample, and a live window of a span follows the newest one
TELEPLOT.view.__updateTime = function(now = (typeof performance !== "undefined" ? performance.now() : Date.now())){
    for(let name in TELEPLOT.view.groups) {
        let g = TELEPLOT.view.groups[name];
        if(g.mode === undefined) Object.assign(g, { mode: "live", at: -1, speed: 1, span: 0 });
        if(g.mode === "live" && !g.pending && !(g.span > 0)) continue;
        let extent = TELEPLOT.view.groupExtent(name);
        if(extent === undefined) continue;
        if(g.pending) {
            let pending = g.pending;
            g.pending = undefined;
            let at = TELEPLOT.view.timeOf(name).at;
            for(let i = 0; i < Math.abs(pending.samples); i++) {
                let next = TELEPLOT.view.sampleNear(name, Math.sign(pending.samples), at);
                if(next === undefined) break;
                at = next;
            }
            at += pending.seconds;
            if(g.mode === "live" && at >= extent.to) {}
            else TELEPLOT.view.seek(name, at);
            continue;
        }
        if(g.mode === "live") { _views_liveWindow(g, extent); continue; }
        if(g.mode === "replay") {
            let last = g.lastTick;
            g.lastTick = now;
            if(last === undefined) continue;
            let at = g.at + (now - last) / 1000 * g.speed;
            if(at >= extent.to) { // Caught up: live again (with its span)
                let span = g.span;
                _views_live(g);
                g.span = span;
                if(span > 0) { g.cursorActive = false; _views_liveWindow(g, extent); }
                else { g.cursorActive = false; g.timestampFrom = -1; g.timestampTo = -1; }
                continue;
            }
            g.at = at;
            if(TELEPLOT.view.hoveredGroup !== name) g.cursorTimestamp = at;
            _views_place(g, extent);
            continue;
        }
        if(g.at < extent.from) { // Held: older than the data window
            g.at = extent.from;
            g.movedWithWindow = true;
            if(TELEPLOT.view.hoveredGroup !== name) g.cursorTimestamp = g.at;
            _views_place(g, extent);
        }
    }
}

TELEPLOT.view.updateViews = function(){
    for(let view of TELEPLOT.view.views) {
        try { view.update(); }
        catch(e) { console.error("Teleplot view update failed:", view.id, e); } // A failing view must not prevent the others from updating
    }
}

// Forget a view and everything it contains (it stops being updated and is unmounted). Detaching it from its parent layout is up to the caller.
TELEPLOT.view.removeView = function(view){
    TELEPLOT.view.disposeView(view, true);
    let unregister = (v) => {
        let idx = TELEPLOT.view.views.indexOf(v);
        if(idx >= 0) TELEPLOT.view.views.splice(idx, 1);
        if(Array.isArray(v.views)) v.views.forEach(unregister);
    };
    unregister(view);
}

// Unmount a view (and its children): used when it gets another place on the page
TELEPLOT.view.disposeView = function(view, recursive=true){
    view.dispose();
    if(recursive && Array.isArray(view.views)) view.views.forEach((child) => TELEPLOT.view.disposeView(child, true));
}
