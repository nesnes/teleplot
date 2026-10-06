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

TELEPLOT.dashboards.getOrCreateDashboard = function(name) {
    let dashboard = TELEPLOT.dashboards.getDashboard(name);
    if(dashboard === undefined) {
        dashboard = TELEPLOT.dashboards.addDashboard(name);
    }
    return dashboard;
}

// Creates an empty dashboard (a wrapping "row" layout) ready to receive views. An empty name gives "Dashboard 1", "Dashboard 2"...
TELEPLOT.dashboards.createDashboard = function(name = "") {
    if (name == "") {
        for (let n = 1; ; n++) {
            name = "Dashboard " + n;
            if (!TELEPLOT.dashboards.hasDashboard(name)) break;
        }
    }
    let dashboard = TELEPLOT.dashboards.addDashboard(name);
    let layout = new TELEPLOT.view.ViewLayout("", dashboard.getGroupName());
    layout.layout.type = "row";
    dashboard.setView(layout);
    return dashboard;
}

/*
 * Auto dashboard: new telemetries are displayed without any setup (like Teleplot V1: send data, see it).
 * Number telemetries get a chart, other types a current value view, telemetries with the autoplot
 * attribute set to false (text protocol flag "np") are left alone. Views are added to a "row" layout that wraps.
 * The dashboard is created when the first telemetry shows up; onCreated(dashboard) lets the caller
 * display it (the library doesn't decide where a dashboard goes on the page).
 */
TELEPLOT.dashboards.enableAutoDashboard = function(name = "Live", onCreated = () => {}) {
    let layout = undefined;
    TELEPLOT.datastore.onNewTelemetryHooks.push((telem) => {
        if (telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT) === false) return;
        let dataType = Object.keys(telem.data)[0];
        if (dataType === undefined) return; // No data (yet): nothing to display

        let isNew = layout === undefined;
        let dashboard = TELEPLOT.dashboards.getOrCreateDashboard(name);
        if (isNew) {
            dashboard.isAuto = true;
            layout = new TELEPLOT.view.ViewLayout("", dashboard.getGroupName());
            layout.layout.type = "row";
            dashboard.setView(layout);
        }

        let view;
        if (dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER) {
            view = new TELEPLOT.view.ViewChart("", [telem.id], dashboard.getGroupName());
            view.setSize(2, 4);
        }
        else {
            view = new TELEPLOT.view.ViewCurrentValue("", [telem.id], dashboard.getGroupName());
        }
        layout.addView(view);
        if (isNew) onCreated(dashboard);
    });
}
