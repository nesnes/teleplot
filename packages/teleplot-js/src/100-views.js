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
    // around it) is zoomed, or all the time with TELEPLOT.view.showTimeGroups (an editor...).
    __syncTimeGroup(element) {
        let mark = this.timeGroupMark;
        let group = TELEPLOT.view.groups[this.group];
        let zoomed = !!(group && group.cursorActive);
        let around = mark.parent ? TELEPLOT.view.groups[mark.parent] : undefined;
        let shown = mark.label !== "" && (TELEPLOT.view.showTimeGroups || zoomed || !!(around && around.cursorActive));
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
        element.classList.toggle("teleplot-js-time-group-frame", Array.isArray(this.views));
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
            /* Time group that starts on this view: a tag astride its top edge (it covers nothing of the view); a layout gets a frame with the tag inside, at the top */
            .teleplot-js-time-group {
                position: absolute; top: -0.8em; right: 0.9em; z-index: 4;
                display: inline-flex; align-items: center; gap: 0.35em; max-width: calc(100% - 1em);
                padding: 0.05em 0.5em; border-radius: 0.8em; font-size: 0.85em; line-height: 1.5; white-space: nowrap;
                color: var(--teleplot-text, inherit); background: var(--teleplot-surface, Canvas);
                box-shadow: inset 0 0 0 1px var(--teleplot-time-group);
            }
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
    showTimeGroups: false // true: time groups are marked on the views all the time (an editor), not only while they are zoomed
};

// State of a group of views (created if needed): its zoom (cursorActive, timestampFrom/To) and its cursor
TELEPLOT.view.ensureGroup = function(name){
    if(TELEPLOT.view.groups[name] === undefined) {
        TELEPLOT.view.groups[name] = { cursorActive: false, cursorTimestamp: -1, timestampFrom: -1, timestampTo: -1 };
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

TELEPLOT.view.addView = function(view){
    if(TELEPLOT.view.getView(view.id) !== undefined) { return; }
    TELEPLOT.view.views.push(view);
}

TELEPLOT.view.getView = function(viewId){
    return TELEPLOT.view.views.find((v)=> v.id === viewId);
}

// Whether a group of views (or any of them, without a name) is zoomed on a time range instead of following the latest data
TELEPLOT.view.isZoomed = function(group){
    let groups = group === undefined ? Object.values(TELEPLOT.view.groups) : [TELEPLOT.view.groups[group]];
    return groups.some((g) => !!g && g.cursorActive);
}

// Back to the latest data: drops the zoom and the cursor of a group of views (of all of them, without a name). Returns whether there was something to drop.
TELEPLOT.view.backToLive = function(group){
    let groups = group === undefined ? Object.values(TELEPLOT.view.groups) : [TELEPLOT.view.groups[group]];
    let changed = false;
    for(let g of groups) {
        if(!g) continue;
        if(g.cursorActive || g.cursorTimestamp >= 0) changed = true;
        g.cursorActive = false;
        g.cursorTimestamp = -1;
        g.timestampFrom = -1;
        g.timestampTo = -1;
    }
    return changed;
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
