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
    }

    getGroupName() { return this.name; }

    setView(view) { this.view = view; }
    getView() { return this.view; }
}

TELEPLOT.dashboards.getDashboard = function(name) {
    return TELEPLOT.dashboards.dashboards[name];
}

TELEPLOT.dashboards.hasDashboard = function(name) {
    return TELEPLOT.dashboards.getDashboard(name) !== undefined;
}

TELEPLOT.dashboards.addDashboard = function(name) {
    let id = -1;
    while(TELEPLOT.dashboards.hasDashboard(name)) {
        id = -1 * Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }
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