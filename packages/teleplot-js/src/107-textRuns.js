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
 * Levels of a stack: a text entry whose texts are paths ("loop/plan/search": what is running, a separator between levels).
 * stackRuns(entry) gives { levels: [{ timestamps, data: [keys] }] }: for each depth, one item per run of the same path down to
 * that depth ("loop", "loop/plan", "loop/plan/search"; "" when the stack is not that deep), in the shape of a data entry. A level
 * lasts while what is above it and itself do not change, whatever happens deeper. Cached and completed like textRuns.
 */
const _stackRuns_cache = new WeakMap();
const _stackRuns_MAX_DEPTH = 64; // (a path deeper than that is cut: a mistake, not a stack)

TELEPLOT.stackRuns = function(entry, separator = "/") {
    let stamps = entry.timestamps, texts = entry.data[0];
    let runs = _stackRuns_cache.get(entry);
    if(runs === undefined || runs.late !== entry.lateInsertions || runs.pruned !== entry.pruned || runs.source !== stamps || runs.count > stamps.length || runs.separator !== separator) {
        runs = { late: entry.lateInsertions, pruned: entry.pruned, source: stamps, separator, count: 0, last: undefined, levels: [] };
        _stackRuns_cache.set(entry, runs);
    }
    let levels = runs.levels;
    for(let i = runs.count; i < stamps.length; i++) {
        let text = String(texts[i]);
        if(text === runs.last) continue; // (said again: nothing changed at any level)
        runs.last = text;
        let parts = text === "" ? [] : text.split(separator);
        if(parts.length > _stackRuns_MAX_DEPTH) parts.length = _stackRuns_MAX_DEPTH;
        let key = "";
        for(let depth = 0; depth < Math.max(parts.length, levels.length); depth++) {
            key = depth < parts.length ? (depth === 0 ? parts[0] : key + separator + parts[depth]) : "";
            let level = levels[depth];
            if(level === undefined) level = levels[depth] = { timestamps: [], data: [[]] };
            let keys = level.data[0];
            if(keys.length && keys[keys.length - 1] === key) continue;
            level.timestamps.push(stamps[i]);
            keys.push(key);
        }
    }
    runs.count = stamps.length;
    return runs;
}
