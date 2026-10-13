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
