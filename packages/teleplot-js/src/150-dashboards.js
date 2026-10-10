TELEPLOT.dashboards = {
    dashboards: {}
}

class Dashboard {
    static constructedCount = 0;

    constructor(name="") {
        if (name=="") name = "Dashboard " + Dashboard.constructedCount++;
        this.name = name;
        this.id = "dashboard-layout-"+crypto.randomUUID();
        this.view = undefined;
        this.isAuto = false; // true for the dashboard filled automatically (enableAutoDashboard)
    }

    getGroupName() { return this.name; }

    setView(view) {     
        TELEPLOT.view.addView(view);
        this.view = view;
    }
    getView() { return this.view; }

    // Content summary, to list dashboards: number of displayed views (layouts excluded) and of distinct telemetries they show
    getStats() {
        let viewCount = 0;
        let telemetries = new Set();
        let visit = (view) => {
            if (!view) return;
            if (Array.isArray(view.views)) { view.views.forEach(visit); return; }
            viewCount++;
            for (let idOrName of (view.telemetryIdOrNameList || [])) {
                let telem = TELEPLOT.datastore.getTelemetry(idOrName);
                telemetries.add(telem ? telem.id : idOrName);
            }
        };
        visit(this.view);
        return { viewCount: viewCount, telemetryCount: telemetries.size };
    }
}

TELEPLOT.dashboards.getDashboard = function(name) {
    return TELEPLOT.dashboards.dashboards[name];
}

TELEPLOT.dashboards.hasDashboard = function(name) {
    return TELEPLOT.dashboards.getDashboard(name) !== undefined;
}

TELEPLOT.dashboards.addDashboard = function(name) {
    // Names are unique: "name 2", "name 3"... if already taken
    let baseName = name;
    for (let n = 2; TELEPLOT.dashboards.hasDashboard(name); n++) name = baseName + " " + n;
    let dashboard = new Dashboard(name);
    TELEPLOT.dashboards.dashboards[name] = dashboard;
    return dashboard;
}

// Renames a dashboard (the name stays unique: "name 2" if taken). The auto dashboard keeps its name, it is looked up by it. Returns the final name.
TELEPLOT.dashboards.renameDashboard = function(oldName, newName) {
    let dashboard = TELEPLOT.dashboards.getDashboard(oldName);
    newName = String(newName).trim();
    if (dashboard === undefined || dashboard.isAuto || newName == "" || newName == oldName) return oldName;
    let baseName = newName;
    for (let n = 2; TELEPLOT.dashboards.hasDashboard(newName); n++) newName = baseName + " " + n;
    delete TELEPLOT.dashboards.dashboards[oldName];
    dashboard.name = newName;
    TELEPLOT.dashboards.dashboards[newName] = dashboard;
    return newName;
}

// Deletes a dashboard and forgets its views (they stop being updated and are unmounted). The auto dashboard stays: new telemetries keep going to it.
// Returns true when a dashboard was deleted. Displaying another dashboard instead is up to the caller.
TELEPLOT.dashboards.removeDashboard = function(name) {
    let dashboard = TELEPLOT.dashboards.getDashboard(name);
    if (dashboard === undefined || dashboard.isAuto) return false;
    if (dashboard.view) TELEPLOT.view.removeView(dashboard.view);
    dashboard.view = undefined;
    delete TELEPLOT.dashboards.dashboards[name];
    return true;
}

TELEPLOT.dashboards.getOrCreateDashboard = function(name) {
    let dashboard = TELEPLOT.dashboards.getDashboard(name);
    if(dashboard === undefined) {
        dashboard = TELEPLOT.dashboards.addDashboard(name);
    }
    return dashboard;
}

/*
 * Time groups of a dashboard (see TELEPLOT.view.resolveTimeGroups): its views share one zoom and one cursor, unless a view or a
 * layout says otherwise with its "timeGroup" option.
 */

// Gives every view of every dashboard its group (update loop). Cheap: a walk through the views.
TELEPLOT.dashboards.resolveTimeGroups = function() {
    for (let name in TELEPLOT.dashboards.dashboards) {
        let dashboard = TELEPLOT.dashboards.dashboards[name];
        if (dashboard.view) TELEPLOT.view.resolveTimeGroups(dashboard.view, dashboard.getGroupName());
    }
    TELEPLOT.view.pruneTimeGroups();
}

// Custom time groups of a dashboard: [{name, key, color, views}]
TELEPLOT.dashboards.getTimeGroups = function(dashboardName) {
    let dashboard = TELEPLOT.dashboards.getDashboard(dashboardName);
    if (dashboard === undefined || !dashboard.view) return [];
    return TELEPLOT.view.resolveTimeGroups(dashboard.view, dashboard.getGroupName());
}

// Sets the time group of a view or a layout of a dashboard: "inherit", "dashboard", or "custom" with the name of the group to join.
// "custom" without a name creates a group, named "Time 2", "Time 3"... Returns the name of the custom group ("" otherwise).
TELEPLOT.dashboards.setTimeGroup = function(dashboardName, view, mode, name = "") {
    name = String(name).trim();
    if (mode !== "custom") name = "";
    else if (name === "") {
        let taken = TELEPLOT.dashboards.getTimeGroups(dashboardName).map((group) => group.name);
        for (let n = 2; ; n++) { name = "Time " + n; if (!taken.includes(name)) break; }
    }
    view.options.timeGroup = (mode === "custom" || mode === "dashboard") ? mode : "inherit";
    view.options.timeGroupName = name;
    TELEPLOT.dashboards.resolveTimeGroups();
    return name;
}

// Renames a custom time group of a dashboard (every view and layout that uses it follows; its zoom is kept). A name already used
// merges the two groups. Returns the final name.
TELEPLOT.dashboards.renameTimeGroup = function(dashboardName, oldName, newName) {
    let dashboard = TELEPLOT.dashboards.getDashboard(dashboardName);
    newName = String(newName).trim();
    if (dashboard === undefined || !dashboard.view || newName === "" || newName === oldName) return oldName;
    let prefix = dashboard.getGroupName() + TELEPLOT.view.TIME_GROUP_SEPARATOR;
    if (TELEPLOT.view.groups[prefix + newName] === undefined && TELEPLOT.view.groups[prefix + oldName] !== undefined) {
        TELEPLOT.view.groups[prefix + newName] = TELEPLOT.view.groups[prefix + oldName];
    }
    let visit = (view) => {
        if (view.options.timeGroup === "custom" && view.options.timeGroupName === oldName) view.options.timeGroupName = newName;
        if (Array.isArray(view.views)) view.views.forEach(visit);
    };
    visit(dashboard.view);
    TELEPLOT.dashboards.resolveTimeGroups();
    return newName;
}

// Creates an empty dashboard (a "grid" layout: views spread over the page, line after line) ready to receive views. An empty name gives "Dashboard 1", "Dashboard 2"...
TELEPLOT.dashboards.createDashboard = function(name = "") {
    if (name == "") {
        for (let n = 1; ; n++) {
            name = "Dashboard " + n;
            if (!TELEPLOT.dashboards.hasDashboard(name)) break;
        }
    }
    let dashboard = TELEPLOT.dashboards.addDashboard(name);
    let layout = new TELEPLOT.view.ViewLayout("", dashboard.getGroupName());
    layout.layout.type = "grid";
    layout.layout.align = "stretch"; // Views of a line share its height
    dashboard.setView(layout);
    return dashboard;
}

/*
 * Which view displays a telemetry best, and creating that view. Used by the auto dashboard and by applications that let users
 * add views (drop a telemetry on a dashboard...).
 * View types: "chart", "values", "log", "3d", "image".
 */
TELEPLOT.view.VIEW_TYPES = ["chart", "values", "log", "3d", "image"];

// Numbers are plotted, shapes and 3D numbers go to a 3D scene, images to an image view, anything else (text, 2D...) is shown as values.
// A telemetry without data yet defaults to a chart.
TELEPLOT.view.suggestViewType = function(telemIdOrName) {
    let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
    if(telem === undefined) return "chart";
    if(telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] !== undefined) return "image";
    if(TELEPLOT.view.ViewScene3D.kindOf(telem) !== undefined) return "3d";
    let dataType = Object.keys(telem.data)[0];
    if(dataType === undefined || dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER) return "chart";
    return "values";
}

// New view of a type ("chart", "values", "log", "3d" or "image"), showing the telemetries (ids or names), with a size that suits it. Undefined for an unknown type.
TELEPLOT.view.createView = function(type, telemetries = [], group = "default") {
    let view;
    if(type == "chart") { view = new TELEPLOT.view.ViewChart("", telemetries, group); view.setSize(2, 4); }
    else if(type == "values") view = new TELEPLOT.view.ViewCurrentValue("", telemetries, group);
    else if(type == "log") { view = new TELEPLOT.view.ViewLog("", telemetries, group); view.setSize(2, 4); }
    else if(type == "3d") view = new TELEPLOT.view.ViewScene3D("", telemetries, group);
    else if(type == "image") view = new TELEPLOT.view.ViewImage("", telemetries, group);
    return view;
}

/*
 * Auto dashboard: new telemetries are displayed without any setup (like Teleplot V1: send data, see it).
 * Telemetries that have the same view label (TELEM_ATTR_VIEW_LABEL, "name,label" in the text protocol) and are displayed the same way share
 * one view, titled with the label. The label only decides where a telemetry first goes: one that is already displayed is not moved.
 * Number telemetries get a chart, shapes and 3D numbers share one 3D scene, other types a current value view, telemetries with the autoplot
 * attribute set to false (text protocol flag "np") are left alone. Views are added to a "grid" layout (charts two columns wide, values one).
 * The dashboard is created when the first telemetry shows up; onCreated(dashboard) lets the caller
 * display it (the library doesn't decide where a dashboard goes on the page).
 */
TELEPLOT.dashboards.enableAutoDashboard = function(name = "Live", onCreated = () => {}) {
    let layout = undefined;
    let scene = undefined; // The 3D view every shape without label goes to: things that live in the same space are seen together
    let labelled = {};     // "label|view type" -> the view of the telemetries of that label
    TELEPLOT.datastore.onNewTelemetryHooks.push((telem) => {
        if (telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT) === false) return;
        let dataType = Object.keys(telem.data)[0];
        if (dataType === undefined && telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE) === undefined) return; // No data (yet): nothing to display
        // A telemetry that was forgotten and comes back (forgetTelemetries) is already displayed
        if (layout !== undefined && layout.views.some((v) => v.telemetryIdOrNameList && v.telemetryIdOrNameList.includes(telem.id))) return;

        let isNew = layout === undefined;
        let dashboard = TELEPLOT.dashboards.getOrCreateDashboard(name);
        if (isNew) {
            dashboard.isAuto = true;
            layout = new TELEPLOT.view.ViewLayout("", dashboard.getGroupName());
            layout.layout.type = "grid";
            layout.layout.align = "stretch";
            dashboard.setView(layout);
        }

        let type = TELEPLOT.view.suggestViewType(telem.id);
        let label = type == "image" ? undefined : telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL); // An image view shows one picture: images are not grouped
        let shared = label ? labelled[label + "|" + type] : (type == "3d" ? scene : undefined);
        if (shared !== undefined && layout.getViewFromId(shared.id) !== undefined) shared.addTelemetry(telem.id); // (a view the user removed is not used anymore)
        else {
            let view = TELEPLOT.view.createView(type, [telem.id], dashboard.getGroupName());
            if (label) { labelled[label + "|" + type] = view; view.setOption("title", label); view.followLabel(label); }
            else if (type == "3d") scene = view;
            layout.addView(view);
        }
        if (isNew) onCreated(dashboard);
    });
}
