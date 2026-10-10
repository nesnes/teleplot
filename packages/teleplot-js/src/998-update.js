TELEPLOT.updates = {};

TELEPLOT.updates.onUpdateHooks = [
    TELEPLOT.datastore.__deleteTimedOutData,
    () => TELEPLOT.datastore.checkMemory(), // (does its work once per second)
    () => TELEPLOT.dashboards.resolveTimeGroups(), // Views follow the time group of their layout (or their own)
    TELEPLOT.view.updateViews,
]

TELEPLOT.updates.update = function() {
    for(let hook of TELEPLOT.updates.onUpdateHooks) {
        try { hook(); }
        catch(e) { console.error("Teleplot update hook failed:", e); } // A failing hook must not prevent the others (ex: views) from running
    }
}

TELEPLOT.updates.setUpdateInterval = function(intervalMs=TELEPLOT.state.updateIntervalMs) {
    if(TELEPLOT.updates.updateInterval != undefined) {
        clearInterval(TELEPLOT.updates.updateInterval);
    }
    TELEPLOT.updates.updateInterval = setInterval(TELEPLOT.updates.update, intervalMs);
}

TELEPLOT.updates.setUpdateInterval();