/*
 * Telemetry cards: what a telemetry is and what it holds, from the Telemetries panel. See doc/webapp-layout.md "Telemetry cards".
 *
 * - The pointer resting on a tile of the panel (0.5 s) shows its card next to the panel (a finger: a tap); dragging the tile hides it at
 *   once. Its Pin button pins it (a click on the tile does not): a window of its own, moved by its title bar, that stays where it is
 *   put whatever the panel does (scroll, close, another dashboard), resized by its bottom edge or its corner. As many as wanted. One card, the same whether pinned or not.
 *   Under 640 px the cards are one sheet from the bottom: the card not pinned, else the pinned ones with a chip per card.
 * - The same blocks for every telemetry, always in this order, each one folds to a line (what is folded is remembered for all cards):
 *   the value at the time shown, Values (statistics of the time window), Commands, Kept, Data received, Attributes, Source, Shown in.
 * - Time: the default time group of the dashboard on display. The value is the last sample at or before the time it shows (latest when
 *   live); the statistics are those of its window (what its charts show: the zoom, the span, or all the data kept).
 * - Only what is stored is read: a mean is of the samples kept in the window, a rate is between real samples, nothing is estimated
 *   beyond them. Statistics and strips are worked out once per second; the value 4 times per second.
 *
 * - Lists of legends: the Pin button of the list of a legend (the "+N" chip of a chart, a 3D, 2D or image view: TELEPLOT.view.pinLegend)
 *   opens the same kind of window, which follows its view: its series or telemetries, its time group; a click on a row shows or hides
 *   it on the view, the pointer on a row highlights it. A chart's is the list of its popover (ViewChart.createLegendList), kept up to date
 *   by the update loop of the library; a scene's mirrors the rows of its legend (as fresh as the view: drawn when it is on screen).
 *   The window goes when its view is removed.
 *
 * The tcard* functions read the library and know nothing of the DOM (tests/telemetry-card.test.js); the component draws them.
 */
const TCARD_PEEK_MS = 500;       // Pointer resting on a tile before its card shows
const TCARD_LEAVE_MS = 200;      // A card not pinned stays that long after the pointer left the tile (to reach the card)
const TCARD_STATS_MS = 1000;     // Statistics and strips are worked out again at most this often
const TCARD_TICKS = 60;          // A data type with fewer samples than this is drawn as a tick per sample
const TCARD_SEGMENTS = 120;      // At most this many pieces in a strip (the longest gaps are kept)
const TCARD_FOLDS_KEY = "teleplot.cardFolds";

// Cards on display: the one not pinned (peek: {id, x, y}) and the pinned ones ({key, kind: "telemetry" | "legend", id (of the telemetry,
// of the view), x, y, z}), and the blocks folded for all cards
const tcardState = Vue.reactive({ peek: null, pinned: [], folded: tcardLoadFolds(), z: 1, sheetIndex: 0, nextKey: 1 });

function tcardLoadFolds() {
    try { const folds = JSON.parse(localStorage.getItem(TCARD_FOLDS_KEY) || "{}"); return folds && typeof folds === "object" ? folds : {}; }
    catch (e) { return {}; }
}
function tcardSaveFolds() {
    try { localStorage.setItem(TCARD_FOLDS_KEY, JSON.stringify(tcardState.folded)); } catch (e) { /* (a private window: not remembered) */ }
}

// ---------------------------------------------------------------------------------------------------------- reading the library

// What a data type is called on a card
function tcardTypeLabel(P, type) {
    type = Number(type);
    return ({
        [P.SECTION_TYPE_TELEM_DATA_NUMBER]: "Number", [P.SECTION_TYPE_TELEM_DATA_NUMBER_2D]: "Number xy", [P.SECTION_TYPE_TELEM_DATA_NUMBER_3D]: "Number xyz",
        [P.SECTION_TYPE_TELEM_DATA_TEXT]: "Text", [P.SECTION_TYPE_TELEM_DATA_IMAGE]: "Picture",
        [P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION]: "Position", [P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION]: "Rotation",
        [P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION]: "Orientation", [P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR]: "Color",
        [P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB]: "Color", [P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY]: "Opacity",
        [P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE]: "Size", [P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE]: "Texture",
        [P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS]: "Intrinsics", [P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION]: "Distortion",
        [P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD]: "Points", [P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR]: "Vector",
        [P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT]: "Shape text", [P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH]: "Line width",
        [P.SECTION_TYPE_TELEM_DATA_THRESHOLD]: "Thresholds", [P.SECTION_TYPE_TELEM_DATA_ENUM]: "States (enum)", [P.SECTION_TYPE_TELEM_DATA_EDGES]: "Transitions",
    })[type] || "Data " + type;
}

// The data types of a telemetry, in the order of the protocol (what it holds first, what describes it after)
function tcardTypes(telem) {
    return Object.keys(telem.data).map(Number).filter((t) => telem.data[t] && telem.data[t].timestamps.length).sort((a, b) => a - b);
}

// The data type that says what a telemetry holds: a number, a text, a picture, a cloud... else the one with the most samples
function tcardMainType(P, telem) {
    const types = tcardTypes(telem).filter((t) => !P.isMetaDataType(t));
    for (const t of [P.SECTION_TYPE_TELEM_DATA_NUMBER, P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, P.SECTION_TYPE_TELEM_DATA_TEXT, P.SECTION_TYPE_TELEM_DATA_IMAGE, P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD])
        if (types.includes(t)) return t;
    return types.sort((a, b) => telem.data[b].timestamps.length - telem.data[a].timestamps.length)[0];
}

// Index of the last timestamp at or before t (t < 0: the latest), -1 when there is none
function tcardIndexAt(timestamps, t) {
    const n = timestamps.length;
    if (!n) return -1;
    if (!(t >= 0) || timestamps[n - 1] <= t) return n - 1;
    let lo = 0, hi = n; // First index after t
    while (lo < hi) { const mid = (lo + hi) >> 1; if (timestamps[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo - 1;
}

// [first, end) indexes of the timestamps within [from, to]
function tcardSlice(timestamps, from, to) {
    const bound = (t, strict) => {
        let lo = 0, hi = timestamps.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (strict ? timestamps[mid] <= t : timestamps[mid] < t) lo = mid + 1; else hi = mid; }
        return lo;
    };
    return [from === -Infinity ? 0 : bound(from, false), to === Infinity ? timestamps.length : bound(to, true)];
}

// The time a card shows: the default time group of the dashboard on display (group undefined: no dashboard, live and all the data).
// {mode: "live" | "pointer" (live, the pointer on a chart) | "held" | "replay", at (-1: the latest), from, to (the window)}
function tcardTimeShown(TP, group) {
    const g = group !== undefined ? TP.view.groups[group] : undefined;
    if (!g) return { group, mode: "live", at: -1, from: -Infinity, to: Infinity };
    const live = !g.mode || g.mode === "live";
    const at = g.cursorTimestamp >= 0 ? g.cursorTimestamp : -1;
    let from = -Infinity, to = Infinity;
    if (g.cursorActive && g.timestampTo > g.timestampFrom) { from = g.timestampFrom; to = g.timestampTo; }
    else if (g.span > 0) { const time = TP.view.timeOf(group); if (time.to >= 0) { from = time.from; to = time.to; } }
    return { group, mode: live ? (at >= 0 ? "pointer" : "live") : g.mode, at, from, to };
}

// ---------------------------------------------------------------------------------------------------------- words and numbers

function tcardNumber(v) {
    if (typeof v !== "number") return String(v);
    if (!Number.isFinite(v)) return String(v);
    if (Number.isInteger(v)) return String(v);
    const abs = Math.abs(v);
    return String(abs >= 1e6 || abs < 1e-4 ? Number(v.toPrecision(4)) : Number(v.toFixed(abs >= 100 ? 2 : abs >= 1 ? 3 : 4)));
}
function tcardTwo(n) { return String(n).padStart(2, "0"); }
// An instant: "07:22:22.24" (local time), or the time of a device that counts from its start (before 2001): "0:12:30.10"
function tcardClock(t, decimals = 1) {
    if (!(t >= 0) || !Number.isFinite(t)) return "–";
    const frac = (s) => decimals > 0 ? (s % 1).toFixed(decimals).slice(1) : "";
    if (t < 978307200) return Math.floor(t / 3600) + ":" + tcardTwo(Math.floor(t % 3600 / 60)) + ":" + tcardTwo(Math.floor(t % 60)) + frac(t);
    const date = new Date(Math.floor(t * 1000));
    return tcardTwo(date.getHours()) + ":" + tcardTwo(date.getMinutes()) + ":" + tcardTwo(date.getSeconds()) + frac(t);
}
function tcardDuration(seconds) { return seconds > 0 && seconds < 60 ? Number(seconds.toPrecision(seconds < 1 ? 2 : 3)) + " s" : exportFormatDuration(seconds); } // (under a minute: 8.17 s, 0.25 s)
function tcardBytes(bytes) { return exportFormatBytes(bytes); }
function tcardCount(n) { return n < 1e5 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : exportFormatCount(n); }
// How often: "every 33 ms (30 Hz)", "every 5.6 s"
function tcardEvery(interval) {
    if (!(interval > 0)) return "";
    const every = interval < 1 ? Math.round(interval * 1000 * 10) / 10 + " ms" : tcardNumber(Number(interval.toPrecision(3))) + " s";
    const hz = 1 / interval;
    return "every " + every + (hz >= 1 ? " (" + (hz >= 100 ? Math.round(hz) : Number(hz.toPrecision(3))) + " Hz)" : "");
}
const TCARD_PICTURES = ["JPEG", "PNG", "Raw values"];

// A sample of a data type as words: "1.091, −0.363, 0.715", "w 0.999 · x 0 · y 0 · z 0.036"...
function tcardSample(P, type, values) {
    type = Number(type);
    const n = (v) => tcardNumber(v);
    switch (type) {
        case P.SECTION_TYPE_TELEM_DATA_TEXT: case P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT: case P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR: return String(values[0]);
        case P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION: return "w " + n(values[0]) + " · x " + n(values[1]) + " · y " + n(values[2]) + " · z " + n(values[3]);
        case P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION: return "roll " + n(values[0]) + " · pitch " + n(values[1]) + " · yaw " + n(values[2]) + " rad";
        case P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB: return "rgb(" + values.slice(0, 3).map(n).join(", ") + ")";
        case P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS: return n(values[0]) + " × " + n(values[1]) + " · fx " + n(values[2]) + " · fy " + n(values[3]) + " · cx " + n(values[4]) + " · cy " + n(values[5]);
        case P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION: return ["k1", "k2", "p1", "p2", "k3"].map((k, i) => k + " " + n(values[i])).join(" · ");
        case P.SECTION_TYPE_TELEM_DATA_IMAGE: return (TCARD_PICTURES[values[0]] || "Picture") + (typeof values[1] === "string" ? " · " + tcardBytes(Math.round(values[1].length * 0.75)) : "");
        case P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD: return (values[0] ? tcardCount(values[0].length / 3) : 0) + " points" + (values[1] ? ", intensity" : "") + (values[2] ? ", colors" : "");
        case P.SECTION_TYPE_TELEM_DATA_THRESHOLD: return (values[2] || "") + " " + (values[0] === P.THRESHOLD_BELOW ? "<" : ">") + " " + n(values[1]);
        case P.SECTION_TYPE_TELEM_DATA_ENUM: case P.SECTION_TYPE_TELEM_DATA_EDGES: return tcardCount(String(values[0]).split("\n").filter(Boolean).length) + " items";
    }
    return values.map((v) => typeof v === "number" ? n(v) : String(v)).join(", ");
}

// The color a sample shows, for a swatch (shapes)
function tcardSwatch(P, type, values) {
    if (Number(type) === P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR) return String(values[0]);
    if (Number(type) === P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB) return "rgb(" + values.slice(0, 3).join(",") + ")";
    return "";
}

// ---------------------------------------------------------------------------------------------------------- the blocks

// The value at the time shown: {at, sampleAt, big, unit, since, note, rows: [{k, v, swatch}], picture: {type, base64}}
function tcardValueAt(TP, telem, time) {
    const P = TP.protocol, main = tcardMainType(P, telem), out = { rows: [] };
    const unit = telem.getAttribute(P.TELEM_ATTR_UNIT) || "";
    const content = tcardTypes(telem).filter((t) => !P.isMetaDataType(t));
    let first = Infinity;
    for (const type of content) {
        const entry = telem.data[type], i = tcardIndexAt(entry.timestamps, time.at);
        first = Math.min(first, entry.timestamps[0]);
        if (i < 0) continue;
        const values = entry.data.map((channel) => channel[i]), t = entry.timestamps[i];
        if (type === main) {
            out.sampleAt = t;
            if (type === P.SECTION_TYPE_TELEM_DATA_NUMBER) { out.big = tcardNumber(values[0]); out.unit = unit; }
            else if (type === P.SECTION_TYPE_TELEM_DATA_NUMBER_2D || type === P.SECTION_TYPE_TELEM_DATA_NUMBER_3D) { out.big = tcardSample(P, type, values); out.unit = unit; }
            else if (type === P.SECTION_TYPE_TELEM_DATA_TEXT) {
                const text = String(values[0]);
                if (telem.getAttribute(P.TELEM_ATTR_STACK) === true) { out.big = text === "" ? "" : text.split(",").map((path) => path.split("/").join(" › ")).join("\n"); out.note = text === "" ? "nothing runs" : ""; }
                else { out.big = text; if (text === "") out.note = "empty text (nothing)"; }
                if (telem.getAttribute(P.TELEM_ATTR_LOG) !== true) { // A state: since when
                    let k = i;
                    while (k > 0 && entry.data[0][k - 1] === values[0] && i - k < 200000) k--;
                    out.since = entry.timestamps[k];
                }
            }
            else if (type === P.SECTION_TYPE_TELEM_DATA_IMAGE) { out.picture = { type: values[0], base64: values[1] }; out.rows.push({ k: "Picture", v: tcardSample(P, type, values) }); }
            else out.rows.push({ k: tcardTypeLabel(P, type), v: tcardSample(P, type, values) });
            continue;
        }
        out.rows.push({ k: tcardTypeLabel(P, type), v: tcardSample(P, type, values), swatch: tcardSwatch(P, type, values) });
    }
    if (out.sampleAt === undefined && !out.rows.length) out.note = content.length ? "No sample yet: the first came at " + tcardClock(first) : "No data yet";
    return out;
}

// Statistics of a data entry over a window, cached per entry (worked out again when its samples or the window change)
const _tcardStatsCache = new WeakMap();
function tcardEntryStats(P, telem, type, from, to) {
    const entry = telem.data[type];
    const key = entry.timestamps.length + ":" + (entry.pruned || 0) + ":" + (entry.lateInsertions || 0) + ":" + from + ":" + to + ":" + (telem.getAttribute(P.TELEM_ATTR_STACK) === true);
    const cached = _tcardStatsCache.get(entry);
    if (cached && cached.key === key) return cached.stats;
    const ts = entry.timestamps, [i0, i1] = tcardSlice(ts, from, to), count = i1 - i0;
    const stats = { count, from: count ? ts[i0] : undefined, to: count ? ts[i1 - 1] : undefined };
    if (count >= 2) {
        let gap = 0, gapAt = 0;
        for (let i = i0 + 1; i < i1; i++) { const d = ts[i] - ts[i - 1]; if (d > gap) { gap = d; gapAt = ts[i - 1]; } }
        const step = Math.max(1, Math.floor((count - 1) / 4000)), intervals = [];
        for (let i = i0 + 1; i < i1; i += step) intervals.push(ts[i] - ts[i - 1]);
        intervals.sort((a, b) => a - b);
        stats.interval = intervals[intervals.length >> 1];
        stats.gap = gap; stats.gapAt = gapAt;
    }
    const channels = entry.data;
    if (count && type === P.SECTION_TYPE_TELEM_DATA_NUMBER) {
        const v = channels[0];
        let min = Infinity, max = -Infinity, sum = 0, finite = 0, changes = 0, step = Infinity;
        for (let i = i0; i < i1; i++) {
            const x = v[i];
            if (i > i0 && x !== v[i - 1]) { changes++; const d = Math.abs(x - v[i - 1]); if (d > 0 && d < step) step = d; }
            if (!Number.isFinite(x)) continue;
            finite++; sum += x; if (x < min) min = x; if (x > max) max = x;
        }
        Object.assign(stats, { min: finite ? min : undefined, max: finite ? max : undefined, mean: finite ? sum / finite : undefined, changes, step: Number.isFinite(step) ? step : undefined });
    }
    else if (count && (type === P.SECTION_TYPE_TELEM_DATA_NUMBER_2D || type === P.SECTION_TYPE_TELEM_DATA_NUMBER_3D || type === P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION)) {
        stats.box = channels.map((c) => { let lo = Infinity, hi = -Infinity; for (let i = i0; i < i1; i++) { if (c[i] < lo) lo = c[i]; if (c[i] > hi) hi = c[i]; } return [lo, hi]; });
    }
    else if (count && type === P.SECTION_TYPE_TELEM_DATA_TEXT) {
        const v = channels[0], counts = new Map();
        let changes = 0, deepest = 0, empty = 0;
        const stack = telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        for (let i = i0; i < i1; i++) {
            const x = v[i];
            counts.set(x, (counts.get(x) || 0) + 1);
            if (i > i0 && x !== v[i - 1]) changes++;
            if (x === "") empty++;
        }
        if (stack) for (const text of counts.keys()) for (const path of String(text).split(",")) if (path) deepest = Math.max(deepest, path.split("/").length);
        stats.distinct = counts.size;
        stats.changes = changes;
        stats.empty = empty;
        stats.deepest = deepest;
        stats.top = [...counts.entries()].filter(([text]) => text !== "").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([text, n]) => ({ text: String(text), share: n / count }));
    }
    else if (count && type === P.SECTION_TYPE_TELEM_DATA_IMAGE) {
        const kinds = new Set(), step = Math.max(1, Math.floor(count / 200));
        let bytes = 0, seen = 0;
        for (let i = i0; i < i1; i += step) { kinds.add(TCARD_PICTURES[channels[0][i]] || "Picture"); if (typeof channels[1][i] === "string") { bytes += channels[1][i].length * 0.75; seen++; } }
        stats.formats = [...kinds];
        stats.weight = seen ? bytes / seen : undefined;
    }
    else if (count && type === P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD) {
        let min = Infinity, max = 0, sum = 0;
        for (let i = i0; i < i1; i++) { const n = channels[0][i] ? channels[0][i].length / 3 : 0; sum += n; if (n < min) min = n; if (n > max) max = n; }
        Object.assign(stats, { pointsMin: min, pointsMax: max, pointsMean: sum / count });
    }
    _tcardStatsCache.set(entry, { key, stats });
    return stats;
}

// Values: the statistics of the main data type in the window of the time shown. {rows, summary}
function tcardValues(TP, telem, time) {
    const P = TP.protocol, main = tcardMainType(P, telem), rows = [];
    if (main === undefined) return { rows, summary: "" };
    const unit = telem.getAttribute(P.TELEM_ATTR_UNIT) || "", u = unit ? " " + unit : "";
    const s = tcardEntryStats(P, telem, main, time.from, time.to);
    const whole = time.from === -Infinity && time.to === Infinity;
    rows.push({ k: "Window", v: whole ? "all the data kept" : tcardClock(time.from) + " → " + tcardClock(time.to) });
    rows.push({ k: "Samples", v: tcardCount(s.count) + (s.count ? " · " + tcardClock(s.from) + " → " + tcardClock(s.to) : "") });
    if (s.interval !== undefined) {
        rows.push({ k: "Rate", v: tcardEvery(s.interval) });
        if (s.gap > Math.max(3 * s.interval, 0.1)) rows.push({ k: "Longest gap", v: tcardDuration(s.gap) + " at " + tcardClock(s.gapAt) });
    }
    let summary = tcardCount(s.count) + " samples";
    if (s.min !== undefined) {
        rows.push({ k: "Min · max", v: tcardNumber(s.min) + " · " + tcardNumber(s.max) + u });
        rows.push({ k: "Mean", v: tcardNumber(s.mean) + u });
        rows.push({ k: "Changes", v: tcardCount(s.changes) + (s.count > 1 ? " of " + tcardCount(s.count - 1) : "") });
        if (s.step !== undefined && (s.max - s.min) / s.step <= 1e5) rows.push({ k: "Step", v: tcardNumber(s.step) + u + " (smallest change)" });
        summary = tcardNumber(s.min) + " → " + tcardNumber(s.max) + u + " · mean " + tcardNumber(s.mean);
    }
    if (s.box) {
        const axes = main === P.SECTION_TYPE_TELEM_DATA_NUMBER_2D ? ["x", "y"] : ["x", "y", "z"];
        s.box.slice(0, axes.length).forEach(([lo, hi], i) => rows.push({ k: axes[i], v: tcardNumber(lo) + " → " + tcardNumber(hi) + u }));
        summary = axes.map((a, i) => a + " " + tcardNumber(s.box[i][0]) + "→" + tcardNumber(s.box[i][1])).join(" · ");
    }
    if (s.distinct !== undefined) {
        const stack = telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        rows.push({ k: stack ? "Paths" : "Different", v: tcardCount(s.distinct) + (stack ? " different" : " texts") + " · " + tcardCount(s.changes) + " changes" });
        if (stack && s.deepest) rows.push({ k: "Deepest", v: s.deepest + (s.deepest > 1 ? " levels" : " level") });
        if (s.empty) rows.push({ k: stack ? "Nothing runs" : "Empty", v: Math.round(100 * s.empty / s.count) + " % of the samples" });
        if (s.top.length) rows.push({ k: "Most frequent", v: s.top.map((x) => (x.text.length > 40 ? x.text.slice(0, 39) + "…" : x.text) + " " + Math.round(100 * x.share) + " %").join(" · ") });
        summary = tcardCount(s.distinct) + " different · " + tcardCount(s.changes) + " changes";
    }
    if (s.formats) { rows.push({ k: "Pictures", v: s.formats.join(", ") + (s.weight ? ", " + tcardBytes(Math.round(s.weight)) + " on average" : "") }); summary = tcardCount(s.count) + " pictures"; }
    if (s.pointsMean !== undefined) { rows.push({ k: "Points", v: tcardCount(s.pointsMin) + " → " + tcardCount(s.pointsMax) + " per cloud, " + tcardCount(Math.round(s.pointsMean)) + " on average" }); }
    return { rows, summary };
}

// Kept: what is stored, all the time it covers. {rows, summary}
function tcardKept(TP, telem) {
    const P = TP.protocol, content = tcardTypes(telem).filter((t) => !P.isMetaDataType(t));
    let samples = 0, from = Infinity, to = -Infinity, gaps = 0, missing = 0;
    for (const t of content) {
        const entry = telem.data[t];
        samples += entry.timestamps.length;
        from = Math.min(from, entry.timestamps[0]); to = Math.max(to, entry.timestamps[entry.timestamps.length - 1]);
        for (const g of telem.constructor.gapsOf(entry)) { gaps++; if (Number.isFinite(g.to)) missing += g.to - g.from; }
    }
    const memory = telem.getMemoryUsage().bytes;
    const rows = [
        { k: "Samples", v: tcardCount(samples) + (content.length > 1 ? " in " + content.length + " kinds" : "") },
        { k: "Time", v: samples ? tcardClock(from) + " → " + tcardClock(to) + " · " + tcardDuration(to - from) : "–" },
        { k: "Not received", v: gaps ? gaps + (gaps > 1 ? " holes" : " hole") + (missing > 0 ? ", " + tcardDuration(missing) : "") : "none", dim: !gaps },
        { k: "Memory", v: tcardBytes(memory) },
    ];
    return { rows, summary: tcardCount(samples) + " · " + (samples ? tcardDuration(to - from) : "–") + " · " + tcardBytes(memory), from, to };
}

// Data received: a row per data type with its count (all it kept) and its strip over the window of the time shown, or all the time kept
// without a window (pieces where samples came, a tick per sample when there are few), and where the time shown is. {rows: [{label, count, pieces: [[a, b]], ticks: [f], mark}], summary}
const _tcardStripCache = new WeakMap();
function tcardStrip(entry, from, to) {
    const key = entry.timestamps.length + ":" + (entry.pruned || 0) + ":" + from + ":" + to;
    const cached = _tcardStripCache.get(entry);
    if (cached && cached.key === key) return cached.strip;
    const ts = entry.timestamps, span = to - from, [i0, i1] = tcardSlice(ts, from, to), n = i1 - i0;
    const at = (t) => span > 0 ? Math.min(1, Math.max(0, (t - from) / span)) : 1;
    const strip = { pieces: [], ticks: [] };
    if (n < TCARD_TICKS) for (let i = i0; i < i1; i++) strip.ticks.push(at(ts[i]));
    else {
        // A gap is an interval much longer than usual (and longer than half a percent of the strip): the longest ones cut it
        const step = Math.max(1, Math.floor((n - 1) / 4000)), intervals = [];
        for (let i = i0 + 1; i < i1; i += step) intervals.push(ts[i] - ts[i - 1]);
        intervals.sort((a, b) => a - b);
        const limit = Math.max(5 * intervals[intervals.length >> 1], 0.005 * span);
        let cuts = [];
        for (let i = i0 + 1; i < i1; i++) if (ts[i] - ts[i - 1] > limit) cuts.push(i);
        if (cuts.length > TCARD_SEGMENTS) cuts = cuts.sort((a, b) => (ts[b] - ts[b - 1]) - (ts[a] - ts[a - 1])).slice(0, TCARD_SEGMENTS).sort((a, b) => a - b);
        let start = i0;
        for (const cut of cuts) { strip.pieces.push([at(ts[start]), at(ts[cut - 1])]); start = cut; }
        strip.pieces.push([at(ts[start]), at(ts[i1 - 1])]);
    }
    _tcardStripCache.set(entry, { key, strip });
    return strip;
}
// What the strips span: the window of the time shown (what its charts show), else all the time kept
function tcardSpan(time, kept) {
    return Number.isFinite(time.from) && Number.isFinite(time.to) && time.to > time.from ? { from: time.from, to: time.to } : { from: kept.from, to: kept.to };
}
// Where the time shown is on the strips (a share of their span), undefined when live or outside it
function tcardMark(time, kept) {
    const { from, to } = tcardSpan(time, kept);
    return time.at >= 0 && to > from && time.at >= from && time.at <= to ? (time.at - from) / (to - from) : undefined;
}
function tcardData(TP, telem, time, kept) {
    const P = TP.protocol, rows = [];
    const { from, to } = tcardSpan(time, kept), mark = tcardMark(time, kept);
    for (const type of tcardTypes(telem)) {
        const entry = telem.data[type];
        const strip = P.isMetaDataType(type) ? { pieces: [], ticks: entry.timestamps.filter((t) => t >= from && t <= to).slice(0, TCARD_TICKS).map((t) => to > from ? (t - from) / (to - from) : 1) } : tcardStrip(entry, from, to);
        rows.push({ type, label: tcardTypeLabel(P, type), count: tcardCount(entry.timestamps.length), pieces: strip.pieces, ticks: strip.ticks, mark });
    }
    return { rows, summary: rows.map((r) => r.label + " " + r.count).join(" · ") };
}

const TCARD_SHAPES = ["cube", "sphere", "cylinder", "rect", "circle", "line", "polygon", "arrow", "text", "", "model"];
// Attributes, in the words of the protocol: {rows: [{k, v}], notSet: [words], summary}
function tcardAttributes(TP, telem, time) {
    const P = TP.protocol, a = (code) => telem.getAttribute(code), rows = [];
    const add = (k, v) => rows.push({ k, v: String(v) });
    if (a(P.TELEM_ATTR_UNIT)) add("unit", a(P.TELEM_ATTR_UNIT));
    if (a(P.TELEM_ATTR_VIEW_LABEL)) add("label", a(P.TELEM_ATTR_VIEW_LABEL));
    if (a(P.TELEM_ATTR_DESC)) add("desc", a(P.TELEM_ATTR_DESC));
    if (a(P.TELEM_ATTR_COLOR)) add("color", a(P.TELEM_ATTR_COLOR));
    const range = a(P.TELEM_ATTR_RANGE);
    if (range && (range.min !== undefined || range.max !== undefined)) add("min · max", (range.min !== undefined ? tcardNumber(range.min) : "–") + " · " + (range.max !== undefined ? tcardNumber(range.max) : "–"));
    if (telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD]) {
        const limits = telem.getThresholds(time.at);
        add("thresholds", limits.length ? limits.map((th) => (th.name || "") + " " + (th.operator === P.THRESHOLD_BELOW ? "<" : ">") + " " + tcardNumber(th.value)).join(" · ") : "none in force");
    }
    if (a(P.TELEM_ATTR_LOG) === true) add("log", "yes: lines to read one after the other");
    if (a(P.TELEM_ATTR_STACK) === true) add("stack", "yes: “/” between levels");
    if (a(P.TELEM_ATTR_MOMENT) === true) add("mom", "yes: moments");
    const shape = a(P.TELEM_ATTR_SHAPE);
    if (shape) add("shape", (TCARD_SHAPES[shape.type] || "type " + shape.type) + (shape.data ? " · " + shape.data : ""));
    const frame = a(P.TELEM_ATTR_FRAME);
    if (frame) add("frame", (frame.type === P.FRAME_TYPE_PIXELS ? "pixels of " : "pose of ") + frame.name);
    const pixels = a(P.TELEM_ATTR_PIXELS);
    if (pixels) add("scale · nodata", tcardNumber(pixels.scale) + " · " + (pixels.invalid === null || pixels.invalid === undefined ? "none" : tcardNumber(pixels.invalid)) + (pixels.depth === false ? " · not a depth map" : " · depth map"));
    const write = a(P.TELEM_ATTR_WRITE);
    if (write) {
        const parts = [write.kind === "action" ? "action" : "setting" + (write.type ? " " + write.type : "")];
        for (const k of ["step", "rate", "hold", "axes"]) if (write[k] !== undefined && write[k] !== "") parts.push(k + " " + write[k]);
        if (write.confirm) parts.push("confirm");
        if (write.longpress) parts.push("long press");
        add(write.kind === "action" ? "action" : "write", parts.join(" · "));
    }
    if (a(P.TELEM_ATTR_TITLE)) add("title", a(P.TELEM_ATTR_TITLE));
    const args = a(P.TELEM_ATTR_ARGS);
    if (args && args.length) add("args", args.map((arg) => arg.name + (arg.type ? ": " + arg.type : "") + (arg.optional ? "?" : "")).join(", "));
    if (a(P.TELEM_ATTR_AUTOPLOT) === false) add("autoplot", "off (np)");
    if (a(P.TELEM_ATTR_DATA_TIMEOUT) !== undefined) add("timeout", tcardDuration(a(P.TELEM_ATTR_DATA_TIMEOUT)));
    const enumEntry = telem.data[P.SECTION_TYPE_TELEM_DATA_ENUM], edgesEntry = telem.data[P.SECTION_TYPE_TELEM_DATA_EDGES];
    if (enumEntry && enumEntry.timestamps.length) { const s = telem.getEnum(time.at); if (s) add("enum", tcardCount(s.items.length) + " items"); }
    if (edgesEntry && edgesEntry.timestamps.length) { const s = telem.getEdges(time.at); if (s) add("edges", tcardCount(s.edges.length) + " transitions"); }
    // Not set: what is worth knowing it could have
    const numeric = !!(telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER] || telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_2D] || telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_3D]);
    const notSet = [];
    if (!a(P.TELEM_ATTR_DESC)) notSet.push("desc");
    if (!a(P.TELEM_ATTR_VIEW_LABEL)) notSet.push("label");
    if (numeric && !a(P.TELEM_ATTR_UNIT)) notSet.push("unit");
    if (telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER] && !(range && (range.min !== undefined || range.max !== undefined))) notSet.push("min / max");
    if (telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER] && !telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD]) notSet.push("thresholds");
    return { rows, notSet, summary: rows.length ? rows.map((r) => r.k + " " + r.v).join(" · ") : "none" };
}

// Source: who sent it and how the page knows it. {rows: [{k, v, warn}], summary}
function tcardSource(TP, telem) {
    const P = TP.protocol, rows = [];
    const client = telem.clientId >= 0 ? TP.clients.getClient(telem.clientId) : undefined;
    const byName = !(telem.clientId >= 0) || telem.clientId === P.CLIENT_ID_NAMED;
    if (client && client.name) rows.push({ k: "Client", v: client.name });
    rows.push({ k: "Known by", v: byName ? "its name (text)" : "client " + telem.clientId + ", id " + telem.id + " (binary)" });
    const connection = TP.commands.connectionOf(telem);
    let way = "";
    if (connection) {
        const sender = connection.senders && telem.endpoint !== undefined ? connection.senders[telem.endpoint] : undefined;
        way = (connection.name || connection.type) + (sender ? " · " + sender : "");
    }
    else way = telem.sourceId === undefined ? "a file" : "a source that is gone";
    rows.push({ k: "Came from", v: way });
    const name = telem.getName(), same = Object.values(TP.datastore.telemetries).filter((other) => other !== telem && other.getName() === name);
    if (same.length) rows.push({ k: "Same name", v: same.length + " other " + (same.length > 1 ? "telemetries are" : "telemetry is") + " named " + name + " (" + same.map((o) => o.clientId >= 0 && o.clientId !== P.CLIENT_ID_NAMED ? "client " + o.clientId : "text").join(", ") + ")", warn: true });
    return { rows, summary: rows.filter((r) => !r.warn).map((r) => r.v).join(" · "), warn: same.length > 0 };
}

// Shown in: the views of the dashboards that list it. {links: [{dashboard, viewId, text}], summary}
function tcardShownIn(TP, telem) {
    const links = [], name = telem.getName();
    for (const dashboard of Object.values(TP.dashboards.dashboards)) {
        const walk = (view) => {
            if (!view) return;
            if (Array.isArray(view.views)) { for (const child of view.views) walk(child); return; }
            const list = view.telemetryIdOrNameList;
            if (!Array.isArray(list) || !list.some((x) => x === telem.id || x === String(telem.id) || x === name)) return;
            const title = view.options && view.options.title ? String(view.options.title) : (view.name || "view");
            links.push({ dashboard: dashboard.name, viewId: view.id, text: dashboard.name + " › " + title });
        };
        walk(dashboard.getView());
    }
    return { links, summary: links.length ? (links.length === 1 ? links[0].text : links.length + " views") : "no view" };
}

// Commands: what the page asked a setting or an action. {rows} or undefined
function tcardCommands(TP, telem) {
    const declaration = TP.commands.declaration(telem);
    if (!declaration) return undefined;
    const rows = [];
    if (declaration.kind === "action") {
        const calls = TP.commands.calls(telem), last = calls[calls.length - 1];
        rows.push({ k: "Calls", v: calls.length ? tcardCount(calls.length) : "none yet" });
        if (last) rows.push({ k: "Last", v: "#" + last.id + " " + ({ ok: "done", err: "failed", run: "running", sent: "sent", noanswer: "no answer" }[last.status] || last.status) + (last.text ? ": " + last.text : "") });
    }
    else {
        const history = TP.commands.history(telem), request = TP.commands.request(telem);
        rows.push({ k: "Requests", v: history.length ? tcardCount(history.length) + " from this page" : "none from this page" });
        const last = request || history[history.length - 1];
        if (last) rows.push({ k: "Last", v: TP.commands.formatValue(last.type, last.target) + " · " + last.status + (last.reason ? ": " + last.reason : "") });
    }
    return { rows, summary: rows.map((r) => r.v).join(" · ") };
}

// Everything a card shows, for a telemetry at a time (stats: worked out again only when asked)
function tcardModel(TP, telem, time, previous, now = Date.now()) {
    const P = TP.protocol;
    const model = {
        id: telem.id, name: telem.getName(), label: telem.getAttribute(P.TELEM_ATTR_VIEW_LABEL) || "", desc: telem.getDescription() || "",
        time, value: tcardValueAt(TP, telem, time),
    };
    // Live, the window slides with every sample: the statistics follow once per second. Held, a window that changes is a new question.
    const windowKey = time.mode + ":" + (time.mode === "live" || time.mode === "pointer" ? (Number.isFinite(time.from) ? "span" : "") : time.from + ":" + time.to);
    const fresh = !previous || now - previous.statsAt >= TCARD_STATS_MS || previous.windowKey !== windowKey;
    if (fresh) {
        model.statsAt = now;
        model.windowKey = windowKey;
        model.values = tcardValues(TP, telem, time);
        model.kept = tcardKept(TP, telem);
        model.commands = tcardCommands(TP, telem);
        model.source = tcardSource(TP, telem);
        model.shownIn = tcardShownIn(TP, telem);
        model.data = tcardData(TP, telem, time, model.kept);
    }
    else {
        for (const k of ["statsAt", "windowKey", "values", "kept", "commands", "source", "shownIn"]) model[k] = previous[k];
        const mark = tcardMark(time, model.kept); // (the strips stay, the time shown moves on them)
        model.data = { rows: previous.data.rows.map((row) => Object.assign({}, row, { mark })), summary: previous.data.summary };
    }
    model.attributes = tcardAttributes(TP, telem, time);
    return model;
}

// The heading of the value block: "Live · 07:29:31.6", "At 07:25:00.0 · held"
function tcardTimeTitle(time, value) {
    if (time.mode === "live") return { title: "Live", tag: value.sampleAt !== undefined ? tcardClock(value.sampleAt) : "" };
    return { title: "At " + tcardClock(time.at), tag: { pointer: "pointer", held: "held", replay: "replay" }[time.mode] || time.mode };
}

// ---------------------------------------------------------------------------------------------------------- opening, pinning

// Where a card opens: to the right of the panel of a tile, at the height of the tile when there is room, kept in the window
function tcardPlace(element, width = 330) {
    const rect = element.getBoundingClientRect(), panel = element.closest && element.closest(".dock");
    const right = panel ? panel.getBoundingClientRect().right : rect.right;
    // (a whole card is tall: one low in the panel opens higher, to keep about 32 rem of room under its top)
    const x = Math.min(right + 8, window.innerWidth - width - 8), y = Math.max(8, Math.min(rect.top, window.innerHeight - 32 * parseFloat(getComputedStyle(document.documentElement).fontSize)));
    return { x: Math.max(8, x), y };
}
let _tcardPeekTimer = 0, _tcardLeaveTimer = 0, _tcardDragging = false;
function tcardHoverStart(id, element) {
    if (_tcardDragging) return;
    clearTimeout(_tcardLeaveTimer);
    clearTimeout(_tcardPeekTimer);
    if (tcardState.peek && tcardState.peek.id === id) return;
    _tcardPeekTimer = setTimeout(() => {
        if (tcardState.pinned.some((card) => card.id === id)) { tcardState.peek = null; return; }
        tcardState.peek = Object.assign({ id }, tcardPlace(element));
    }, tcardState.peek ? 150 : TCARD_PEEK_MS); // (from one tile to the next, quickly)
}
function tcardHoverEnd() {
    clearTimeout(_tcardPeekTimer);
    clearTimeout(_tcardLeaveTimer);
    _tcardLeaveTimer = setTimeout(() => { tcardState.peek = null; }, TCARD_LEAVE_MS);
}
function tcardKeepPeek() { clearTimeout(_tcardLeaveTimer); }
// A tile is being dragged: the card not pinned goes at once, and none opens until the drag ends
function tcardDragStarted() {
    clearTimeout(_tcardPeekTimer);
    clearTimeout(_tcardLeaveTimer);
    tcardState.peek = null;
    if (_tcardDragging) return;
    _tcardDragging = true;
    const end = () => { _tcardDragging = false; window.removeEventListener("dragend", end, true); window.removeEventListener("drop", end, true); window.removeEventListener("pointerup", end, true); window.removeEventListener("touchend", end, true); };
    window.addEventListener("dragend", end, true);
    window.addEventListener("drop", end, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("touchend", end, true);
}
// Shows the card of a telemetry at once (a tap: there is no hover), or brings its pinned card forward
function tcardShow(id, element) {
    clearTimeout(_tcardPeekTimer);
    clearTimeout(_tcardLeaveTimer);
    const pinned = tcardState.pinned.find((card) => card.id === id);
    if (pinned) { pinned.z = ++tcardState.z; tcardState.sheetIndex = tcardState.pinned.indexOf(pinned); tcardState.peek = null; return; }
    tcardState.peek = Object.assign({ id }, tcardPlace(element));
}
// Pins the card of a telemetry (where its card is shown, else next to the element), or brings its pinned card to the front (the Pin button)
function tcardPin(id, element) {
    clearTimeout(_tcardPeekTimer);
    const place = tcardState.peek && tcardState.peek.id === id ? { x: tcardState.peek.x, y: tcardState.peek.y } : (element ? tcardPlace(element) : { x: 120, y: 120 });
    _tcardPinWindow("telemetry", id, place);
    tcardState.peek = null;
}
// Pins the list of the legend of a view (TELEPLOT.view.pinLegend): a window where the list was (rect), or its window to the front
function tcardPinLegend(viewId, rect) {
    const width = 330, room = typeof window !== "undefined" ? window.innerWidth : 1280;
    const place = rect ? { x: Math.max(8, Math.min(rect.left, room - width - 8)), y: Math.max(8, rect.top) } : { x: 120, y: 120 };
    _tcardPinWindow("legend", viewId, place);
}
function _tcardPinWindow(kind, id, place) {
    const existing = tcardState.pinned.find((card) => card.kind === kind && card.id === id);
    if (existing) { existing.z = ++tcardState.z; tcardState.sheetIndex = tcardState.pinned.indexOf(existing); return; }
    while (tcardState.pinned.some((card) => Math.abs(card.x - place.x) < 8 && Math.abs(card.y - place.y) < 8)) place = { x: place.x + 24, y: place.y + 24 }; // (cascade)
    tcardState.pinned.push({ key: tcardState.nextKey++, kind, id, x: place.x, y: place.y, z: ++tcardState.z });
    tcardState.sheetIndex = tcardState.pinned.length - 1;
}
function tcardUnpin(key) {
    const i = tcardState.pinned.findIndex((card) => card.key === key);
    if (i >= 0) tcardState.pinned.splice(i, 1);
    tcardState.sheetIndex = Math.min(tcardState.sheetIndex, Math.max(0, tcardState.pinned.length - 1));
}
function tcardUnpinAll() { tcardState.pinned.splice(0); tcardState.sheetIndex = 0; }
function tcardIsPinned(id) { return tcardState.pinned.some((card) => card.kind === "telemetry" && card.id === id); }

// What the window of a legend says: {kind: "legend", name, badge, sub, isChart, onScreen, rows (a scene's: {id, name, unit, value,
// color, hidden, tip})}. The name is the title of the view, else its kind; sub is its dashboard.
const TCARD_VIEW_KINDS = { chart: "Chart", "3d": "3D view", "2d": "2D view", image: "Image view" };
function tcardLegendModel(TP, view) {
    let dashboard = "";
    for (const d of Object.values(TP.dashboards.dashboards)) {
        const has = (v) => v && (v.id === view.id || (Array.isArray(v.views) && v.views.some(has)));
        if (has(d.getView())) { dashboard = d.name; break; }
    }
    const kind = TCARD_VIEW_KINDS[view.name] || "View";
    const model = { kind: "legend", name: view.options && view.options.title ? String(view.options.title) : kind, badge: (view.name || "view").toUpperCase(), sub: dashboard ? dashboard + " · " + kind : kind,
        isChart: view.name === "chart", onScreen: typeof document !== "undefined" && !!document.getElementById(view.divId), rows: [], types: [] };
    if (!model.isChart && view.state && Array.isArray(view.state.legend))
        model.rows = view.state.legend.map((item) => ({ id: item.id, name: item.name, unit: item.unit || "", value: item.value || "", color: item.color, hidden: !!(view.hidden && view.hidden[item.id]), tip: item.tip || "" }));
    return model;
}

// Follows the pointer from a press (moving or resizing a window) until it is released. Listened to on the window, not on the handle:
// a release that reaches something else (a lost capture, a drag the browser started) must end it too, else moving over the handle later
// would go on moving or resizing without any button pressed. A move without a button pressed ends it as well.
function tcardFollowPointer(event, onMove) {
    const handle = event.currentTarget;
    try { handle.setPointerCapture(event.pointerId); } catch (e) {}
    event.preventDefault();
    document.documentElement.classList.add("tcard-moving");
    const move = (e) => { if (e.pointerType === "mouse" && e.buttons === 0) { end(); return; } onMove(e); };
    const end = () => {
        window.removeEventListener("pointermove", move, true);
        for (const type of ["pointerup", "pointercancel", "dragstart", "blur"]) window.removeEventListener(type, end, true);
        document.documentElement.classList.remove("tcard-moving");
    };
    window.addEventListener("pointermove", move, true);
    for (const type of ["pointerup", "pointercancel", "dragstart", "blur"]) window.addEventListener(type, end, true);
}

// ---------------------------------------------------------------------------------------------------------- component

function initComponent_telemetry_cards(vue) {
    const name = "telemetry-cards";
    const vueHTML = `
        <div class="tcards">
            <template v-if="!sheet">
                <div v-for="card in shownCards" :key="card.key" class="tcard teleplot-tcard"
                    :style="{left: card.x + 'px', top: card.y + 'px', zIndex: card.rank, maxHeight: 'max(12rem, calc(100vh - ' + (card.y + 8) + 'px))', height: card.h ? card.h + 'px' : null, width: card.w ? card.w + 'px' : null}"
                    @pointerdown="front(card)" @mouseenter="card.peek && keepPeek()" @mouseleave="card.peek && leavePeek()">
                    <template v-if="models[card.key]">
                        <div class="tcard-bar" :class="{'tcard-grab': !card.peek}" @pointerdown="drag($event, card)">
                            <span v-if="!card.peek" class="tcard-grip" aria-hidden="true">⠿</span>
                            <span v-for="t in models[card.key].types" :key="t" class="telemetries-badge" :class="'telemetries-type-'+t">{{badge(t)}}</span>
                            <span v-if="models[card.key].badge" class="telemetries-badge telemetries-type-other">{{models[card.key].badge}}</span>
                            <span class="tcard-name" :title="card.kind == 'legend' ? models[card.key].sub : tip(card.id)">{{models[card.key].name}}</span>
                            <button v-if="card.peek" class="tcard-btn" @click.stop="pin(card.id)" title="Pin this card: it stays open, and can be moved">Pin</button>
                            <button v-else class="tcard-x" @click.stop="unpin(card.key)" title="Close" aria-label="Close">✕</button>
                        </div>
                        <div class="tcard-body">
                            <tcard-legend v-if="card.kind == 'legend'" :view-id="card.id" :model="models[card.key]"></tcard-legend>
                            <tcard-content v-else :model="models[card.key]" :folded="folded" @fold="fold" @show="showView"></tcard-content>
                        </div>
                    </template>
                    <template v-if="!card.peek">
                        <div class="tcard-resize-bottom" title="Drag to change its height (double click: as tall as its content)" @pointerdown.stop="resize($event, card, false)" @dblclick="unsize(card)"></div>
                        <div class="tcard-resize" title="Drag to change its size (double click: back to its own size)" @pointerdown.stop="resize($event, card, true)" @dblclick="unsize(card)"></div>
                    </template>
                </div>
            </template>
            <div v-else-if="tcardState.peek && models.peek" class="tcard tcard-sheet teleplot-tcard">
                <div class="tcard-body">
                    <div class="tcard-bar">
                        <span v-for="t in models.peek.types" :key="t" class="telemetries-badge" :class="'telemetries-type-'+t">{{badge(t)}}</span>
                        <span class="tcard-name">{{models.peek.name}}</span>
                        <button class="tcard-btn" @click="pin(tcardState.peek.id)" title="Pin this card: it stays open">Pin</button>
                        <button class="tcard-x" @click="tcardState.peek = null" title="Close" aria-label="Close">✕</button>
                    </div>
                    <tcard-content :model="models.peek" :folded="folded" @fold="fold" @show="showView"></tcard-content>
                </div>
            </div>
            <div v-else-if="tcardState.pinned.length" class="tcard tcard-sheet teleplot-tcard">
                <div class="tcard-chips">
                    <button v-for="(card, i) in tcardState.pinned" :key="card.key" class="tcard-chip" :class="{on: i == sheetCard}" @click="tcardState.sheetIndex = i">{{models[card.key] ? models[card.key].name : ''}}</button>
                    <span class="tcard-grow"></span>
                    <button class="tcard-x" @click="unpin(tcardState.pinned[sheetCard].key)" title="Close this card" aria-label="Close this card">✕</button>
                </div>
                <div class="tcard-body" v-if="models[tcardState.pinned[sheetCard].key]">
                    <div class="tcard-bar">
                        <span v-for="t in models[tcardState.pinned[sheetCard].key].types" :key="t" class="telemetries-badge" :class="'telemetries-type-'+t">{{badge(t)}}</span>
                        <span v-if="models[tcardState.pinned[sheetCard].key].badge" class="telemetries-badge telemetries-type-other">{{models[tcardState.pinned[sheetCard].key].badge}}</span>
                        <span class="tcard-name">{{models[tcardState.pinned[sheetCard].key].name}}</span>
                    </div>
                    <tcard-legend v-if="tcardState.pinned[sheetCard].kind == 'legend'" :key="tcardState.pinned[sheetCard].key" :view-id="tcardState.pinned[sheetCard].id" :model="models[tcardState.pinned[sheetCard].key]"></tcard-legend>
                    <tcard-content v-else :model="models[tcardState.pinned[sheetCard].key]" :folded="folded" @fold="fold" @show="showView"></tcard-content>
                </div>
            </div>
        </div>
    `;
    // A card's blocks (the same for a card not pinned, a window and the sheet)
    const contentHTML = `
        <div class="tcard-content">
            <div v-if="model.label || model.desc" class="tcard-who"><span v-if="model.label" class="tcard-label" title="Label: views of this label show it together">{{model.label}}</span><span v-if="model.desc" class="tcard-dim">{{model.desc}}</span></div>
            <section class="tcard-block">
                <button class="tcard-bh" @click="$emit('fold', 'value')" :aria-expanded="!folded.value"><span class="tcard-tw">{{folded.value ? '▸' : '▾'}}</span><span>{{timeTitle.title}}</span><span class="tcard-tag" :class="{'tcard-held': model.time.mode != 'live'}">{{timeTitle.tag}}</span></button>
                <template v-if="!folded.value">
                    <div v-if="model.value.big !== undefined && model.value.big !== ''" class="tcard-big">{{model.value.big}}<small v-if="model.value.unit">{{model.value.unit}}</small></div>
                    <img v-if="picture" class="tcard-picture" :src="picture" alt="">
                    <div v-if="model.value.note" class="tcard-dim">{{model.value.note}}</div>
                    <div v-if="model.value.since !== undefined && model.value.sampleAt !== undefined" class="tcard-dim">since {{clock(model.value.since, 2)}} ({{duration(model.value.sampleAt - model.value.since)}})</div>
                    <div v-if="model.value.rows.length" class="tcard-kv">
                        <template v-for="row in model.value.rows" :key="row.k"><span>{{row.k}}</span><span><i v-if="row.swatch" class="tcard-swatch" :style="{background: row.swatch}"></i>{{row.v}}</span></template>
                    </div>
                    <div v-if="sampleNote" class="tcard-dim tcard-small">{{sampleNote}}</div>
                </template>
            </section>
            <section v-for="block in blocks" :key="block.id" class="tcard-block">
                    <button class="tcard-bh" @click="$emit('fold', block.id)" :aria-expanded="!folded[block.id]"><span class="tcard-tw">{{folded[block.id] ? '▸' : '▾'}}</span><span>{{block.title}}</span><span v-if="block.warn" class="tcard-warn-dot" title="Something to know">●</span><span v-if="folded[block.id]" class="tcard-sum">{{block.summary}}</span></button>
                    <template v-if="!folded[block.id]">
                        <div v-if="block.rows && block.rows.length" class="tcard-kv">
                            <template v-for="row in block.rows" :key="row.k"><span :class="{'tcard-mono': block.id == 'attributes'}">{{row.k}}</span><span :class="{'tcard-dim': row.dim, 'tcard-warn': row.warn}">{{row.v}}</span></template>
                        </div>
                        <div v-if="block.id == 'attributes' && block.rows.length == 0" class="tcard-dim">None set.</div>
                        <div v-if="block.notSet && block.notSet.length" class="tcard-dim tcard-small">Not set: <span v-for="(word, i) in block.notSet" :key="word"><span class="tcard-mono">{{word}}</span>{{i < block.notSet.length - 1 ? ', ' : ''}}</span></div>
                        <div v-if="block.data" class="tcard-data">
                            <template v-for="row in block.data" :key="row.type">
                                <span>{{row.label}}</span><span class="tcard-n">{{row.count}}</span>
                                <span class="tcard-strip"><i v-for="(p, i) in row.pieces" :key="'p'+i" :style="{left: (100*p[0]) + '%', width: 'max(2px, ' + (100*(p[1]-p[0])) + '%)'}"></i><u v-for="(f, i) in row.ticks" :key="'t'+i" :style="{left: (100*f) + '%'}"></u><em v-if="row.mark !== undefined" :style="{left: (100*row.mark) + '%'}"></em></span>
                            </template>
                        </div>
                        <div v-if="block.links" class="tcard-links">
                            <a v-for="link in block.links" :key="link.viewId" href="#" @click.prevent="$emit('show', link)">{{link.text}}</a>
                            <span v-if="!block.links.length" class="tcard-dim">No view shows it.</span>
                        </div>
                    </template>
                </section>
        </div>
    `;
    const vueCSS = `
        .tcard {
            --t-20: #2980b9; --t-21: #16a085; --t-22: #8e44ad; --t-23: #d68910; --t-24: #c0392b; --t-shape: #d35400; --t-camera: #2c8c7a; --t-log: #7d6608; --t-35: #5b6abf; --t-other: #7f8c8d; --t-setting: #1e8449; --t-action: #b03a2e; --t-graph: #2471a3;
            position: absolute; width: 330px; max-height: calc(100vh - 16px); display: flex; flex-direction: column;
            background: var(--color-bg-light); color: var(--color-text); border: 1px solid var(--color-bg-dark); border-radius: 0.5rem;
            box-shadow: 0 6px 18px var(--color-shadow); font-size: 0.8rem; overflow: hidden; box-sizing: border-box;
        }
        .tcard-legend { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.4rem 0; }
        .tcard-legend-list > * { display: contents; }
        .tcard-legend-list { font-size: 1.05rem; --teleplot-card-bg: transparent; --teleplot-card-bw: 0px; --teleplot-card-radius: 0px; --teleplot-card-shadow: none; --teleplot-accent-w: 0px; }
        .tcard-legend-list .teleplot-js-current-value-container { height: auto; min-height: 0; justify-content: flex-start; }
        .tcard-legend-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.25rem 0.3rem; border-radius: 0.25rem; cursor: pointer; }
        .tcard-legend-row:hover { background: var(--color-bg); }
        .tcard-legend-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tcard-legend-name i { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; margin-right: 0.4rem; }
        .tcard-legend-value { font-family: var(--teleplot-mono, monospace); font-weight: 700; white-space: nowrap; }
        .tcard-legend-off { opacity: 0.45; }
        .tcard-legend-off .tcard-legend-name { text-decoration: line-through; }
        .tcards { position: fixed; inset: 0; z-index: 15; pointer-events: none; } /* One layer: over the dashboard, under the top menu (20) and its popups */
        .tcards > .tcard { pointer-events: auto; }
        .tcard .telemetries-type-20 { --tc: var(--t-20); } .tcard .telemetries-type-21 { --tc: var(--t-21); } .tcard .telemetries-type-22 { --tc: var(--t-22); }
        .tcard .telemetries-type-23 { --tc: var(--t-23); } .tcard .telemetries-type-24 { --tc: var(--t-24); } .tcard .telemetries-type-shape { --tc: var(--t-shape); }
        .tcard .telemetries-type-camera { --tc: var(--t-camera); } .tcard .telemetries-type-log { --tc: var(--t-log); } .tcard .telemetries-type-35 { --tc: var(--t-35); }
        .tcard .telemetries-type-other { --tc: var(--t-other); } .tcard .telemetries-type-setting { --tc: var(--t-setting); } .tcard .telemetries-type-action { --tc: var(--t-action); } .tcard .telemetries-type-graph { --tc: var(--t-graph); }
        .tcard .telemetries-badge { flex: none; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em; color: #fff; background: var(--tc); border-radius: 0.2rem; padding: 0 0.3rem; line-height: 1.3; min-width: 2.4em; text-align: center; }
        .tcard-resize-bottom { position: absolute; left: 0; right: 14px; bottom: 0; height: 6px; cursor: ns-resize; touch-action: none; }
        .tcard-resize { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; touch-action: none;
            background: linear-gradient(135deg, transparent 50%, var(--color-text-muted) 50%, var(--color-text-muted) 58%, transparent 58%, transparent 72%, var(--color-text-muted) 72%, var(--color-text-muted) 80%, transparent 80%); opacity: 0.6; }
        .tcard-resize:hover { opacity: 1; }
        .tcard-moving, .tcard-moving * { user-select: none !important; } /* (moving or resizing a window selects no text on the way) */
        .tcard-bar { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.6rem; background: var(--color-bg); border-bottom: 1px solid var(--color-bg-dark); flex: none; }
        .tcard-grab { cursor: grab; touch-action: none; user-select: none; }
        .tcard-grab:active { cursor: grabbing; }
        .tcard-grip { color: var(--color-text-muted); }
        .tcard-name { flex: 1; min-width: 0; font-weight: 700; font-size: 0.9rem; overflow-wrap: anywhere; }
        .tcard-btn { font: inherit; font-size: 0.75rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text); border-radius: 0.25rem; padding: 0 0.45rem; cursor: pointer; }
        .tcard-x { font: inherit; border: none; background: none; color: var(--color-text-muted); cursor: pointer; padding: 0 0.2rem; font-size: 0.9rem; }
        .tcard-x:hover { color: var(--color-text); }
        .tcard-body { overflow-y: auto; scrollbar-width: thin; padding: 0 0.75rem 0.4rem; min-height: 0; }
        .tcard:not(.tcard-sheet) { max-height: calc(100vh - 16px); }
        .tcard-content { display: flex; flex-direction: column; }
        .tcard-who { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; padding: 0.45rem 0 0.1rem; }
        .tcard-label { font-size: 0.75rem; border: 1px dashed var(--color-text-muted); border-radius: 1rem; padding: 0 0.5rem; }
        .tcard-block { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.4rem 0; border-top: 1px solid var(--color-bg-dark); }
        .tcard-who + .tcard-block, .tcard-content > .tcard-block:first-child { border-top: none; }
        .tcard-bh { all: unset; display: flex; gap: 0.4rem; align-items: baseline; cursor: pointer; font-size: 0.65rem; letter-spacing: 0.07em; text-transform: uppercase; color: var(--color-text-muted); min-width: 0; }
        .tcard-bh:focus-visible { outline: 2px solid var(--color-primary); }
        .tcard-tw { width: 0.7rem; flex: none; letter-spacing: 0; }
        .tcard-tag, .tcard-sum { text-transform: none; letter-spacing: 0; font-size: 0.75rem; }
        .tcard-sum { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text); opacity: 0.75; }
        .tcard-held { color: var(--color-warning); }
        .tcard-big { font-size: 1.35rem; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; white-space: pre-line; line-height: 1.25; }
        .tcard-big small { font-size: 0.8rem; font-weight: 400; color: var(--color-text-muted); margin-left: 0.25rem; }
        .tcard-picture { max-width: 100%; max-height: 9rem; object-fit: contain; align-self: flex-start; border-radius: 0.25rem; image-rendering: pixelated; }
        .tcard-kv { display: grid; grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr); gap: 0.15rem 0.7rem; line-height: 1.4; }
        .tcard-kv > span:nth-child(odd) { color: var(--color-text-muted); }
        .tcard-kv > span { overflow-wrap: anywhere; }
        .tcard-dim { color: var(--color-text-muted); }
        .tcard-small { font-size: 0.72rem; }
        .tcard-mono { font-family: Menlo, Consolas, monospace; font-size: 0.72rem; }
        .tcard-warn { color: var(--color-warning); }
        .tcard-warn-dot { color: var(--color-warning); font-size: 0.6rem; }
        .tcard-swatch { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 0.15rem; vertical-align: -0.1rem; margin-right: 0.3rem; border: 1px solid var(--color-bg-dark); }
        .tcard-data { display: grid; grid-template-columns: minmax(4.5rem, auto) auto minmax(3rem, 1fr); gap: 0.25rem 0.5rem; align-items: center; }
        .tcard-n { text-align: right; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
        .tcard-strip { position: relative; height: 0.4rem; border-radius: 0.2rem; background: var(--color-bg-dark); overflow: hidden; }
        .tcard-strip i { position: absolute; top: 0; bottom: 0; background: var(--color-primary); }
        .tcard-strip u { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--color-primary); }
        .tcard-strip em { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--color-warning); }
        .tcard-links { display: flex; flex-direction: column; gap: 0.15rem; }
        .tcard-links a { color: var(--color-primary); }
        .tcards:has(.tcard-sheet) { z-index: 9260; } /* On a phone: above the sheets of the panels (9200) */
        .tcard-sheet { left: 0; right: 0; bottom: 0; width: auto; max-height: 60vh; border-radius: 0.8rem 0.8rem 0 0; }
        .tcard-chips { display: flex; gap: 0.3rem; align-items: center; padding: 0.45rem 0.6rem; overflow-x: auto; border-bottom: 1px solid var(--color-bg-dark); flex: none; }
        .tcard-chip { font: inherit; font-size: 0.75rem; border: 1px solid var(--color-bg-dark); border-radius: 1rem; background: var(--color-bg-light); color: var(--color-text); padding: 0.1rem 0.6rem; white-space: nowrap; }
        .tcard-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .tcard-grow { flex: 1; }
        .tcard-sheet .tcard-bar { background: none; border: none; padding: 0.4rem 0 0; }
        /* A view of "Shown in": a ring and a tint like the highlight of a drop, that fades away */
        @keyframes tcard-flash {
            0%, 55% { box-shadow: 0 0 0 3px var(--color-primary), inset 0 0 0 2000px color-mix(in srgb, var(--color-primary) 14%, transparent); }
            100% { box-shadow: 0 0 0 3px transparent, inset 0 0 0 2000px transparent; }
        }
        .tcard-flash { animation: tcard-flash 1.8s ease-out; }
    `;
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }
    vue.component("tcard-content", {
        props: ["model", "folded"],
        emits: ["fold", "show"],
        computed: {
            timeTitle() { return tcardTimeTitle(this.model.time, this.model.value); },
            picture() {
                const p = this.model.value.picture;
                return p && typeof p.base64 === "string" && (p.type === 0 || p.type === 1) ? "data:image/" + (p.type === 0 ? "jpeg" : "png") + ";base64," + p.base64 : "";
            },
            // When the sample shown is not at the time shown: how far before it
            sampleNote() {
                const v = this.model.value, t = this.model.time;
                if (v.sampleAt === undefined || t.mode === "live") return "";
                const before = t.at - v.sampleAt;
                return "sample of " + tcardClock(v.sampleAt, 2) + (before > 0.5 ? ": " + tcardDuration(before) + " before" : "");
            },
            blocks() {
                const m = this.model, blocks = [{ id: "values", title: "Values", rows: m.values.rows, summary: m.values.summary }];
                if (m.commands) blocks.push({ id: "commands", title: "Commands", rows: m.commands.rows, summary: m.commands.summary });
                blocks.push({ id: "kept", title: "Kept", rows: m.kept.rows, summary: m.kept.summary });
                blocks.push({ id: "data", title: "Data received", data: m.data.rows, summary: m.data.summary });
                blocks.push({ id: "attributes", title: "Attributes", rows: m.attributes.rows, notSet: m.attributes.notSet, summary: m.attributes.summary });
                blocks.push({ id: "source", title: "Source", rows: m.source.rows, summary: m.source.summary, warn: m.source.warn });
                blocks.push({ id: "shown", title: "Shown in", links: m.shownIn.links, summary: m.shownIn.summary });
                return blocks;
            },
        },
        methods: { clock: tcardClock, duration: tcardDuration },
        template: contentHTML,
    });
    // The list of a pinned legend: a chart's is the list of its popover, a scene's the rows of its legend
    vue.component("tcard-legend", {
        props: ["viewId", "model"],
        setup() { return { TP: Vue.inject("TP") }; },
        data() { return { listId: "tcard-legend-" + Math.random().toString(36).slice(2) }; },
        mounted() {
            const T = Vue.toRaw(this.TP), view = T.view.views.find((v) => v.id === this.viewId);
            if (!view || view.name !== "chart") return;
            const list = Vue.markRaw(view.createLegendList(this.listId));
            this._list = list;
            this._hook = () => { view.syncLegendList(list); list.update(); }; // (30 times per second, with the views)
            T.updates.onUpdateHooks.push(this._hook);
            this._hook();
        },
        beforeUnmount() {
            const T = Vue.toRaw(this.TP);
            const i = T.updates.onUpdateHooks.indexOf(this._hook);
            if (i >= 0) T.updates.onUpdateHooks.splice(i, 1);
            if (this._list) { const view = T.view.views.find((v) => v.id === this.viewId); if (view) view.highlightSeries(undefined); this._list.dispose(); }
        },
        methods: {
            view() { return Vue.toRaw(this.TP).view.views.find((v) => v.id === this.viewId); },
            toggle(id) { const view = this.view(); if (view) view.toggleTelemetry(id); },
            enter(id) { const view = this.view(); if (view) view.highlightTelemetry(id); },
            leave() { const view = this.view(); if (view) view.highlightTelemetry(undefined); },
        },
        template: `
            <div class="tcard-legend">
                <div class="tcard-dim tcard-small">{{model.sub}}</div>
                <div v-if="model.isChart" class="tcard-legend-list" :id="listId"></div>
                <template v-else>
                    <div v-if="!model.onScreen" class="tcard-dim tcard-small">Its view is not on screen: values as it last drew them.</div>
                    <div v-for="row in model.rows" :key="row.id" class="tcard-legend-row" :class="{'tcard-legend-off': row.hidden}" :title="row.tip"
                        @click="toggle(row.id)" @mouseenter="enter(row.id)" @mouseleave="leave()">
                        <span class="tcard-legend-name"><i :style="{background: row.color}"></i>{{row.name}}<span v-if="row.unit" class="tcard-dim"> ({{row.unit}})</span></span>
                        <span class="tcard-legend-value">{{row.value}}</span>
                    </div>
                    <div v-if="!model.rows.length" class="tcard-dim">Nothing in its legend.</div>
                </template>
            </div>`,
    });
    return vue.component(name, {
        name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx, tcardState };
        },
        data() { return { models: {}, sheet: false, folded: tcardState.folded }; },
        computed: {
            // The card not pinned and the pinned windows, each with a key of its own
            shownCards() {
                // The one brought forward last is drawn over the others (inside the layer of the cards: .tcards)
                const cards = tcardState.pinned.map((card) => Object.assign({ peek: false }, card, { card }));
                const order = cards.map((card) => card.z).sort((a, b) => a - b);
                for (const card of cards) card.rank = 1 + order.indexOf(card.z);
                const peek = tcardState.peek;
                if (peek) cards.push({ key: "peek", id: peek.id, x: peek.x, y: peek.y, rank: cards.length + 1, peek: true });
                return cards;
            },
            sheetCard() { return Math.min(tcardState.sheetIndex, tcardState.pinned.length - 1); },
        },
        created() {
            Vue.toRaw(this.TP).view.onPinLegendHooks.push((view, rect) => { tcardPinLegend(view.id, rect); this.refresh(); });
        },
        mounted() {
            const narrow = window.matchMedia("(max-width: 640px)");
            const apply = () => { this.sheet = narrow.matches; };
            apply();
            narrow.addEventListener("change", apply);
            this.refresh();
            this._timer = setInterval(() => this.refresh(), 250);
        },
        beforeUnmount() { clearInterval(this._timer); },
        methods: {
            // Works out what each card shows (the library is read raw: its data is not reactive)
            refresh() {
                const T = Vue.toRaw(this.TP);
                if (!T.datastore) return;
                const cards = tcardState.pinned.map((card) => ({ key: card.key, kind: card.kind, id: card.id }));
                if (tcardState.peek) cards.push({ key: "peek", kind: "telemetry", id: tcardState.peek.id });
                const dashboard = this.ctx.activeDashboard ? Vue.toRaw(this.ctx.activeDashboard) : undefined;
                const time = tcardTimeShown(T, dashboard ? dashboard.getGroupName() : undefined);
                const models = {};
                for (const card of cards) {
                    if (card.kind === "legend") {
                        const view = T.view.views.find((v) => v.id === card.id);
                        if (!view) { tcardUnpin(card.key); continue; } // (its view was removed: its list goes)
                        models[card.key] = Vue.markRaw(tcardLegendModel(T, view));
                        continue;
                    }
                    const telem = T.datastore.telemetries[card.id];
                    if (!telem) { if (card.key !== "peek") tcardUnpin(card.key); else tcardState.peek = null; continue; } // (forgotten: its card goes)
                    const model = tcardModel(T, telem, time, this.models[card.key]);
                    model.types = telemetryTypes(T, telem);
                    models[card.key] = Vue.markRaw(model);
                }
                this.models = models;
            },
            badge(code) { const t = TELEMETRY_TYPES.find((type) => type.code == code); return t ? t.badge : "?"; },
            tip(id) { const telem = Vue.toRaw(this.TP).datastore.telemetries[id]; return telem ? this.TP.view.telemetryTip(Vue.toRaw(telem)) : ""; },
            pin(id) { tcardPin(id); this.refresh(); },
            unpin(key) { tcardUnpin(key); },
            keepPeek() { tcardKeepPeek(); },
            leavePeek() { tcardHoverEnd(); },
            front(card) { if (card.card) card.card.z = ++tcardState.z; },
            fold(id) { tcardState.folded[id] = !tcardState.folded[id]; tcardSaveFolds(); },
            // Moves a pinned card by its title bar, kept within the window
            drag(event, card) {
                if (card.peek || event.button > 0 || event.target.closest("button")) return;
                const target = card.card, startX = event.clientX, startY = event.clientY, x0 = target.x, y0 = target.y;
                tcardFollowPointer(event, (e) => {
                    target.x = Math.min(window.innerWidth - 80, Math.max(-200, x0 + e.clientX - startX));
                    target.y = Math.min(window.innerHeight - 40, Math.max(0, y0 + e.clientY - startY));
                });
            },
            // Resizes a pinned window by its bottom edge (height) or its corner (height and width), kept within the page
            resize(event, card, both) {
                if (event.button > 0) return;
                const target = card.card, handle = event.currentTarget, box = handle.parentElement.getBoundingClientRect();
                const startX = event.clientX, startY = event.clientY, w0 = box.width, h0 = box.height;
                tcardFollowPointer(event, (e) => {
                    target.h = Math.round(Math.max(96, Math.min(window.innerHeight - target.y - 8, h0 + e.clientY - startY)));
                    if (both) target.w = Math.round(Math.max(240, Math.min(window.innerWidth - target.x - 8, w0 + e.clientX - startX)));
                });
            },
            unsize(card) { card.card.h = undefined; card.card.w = undefined; },
            // A view of "Shown in": its dashboard on display, the view scrolled into sight and flashed
            showView(link) {
                const dashboard = this.TP.dashboards.dashboards[link.dashboard];
                if (dashboard && (!this.ctx.activeDashboard || this.ctx.activeDashboard.name !== link.dashboard)) this.ctx.activeDashboard = dashboard;
                setTimeout(() => {
                    const view = Vue.toRaw(this.TP).view.views.find((v) => v.id === link.viewId);
                    const element = view && document.getElementById(view.divId);
                    if (!element) return;
                    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    const target = element.querySelector(".teleplot-js-telemetry-card") || element; // (the card of the view covers its element)
                    target.classList.remove("tcard-flash");
                    void target.offsetWidth; // (the animation starts again)
                    target.classList.add("tcard-flash");
                    setTimeout(() => target.classList.remove("tcard-flash"), 2000);
                }, 150);
            },
        },
        template: vueHTML,
    });
}
