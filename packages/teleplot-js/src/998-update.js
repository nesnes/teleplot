let _updates_lastPrune = 0;
TELEPLOT.updates = {};

TELEPLOT.updates.onUpdateHooks = [
    () => { // Old data is removed a few times per second: going through every telemetry 30 times per second costs more than it frees
        let now = Date.now();
        if(now - _updates_lastPrune < 250) return;
        _updates_lastPrune = now;
        TELEPLOT.datastore.__deleteTimedOutData();
    },
    () => TELEPLOT.datastore.checkMemory(), // (does its work once per second)
    () => TELEPLOT.dashboards.resolveTimeGroups(), // Views follow the time group of their layout (or their own)
    () => { // (poses of frames are shared by the views during the update: see ViewScene3D.poseOf)
        TELEPLOT.view.ViewScene3D.__poseCache = new Map();
        try { TELEPLOT.view.updateViews(); }
        finally { TELEPLOT.view.ViewScene3D.__poseCache = undefined; }
    },
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