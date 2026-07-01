TELEPLOT.updates = {};

TELEPLOT.updates.onUpdateHooks = [
    TELEPLOT.datastore.__deleteTimedOutData,
    TELEPLOT.view.updateViews,
]

TELEPLOT.updates.update = function() {
    for(let hook of TELEPLOT.updates.onUpdateHooks) {
        hook();
    }
}

TELEPLOT.updates.setUpdateInterval = function(intervalMs=TELEPLOT.state.updateIntervalMs) {
    if(TELEPLOT.updates.updateInterval != undefined) {
        clearInterval(TELEPLOT.updates.updateInterval);
    }
    TELEPLOT.updates.updateInterval = setInterval(TELEPLOT.updates.update, intervalMs);
}

TELEPLOT.updates.setUpdateInterval();