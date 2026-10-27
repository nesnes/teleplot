/*
 * Runs of a text data entry: a state that is sent again and again with the same text is, for what displays states, one run that
 * starts at its first sample. textRuns(entry) gives { timestamps, data: [texts] } with one item per run (the shape of a data entry,
 * so that what works on samples works on runs), kept in a cache next to the entry and completed as samples are appended: a state
 * sent a thousand times per second is not gone through on every update. Built again when samples were inserted or removed.
 * Nothing is changed nor made up: a run is the first sample of its text, the others say the same thing.
 */
const _textRuns_cache = new WeakMap(); // data entry -> { late, pruned, source, count, timestamps, data: [texts] }

TELEPLOT.textRuns = function(entry) {
    let stamps = entry.timestamps, texts = entry.data[0];
    let runs = _textRuns_cache.get(entry);
    if(runs === undefined || runs.late !== entry.lateInsertions || runs.pruned !== entry.pruned || runs.source !== stamps || runs.count > stamps.length) {
        runs = { late: entry.lateInsertions, pruned: entry.pruned, source: stamps, count: 0, timestamps: [], data: [[]] };
        _textRuns_cache.set(entry, runs);
    }
    let kept = runs.data[0];
    let last = kept.length ? kept[kept.length - 1] : undefined;
    for(let i = runs.count; i < stamps.length; i++) {
        let text = String(texts[i]);
        if(text === last) continue;
        runs.timestamps.push(stamps[i]);
        kept.push(text);
        last = text;
    }
    runs.count = stamps.length;
    return runs;
}

/*
 * Nodes of a stack (doc/graph.md): a text entry whose texts are paths ("loop/plan/search": what runs, a separator between levels),
 * several of them at once separated by "," ("nav/follow,arm/idle"), each with an optional status after "=" ("root/patrol=failure").
 * A path without a status runs, and so do the nodes that hold it.
 * stackRuns(entry) gives { nodes: Map path -> node, order: [paths, in the order they showed up] }. A node is { path, name (its last
 * part), depth, parent ("" for a root), timestamps, data: [states] } in the shape of a data entry: one item per run of the same state,
 * a state being "" (it runs), a status (a text: it ended so), or null (it is not in the stack: a hole). A node lasts while its state
 * does not change, whatever happens deeper or beside it. Names keep their %XX (TELEPLOT.protocol.decodeName reads them).
 * Cached and completed like textRuns.
 */
const _stackRuns_cache = new WeakMap();
const _stackRuns_MAX_DEPTH = 64; // (a path deeper than that is cut: a mistake, not a stack)

TELEPLOT.stackRuns = function(entry, separator = "/") {
    let stamps = entry.timestamps, texts = entry.data[0];
    let runs = _stackRuns_cache.get(entry);
    if(runs === undefined || runs.late !== entry.lateInsertions || runs.pruned !== entry.pruned || runs.source !== stamps || runs.count > stamps.length || runs.separator !== separator) {
        runs = { late: entry.lateInsertions, pruned: entry.pruned, source: stamps, separator, count: 0, last: undefined, nodes: new Map(), order: [] };
        _stackRuns_cache.set(entry, runs);
    }
    for(let i = runs.count; i < stamps.length; i++) {
        let text = String(texts[i]);
        if(text === runs.last) continue; // (said again: nothing changed)
        runs.last = text;
        let states = TELEPLOT.stackStates(text, separator);
        for(let [path, state] of states) {
            let node = runs.nodes.get(path);
            if(node === undefined) {
                let parts = path.split(separator);
                node = { path, name: parts[parts.length - 1], depth: parts.length - 1, parent: parts.slice(0, -1).join(separator), timestamps: [], data: [[]] };
                runs.nodes.set(path, node);
                runs.order.push(path);
            }
            let kept = node.data[0];
            if(kept.length && kept[kept.length - 1] === state) continue;
            node.timestamps.push(stamps[i]);
            kept.push(state);
        }
        for(let node of runs.nodes.values()) { // What is not in the stack any more: a hole from now on
            if(states.has(node.path)) continue;
            let kept = node.data[0];
            if(kept.length && kept[kept.length - 1] !== null) { node.timestamps.push(stamps[i]); kept.push(null); }
        }
    }
    runs.count = stamps.length;
    return runs;
}

// What a stack text says of each node: Map path -> "" (runs) or its status. The nodes that hold a path run, unless they are given
// a status of their own.
TELEPLOT.stackStates = function(text, separator = "/") {
    let states = new Map(), implied = [];
    if(text === "") return states;
    for(let item of text.split(",")) {
        let equal = item.indexOf("=");
        let path = equal < 0 ? item : item.slice(0, equal), status = equal < 0 ? "" : item.slice(equal + 1);
        let parts = path.split(separator).map((part) => part.trim()).filter((part) => part !== "");
        if(!parts.length) continue;
        if(parts.length > _stackRuns_MAX_DEPTH) parts.length = _stackRuns_MAX_DEPTH;
        states.set(parts.join(separator), status);
        for(let depth = 1; depth < parts.length; depth++) implied.push(parts.slice(0, depth).join(separator));
    }
    for(let path of implied) if(!states.has(path)) states.set(path, "");
    return states;
}
