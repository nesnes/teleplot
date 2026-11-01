/*
 * Moments (doc/moments.md): periods of time a device declares, a cycle, an operation, a phase. A moment is a node of a stack with the
 * "mom" flag: it starts when the node runs and ends with its status, or when it leaves the stack. Nothing is made up: a moment whose
 * end was not received is marked unknown, a moment that still runs has no end, and a result is what the device wrote.
 * A moment: { telem, path, name, kind, number, depth, parent, children, from, to (undefined: it still runs), result, failed, unknown }
 * Cached per data entry and completed as samples are appended, like stackRuns.
 */
const _moments_cache = new WeakMap();

function _moments_entry(telem) { return telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT]; }

function _moments_create(telem, node, from) {
    let name = TELEPLOT.protocol.decodeName(node.name), hash = name.lastIndexOf("#");
    return TELEPLOT.Vue.markRaw({
        telem, path: node.path, name, kind: hash > 0 ? name.slice(0, hash) : name, number: hash > 0 ? name.slice(hash + 1) : "",
        depth: node.depth, parent: undefined, children: [], from, to: undefined, result: "", failed: false, unknown: false,
    });
}

// What is known of a moment that leaves the stack at time t: the first sample after a hole says nothing of when it really ended
function _moments_close(moment, t, state, entry) {
    moment.to = t;
    if(state) {
        moment.result = state;
        moment.failed = TELEPLOT.view.ViewLog.getLevel(state) === 2;
        return;
    }
    for(let gap of entry.gaps || []) {
        if(gap.to === t && gap.from >= moment.from) { moment.to = gap.from; moment.unknown = true; return; }
    }
}

TELEPLOT.moments = {
    primary: undefined,  // Name of the telemetry the line shows at rest (undefined: the first one)
    hidden: new Set(),   // Names of the telemetries kept off the line

    isMoment(telem) { return telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_MOMENT) === true; },

    // The moment telemetries that have data, in the order they first came
    telemetries() {
        let found = [];
        for(let id in TELEPLOT.datastore.telemetries) {
            let telem = TELEPLOT.datastore.telemetries[id];
            let entry = TELEPLOT.moments.isMoment(telem) ? _moments_entry(telem) : undefined;
            if(entry && entry.timestamps.length) found.push(telem);
        }
        return found.sort((a, b) => a.serial - b.serial);
    },

    // The ones on the line: not hidden. A chart shows those of its labels when it has any
    visible() { return TELEPLOT.moments.telemetries().filter((telem) => !TELEPLOT.moments.hidden.has(telem.getName())); },
    forView(view) {
        let all = TELEPLOT.moments.visible(), labels = new Set();
        for(let idOrName of view.telemetryIdOrNameList || []) {
            let telem = TELEPLOT.datastore.getTelemetry(idOrName), label = telem && telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL);
            if(label) labels.add(label);
        }
        let own = all.filter((telem) => labels.has(telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL)));
        return own.length ? own : all;
    },

    // { moments (by start time), rows (per depth, per row: moments that do not overlap), roots }
    of(telem) {
        let entry = _moments_entry(telem);
        if(entry === undefined) return { moments: [], rows: [], roots: [] };
        let runs = TELEPLOT.stackRuns(entry);
        let found = _moments_cache.get(entry);
        if(found === undefined || found.runs !== runs) {
            found = { runs, count: -1, moments: [], rows: [], roots: [], done: new Map(), byPath: new Map() };
            _moments_cache.set(entry, found);
        }
        if(found.count === runs.count) return found;
        found.count = runs.count;
        let added = [];
        for(let node of runs.nodes.values()) {
            let done = found.done.get(node.path);
            if(done === undefined) { done = { index: 0, open: undefined }; found.done.set(node.path, done); }
            let states = node.data[0];
            for(; done.index < states.length; done.index++) {
                let state = states[done.index], t = node.timestamps[done.index];
                if(state === "") {
                    if(done.open === undefined) { done.open = _moments_create(telem, node, t); added.push(done.open); }
                }
                else if(done.open !== undefined) { _moments_close(done.open, t, state, entry); done.open = undefined; }
                else if(state !== null && (done.index === 0 || states[done.index - 1] === null)) { // A result alone: an instant
                    let moment = _moments_create(telem, node, t);
                    _moments_close(moment, t, state, entry);
                    added.push(moment);
                }
            }
        }
        if(added.length) {
            added.sort((a, b) => a.from - b.from || a.depth - b.depth);
            for(let moment of added) {
                let list = found.byPath.get(moment.path);
                if(list === undefined) found.byPath.set(moment.path, list = []);
                list.push(moment);
            }
            for(let moment of added) {
                let parents = moment.depth > 0 ? found.byPath.get(moment.path.slice(0, moment.path.lastIndexOf("/"))) : undefined;
                for(let i = parents ? parents.length - 1 : -1; i >= 0; i--) {
                    if(parents[i].from <= moment.from) { moment.parent = parents[i]; parents[i].children.push(moment); break; }
                }
                if(moment.parent === undefined) found.roots.push(moment);
                found.moments.push(moment);
            }
            found.moments.sort((a, b) => a.from - b.from || a.depth - b.depth);
            found.roots.sort((a, b) => a.from - b.from);
        }
        found.rows = TELEPLOT.moments.buildRows(found.moments);
        return found;
    },

    // Per depth, rows of moments that do not overlap: a level takes one row, and more only where moments run at the same time
    buildRows(moments) {
        let rows = [];
        for(let moment of moments) {
            let level = rows[moment.depth] || (rows[moment.depth] = []), placed = false;
            for(let row of level) {
                let last = row[row.length - 1];
                if(last.to !== undefined && last.to <= moment.from) { row.push(moment); placed = true; break; }
            }
            if(!placed) level.push([moment]);
        }
        for(let depth = 0; depth < rows.length; depth++) if(rows[depth] === undefined) rows[depth] = [];
        return rows;
    },

    // Its end, or the newest sample of its telemetry while it runs
    end(moment) {
        if(moment.to !== undefined) return moment.to;
        let times = _moments_entry(moment.telem).timestamps;
        return times[times.length - 1];
    },

    // The first depth with more than one moment (in a period, when given); otherwise the deepest that has one there
    restLevel(telem, from = -Infinity, to = Infinity) {
        let rows = TELEPLOT.moments.of(telem).rows, found = 0;
        for(let depth = 0; depth < rows.length; depth++) {
            let count = 0;
            for(let row of rows[depth]) for(let moment of row) if(moment.from <= to && TELEPLOT.moments.end(moment) >= from) count++;
            if(count > 1) return depth;
            if(count) found = depth;
        }
        return found;
    },

    // The moments of a depth, by start time
    level(telem, depth) { return TELEPLOT.moments.of(telem).moments.filter((moment) => moment.depth === depth); },

    // The telemetry the line shows at rest
    primaryOf(telemetries) {
        return telemetries.find((telem) => telem.getName() === TELEPLOT.moments.primary) || telemetries[0];
    },

    // The deepest moment running at a time, undefined if none
    at(t, telem) {
        let inside = (list) => {
            for(let i = list.length - 1; i >= 0; i--) {
                let moment = list[i];
                if(moment.from > t) continue;
                if(moment.to === undefined || t < moment.to) return inside(moment.children) || moment; // (one that still runs holds what comes after its last sample)
                if(list.length - i > 64) return undefined; // (older ones ended long ago, unless a very long one holds this time: not worth going through all of them)
            }
            return undefined;
        };
        return inside(TELEPLOT.moments.of(telem).roots);
    },

    // A moment in words: "pick #43", with what is known of how it ended
    label(moment) { return moment.name.replace("#", " #"); },
    mark(moment) { return moment.to === undefined ? "…" : moment.unknown ? "?" : moment.failed ? "✕" : moment.result ? "✓" : "–"; },
    describe(moment) {
        let seconds = TELEPLOT.moments.end(moment) - moment.from;
        return `${TELEPLOT.moments.label(moment)} ${TELEPLOT.moments.mark(moment)} ${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
    },
    // A moment with what holds it: "patrol › leg #4 › drive – 5.4 s"
    pathText(moment) {
        return TELEPLOT.moments.pathOf(moment).slice(0, -1).map(TELEPLOT.moments.label).concat(TELEPLOT.moments.describe(moment)).join(" \u203a ");
    },
    // The path of a moment, from the top: [moments]
    pathOf(moment) {
        let path = [];
        for(let current = moment; current; current = current.parent) path.unshift(current);
        return path;
    },
    // The kinds and results found, to filter on
    kinds(telemetries) {
        let kinds = new Set();
        for(let telem of telemetries) for(let moment of TELEPLOT.moments.of(telem).moments) kinds.add(moment.kind);
        return Array.from(kinds);
    },
};
