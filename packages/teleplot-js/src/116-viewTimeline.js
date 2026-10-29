/*
 * Timeline view: text telemetries as lanes over time, one lane per telemetry.
 * - A state (text telemetry, "t" flag) is a band from each sample to the next one: what the telemetry said until it said something
 *   else. The same text sent again continues the band; an empty text leaves a hole; the last band runs to the end of the period.
 * - A log (TELEM_ATTR_LOG, "log" flag) is a tick per line: a line is an instant, it does not last.
 * - Nothing is made up: bands start and end at the timestamps of samples. What is too short to be drawn (several states within a
 *   couple of pixels) is drawn as one neutral block that tells how many states it holds, never as one of them.
 * - The period is the zoomed range of the time group, or else all the data of the views of the group (so that a timeline next to
 *   charts covers the same time as them), within the data window; the latest state is given a little room at its end. Drag to zoom (shared with the group, like on a chart), double
 *   click to go back to the latest data; the pointer moves the cursor of the group and tells what is under it.
 * - Each text has its color: the texts of a view take the colors of the palette in the order they show up, so that the states of
 *   a telemetry are told apart; texts that look like errors, warnings or successes take the colors of the theme for them, as in the Log view.
 * - A stack (TELEM_ATTR_STACK, "stack" flag: a state whose text is the path of what is running, "loop/plan/search", or several of
 *   them with their statuses, doc/graph.md) is a lane drawn by branches (buildBranches): a band per run of a node, that lasts while
 *   its state (running, or a status) does not change; rows depth first, a node's row then the rows of its children; siblings that
 *   follow each other share a row (a plain stack has a row per level), siblings that overlap in time have a row each under their
 *   parent. The tree is drawn at the right of the names. The lane opens with its rows, up to "stackDepth" rows of full height;
 *   more, its rows get thinner down to a minimum, then it grows again. A stack that has a structure (a graph, Telemetry.getEnum)
 *   takes the colors of the graph view: what runs in the primary color, a status in the color of its words (ViewLog.getLevel).
 * - Numbers can be given a lane too (they are added on purpose: a timeline that follows a label only takes texts):
 *     a number that has thresholds is read as a state: a band where it is past a threshold, named and colored after it, from the
 *       sample that passed it to the first one that is not past it any more;
 *     any other number is a plain line from sample to sample (straight, no steps: nothing says the value held), scaled on its range
 *       or on what is displayed. A number with few values reads like a digital signal; it is not a chart (no axis, no thresholds);
 *     option "numbers": "text" writes each value as a state instead (a band per run of the same value: a gear, a mode code).
 * What is drawn is first computed without any canvas (buildLane, limitRuns, getTimeWindow): that part is tested.
 */
const _timeline_limitRuns = new WeakMap(); // number data entry -> runs of "the threshold it is past" (see ViewTimeline.limitRuns)

class ViewTimeline extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "timeline";
        this.type = "teleplot-timeline";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER];
        this.supportedLabel = "text or number";

        this.options.displayTelemetryName = true; // Name of each lane, on its left
        this.options.stackDepth = 4;              // Rows of full height a stack lane opens to (0: as many as it has levels): see laneSize
        this.options.numbers = "auto";            // Lane of a number: "auto" (bands from its thresholds when it has some, else a line) or "text" (a band per value)
        this.decimators = TELEPLOT.Vue.markRaw({}); // One MinMaxDecimator per number drawn as a line (raw: see the chart)

        this.layout.width = 2;
        this.layout.height = 2;

        // What is drawn (raw: read on every draw): [{id, name, kind, items: see buildLane, line: see buildLine}], and the period it covers
        this.lanes = TELEPLOT.Vue.markRaw([]);
        this.period = TELEPLOT.Vue.markRaw({ from: 0, to: 0 });
        this.colors = TELEPLOT.Vue.markRaw(new Map()); // Text -> index of its color, in the order texts showed up (see colorOf)
        this.lastKey = "";
        this.lastCursor = -2;
        this.page = undefined;      // Canvas and listeners, once mounted
        this.selection = undefined; // Drag in progress: {from, to} in pixels of the plot
        this.tip = TELEPLOT.Vue.reactive({ shown: false, left: 0, top: 0, flip: false, name: "", desc: "", text: "", detail: "" }); // What is under the pointer
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext,
                    emptyState: self.emptyState,
                    tip: self.tip
                }
            },
            methods: {
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop
            },
            template: ViewTimeline.vueHTML,
        });

        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);
        this.vue.mount(`#${this.divId}`);
        this.__attach(element);
    }

    dispose() {
        this.__detach();
        this.lastKey = "";
        super.dispose();
    }

    getOptionsSchema() {
        return [{ key: "displayTelemetryName", label: "Telemetry names", type: "bool" },
            { key: "stackDepth", label: "Stack rows", type: "int", min: 0, max: 64, step: 1 },
            { key: "numbers", label: "Numbers", type: "choice", choices: [["auto", "Auto"], ["text", "As text"]] }]; // (a line, or bands from thresholds / a band per value)
    }

    // ------------------------------------------------------------------ What is drawn (no canvas here)

    // First index of a sorted array whose value is > x
    static after(sorted, x) {
        let lo = 0, hi = sorted.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(sorted[mid] <= x) lo = mid + 1; else hi = mid; }
        return lo;
    }

    /*
     * What a text data entry shows between two times: [{from, to, text, count, mixed, tick}], in order.
     *   state (isLog false): a band per run of the same text, from its first sample (or "from" when it started before) to the next
     *     different text (or "to" when it is still the one in force). Empty texts give no band: a hole.
     *   log (isLog true): a tick per line (from = to = its time).
     * What lasts less than minDuration (seconds: what a couple of pixels show) cannot be drawn as it is: short bands that follow
     * each other become one "mixed" block (count: how many states, text: the first one), ticks closer than that become one tick
     * that counts them.
     */
    static buildLane(entry, isLog, from, to, minDuration=0) {
        let stamps = entry.timestamps, texts = entry.data[0];
        let items = [], last = undefined;
        if(!(from < to) || !stamps.length) return items;
        if(isLog) {
            let i = ViewTimeline.after(stamps, from);
            while(i > 0 && stamps[i - 1] === from) i--; // (a line at the very start of the period belongs to it)
            for(; i < stamps.length && stamps[i] <= to; i++) {
                if(last !== undefined && stamps[i] - last.from < minDuration) { last.count++; continue; }
                last = { from: stamps[i], to: stamps[i], text: String(texts[i]), count: 1, tick: true };
                items.push(last);
            }
            return items;
        }
        let i = Math.max(0, ViewTimeline.after(stamps, from) - 1); // The state in force when the period starts
        while(i < stamps.length && stamps[i] <= to) {
            let text = String(texts[i]);
            let start = Math.max(from, stamps[i]);
            let j = i + 1;
            while(j < stamps.length && stamps[j] <= to && String(texts[j]) === text) j++; // (said again: still the same state)
            let end = j < stamps.length ? Math.min(to, stamps[j]) : to;
            i = j;
            if(text === "" || !(end > start)) continue;
            if(end - start < minDuration) {
                if(last !== undefined && last.mixed && start - last.from < minDuration) { last.to = end; last.count++; }
                else { last = { from: start, to: end, text, count: 1, mixed: true }; items.push(last); }
                continue;
            }
            last = { from: start, to: end, text, count: 1 };
            items.push(last);
        }
        return items;
    }

    // Color of a text: "error" / "warn" for texts that look like one (as in the Log view), else a color of the palette. The texts
    // of a view take the colors one after the other as they show up ("known": Map text -> index, filled here), so that the states of
    // a telemetry get different colors; past COLOR_MEMORY texts (a "state" that is never twice the same), the color comes from the text itself.
    static colorOf(text, known) {
        let level = TELEPLOT.view.ViewLog.getLevel(text);
        if(level) return ViewTimeline.LEVEL_COLORS[level];
        let index = known ? known.get(text) : undefined;
        if(index === undefined) {
            if(known && known.size < ViewTimeline.COLOR_MEMORY) { index = known.size; known.set(text, index); }
            else { index = 5381; for(let i = 0; i < text.length; i++) index = ((index * 33) ^ text.charCodeAt(i)) >>> 0; }
        }
        return TELEPLOT.colors.palette[ViewTimeline.PALETTE[index % ViewTimeline.PALETTE.length]].toStrRGB();
    }
    static LEVEL_COLORS = { 1: "warn", 2: "error", 3: "ok" }; // (levels of ViewLog.getLevel)
    // Color of a status (doc/graph.md): the color of its words, muted when it has none (no meaning is made up for a word not known)
    static statusColor(text) {
        return ViewTimeline.LEVEL_COLORS[TELEPLOT.view.ViewLog.getLevel(TELEPLOT.protocol.decodeName(text))] || "muted";
    }
    static PALETTE = [1, 2, 4, 3, 5, 6, 10, 11, 12, 13, 7]; // Colors of the palette that are told apart, blue first. No red: it reads as an alarm, and is what a text that looks like an error gets
    static COLOR_MEMORY = 500;

    /*
     * A stack lane by branches (doc/graph.md), from its nodes (TELEPLOT.stackRuns): { rows: [items], tree: [{depth, parent (row
     * index, -1 for a root), first (the row starts a new root, not the first one), label (the name of its node when it holds only
     * one)}], entries: Map path -> the runs of the node as a text entry (for the real extent of a band) }.
     * Items are those of buildLane, with node (its path), label (its name) and status (null while it runs, else the status).
     * Rows come depth first: a row, then the rows of the children of its nodes. Siblings share a row unless their bands overlap in
     * time (several things that run at once, or a result next to what runs): then each has its own, under their parent. "rank"
     * orders siblings (path -> number: the order of a structure), else the order they showed up in.
     */
    static buildBranches(runs, from, to, minDuration=0, rank=undefined) {
        const RUN = ViewTimeline.RUNNING;
        let entries = new Map(), items = new Map(), children = new Map(), roots = [];
        let order = (path) => rank && rank.has(path) ? rank.get(path) : 1e9 + runs.order.indexOf(path);
        for(let path of runs.order) {
            let node = runs.nodes.get(path);
            let entry = { timestamps: node.timestamps, data: [node.data[0].map((state) => state === null ? "" : (state === "" ? RUN : "=" + state))] };
            entries.set(path, entry);
            let list = ViewTimeline.buildLane(entry, false, from, to, minDuration);
            if(!list.length) continue;
            for(let item of list) {
                item.node = path;
                item.label = TELEPLOT.protocol.decodeName(node.name);
                item.status = item.text === RUN ? null : item.text.slice(1);
            }
            items.set(path, list);
        }
        for(let path of items.keys()) {
            let parent = runs.nodes.get(path).parent;
            if(parent !== "" && items.has(parent)) { if(!children.has(parent)) children.set(parent, []); children.get(parent).push(path); }
            else roots.push(path);
        }
        let overlap = (a, b) => items.get(a).some((x) => items.get(b).some((y) => x.from < y.to && y.from < x.to));
        let pack = (paths) => {
            let slots = [];
            for(let path of paths.slice().sort((a, b) => order(a) - order(b))) {
                let slot = slots.find((candidate) => candidate.every((other) => !overlap(path, other)));
                if(slot) slot.push(path); else slots.push([path]);
            }
            return slots;
        };
        let rows = [], tree = [];
        let layout = (slot, depth, parent, first) => {
            let row = rows.length;
            rows.push(slot.flatMap((path) => items.get(path)).sort((a, b) => a.from - b.from));
            tree.push({ depth, parent, first, label: slot.length === 1 ? TELEPLOT.protocol.decodeName(runs.nodes.get(slot[0]).name) : "" });
            for(let childSlot of pack(slot.flatMap((path) => children.get(path) || []))) layout(childSlot, depth + 1, row, false);
        };
        pack(roots).forEach((slot, i) => layout(slot, 0, -1, i > 0));
        return { rows, tree, entries };
    }
    static RUNNING = "\u0001"; // (a node that runs, among the texts of its runs: never a status, which follows "=")

    // What the telemetries of the view give a lane, in the order of its list: [{telem, entry, kind}]. A text is a "state", a "stack"
    // (a state whose text is a path: a row per level) or a "log".
    // A number (of a telemetry without text) is "limits" (it has thresholds: bands of the one it is past), "line", or "values"
    // (option "numbers": "text": a band per value). An action (doc/telecmd.md) is "calls": a band per call.
    getSources() {
        const P = TELEPLOT.protocol;
        let sources = [];
        for(let telemIdOrName of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined || sources.some((source) => source.telem.id === telem.id)) continue;
            let text = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT], number = telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER];
            if(TELEPLOT.commands.isAction(telem)) sources.push({ telem, entry: text || ViewTimeline.NO_DATA, kind: "calls" });
            else if(text !== undefined) sources.push({ telem, entry: text, kind: telem.getAttribute(P.TELEM_ATTR_LOG) === true ? "log" : (telem.getAttribute(P.TELEM_ATTR_STACK) === true ? "stack" : "state") });
            else if(number !== undefined) {
                let kind = this.getOption("numbers", telem.id) === "text" ? "values" : (telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD] !== undefined ? "limits" : "line");
                sources.push({ telem, entry: number, kind });
            }
        }
        return sources;
    }

    // A number read through its thresholds: { timestamps, data: [names], colors: Map name -> color } with one item per run of "past
    // the same threshold" ("" when it is past none), in the shape of a data entry (see TELEPLOT.textRuns). A run starts at the sample
    // that passed the limit: where the value crossed it between two samples is not known, and not guessed. Each sample is compared
    // with the limits in force at its own time. Kept next to the number entry and completed as samples are appended; a new threshold
    // makes it read again what came from its time on, samples removed by the data window take their runs with them; built again
    // when samples or thresholds were inserted late.
    static limitRuns(telem) {
        const P = TELEPLOT.protocol;
        let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER], limits = telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD];
        let stamps = entry.timestamps, values = entry.data[0];
        let limitStamps = limits === undefined ? [] : limits.timestamps, limitLate = limits === undefined ? 0 : limits.lateInsertions;
        let runs = _timeline_limitRuns.get(entry);
        if(runs === undefined || runs.late !== entry.lateInsertions || runs.source !== stamps
            || runs.limitSource !== limitStamps || runs.limitLate !== limitLate || runs.limitCount > limitStamps.length) {
            runs = { late: entry.lateInsertions, pruned: entry.pruned, source: stamps, count: 0, lastStamp: undefined, limitSource: limitStamps, limitLate, limitCount: 0, timestamps: [], data: [[]], colors: new Map() };
            _timeline_limitRuns.set(entry, runs);
        }
        let lower = (value) => { let lo = 0, hi = stamps.length; while(lo < hi) { let mid = (lo + hi) >> 1; if(stamps[mid] < value) lo = mid + 1; else hi = mid; } return lo; };
        let forgetFrom = (time) => { while(runs.timestamps.length && runs.timestamps[runs.timestamps.length - 1] >= time) { runs.timestamps.pop(); runs.data[0].pop(); } };
        if(runs.pruned !== entry.pruned || runs.count > stamps.length) {
            // The oldest samples were removed (the data window moves on: several times per second with a lot of data). The runs that
            // ended before what is left go with them, and reading goes on from the last sample that was read: nothing is read twice.
            runs.pruned = entry.pruned;
            let first = stamps.length ? stamps[0] : Infinity, gone = 0;
            while(gone + 1 < runs.timestamps.length && runs.timestamps[gone + 1] <= first) gone++; // (the run in force when the data starts stays)
            runs.timestamps.splice(0, gone);
            runs.data[0].splice(0, gone);
            if(runs.lastStamp === undefined || !stamps.length) { runs.count = 0; runs.timestamps.length = 0; runs.data[0].length = 0; }
            else { runs.count = lower(runs.lastStamp); forgetFrom(runs.lastStamp); }
        }
        if(runs.limitCount < limitStamps.length) {
            // New thresholds (appended: the usual case of a limit that moves now): only what the number said from the first of them
            // on has to be read again, not everything it ever said
            let since = limitStamps[runs.limitCount];
            let from = lower(since);
            if(from < runs.count) { runs.count = from; forgetFrom(since); }
            runs.limitCount = limitStamps.length;
        }
        let kept = runs.data[0], last = kept.length ? kept[kept.length - 1] : undefined;
        let changes = limitStamps, change = 0, current = undefined;
        for(let i = runs.count; i < stamps.length; i++) {
            let time = stamps[i], value = values[i];
            if(current === undefined || (change < changes.length && changes[change] <= time)) { // (the limits moved: the ones in force now)
                current = telem.getThresholds(time);
                while(change < changes.length && changes[change] <= time) change++;
            }
            let past = undefined;
            for(let threshold of current) {
                let isPast = threshold.operator === P.THRESHOLD_ABOVE ? value > threshold.value : value < threshold.value;
                if(isPast && (past === undefined || Math.abs(value - threshold.value) < Math.abs(value - past.value))) past = threshold;
            }
            let name = past === undefined ? "" : past.name;
            if(past !== undefined) runs.colors.set(name, past.color);
            if(name === last) continue;
            runs.timestamps.push(time);
            kept.push(name);
            last = name;
        }
        runs.count = stamps.length;
        runs.lastStamp = stamps.length ? stamps[stamps.length - 1] : undefined;
        return runs;
    }

    // The line of a number over a period: { timestamps, values, min, max }. Real samples only, joined by straight segments when
    // drawn: at most a few per pixel (the first, lowest, highest and last of each: see MinMaxDecimator), plus the sample before the
    // period and the one after it, so that the line comes in and goes out where it does. min / max: what the lane goes from and to
    // (the range of the telemetry when it has both ends, else what is drawn).
    static buildLine(entry, decimator, from, to, width, range) {
        let stamps = entry.timestamps, numbers = entry.data[0];
        let view = stamps.length && from < to ? decimator.getView(entry, from, to, Math.max(1, Math.round(width))) : { timestamps: [], values: [] };
        let before = ViewTimeline.after(stamps, view.timestamps.length ? view.timestamps[0] : from) - 1;
        while(before >= 0 && (stamps[before] >= (view.timestamps.length ? view.timestamps[0] : from) || !Number.isFinite(numbers[before]))) before--;
        if(before >= 0) { view.timestamps.unshift(stamps[before]); view.values.unshift(numbers[before]); }
        let next = ViewTimeline.after(stamps, view.timestamps.length ? view.timestamps[view.timestamps.length - 1] : to);
        while(next < stamps.length && !Number.isFinite(numbers[next])) next++;
        if(next < stamps.length && stamps[next] > to) { view.timestamps.push(stamps[next]); view.values.push(numbers[next]); }
        let min = Infinity, max = -Infinity;
        if(range !== undefined && range.min !== undefined && range.max !== undefined && range.max > range.min) { min = range.min; max = range.max; }
        else for(let value of view.values) { if(value < min) min = value; if(value > max) max = value; }
        return { timestamps: view.timestamps, values: view.values, min, max };
    }

    // The period displayed: the zoomed range of the group, or else what the numbers and texts shown by the views of the group cover
    // (a state that is not sent again does not make time pass: the charts next to it do), within the data window.
    // A lone sample gets a short period around it. undefined when there is no data at all.
    getTimeWindow() {
        const P = TELEPLOT.protocol;
        let group = TELEPLOT.view.groups[this.group];
        if(group.cursorActive && group.timestampFrom < group.timestampTo) return { from: group.timestampFrom, to: group.timestampTo };
        let from = Infinity, to = -Infinity;
        let cover = (list) => {
            for(let telemIdOrName of list) {
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                if(telem === undefined) continue;
                for(let dataType of ViewTimeline.TIME_TYPES) {
                    let entry = telem.data[dataType];
                    if(entry === undefined || !entry.timestamps.length) continue;
                    if(entry.timestamps[0] < from) from = entry.timestamps[0];
                    if(entry.timestamps[entry.timestamps.length - 1] > to) to = entry.timestamps[entry.timestamps.length - 1];
                }
            }
        };
        cover(this.telemetryIdOrNameList);
        for(let view of TELEPLOT.view.views) if(view.group === this.group && view.id !== this.id && view.telemetryIdOrNameList) cover(view.telemetryIdOrNameList);
        if(to === -Infinity) return undefined;
        if(!(from < to)) return { from: to - 1, to: to + 9 };
        // Within the data window: a state kept from before it is shown from where the window starts. (Cut before the room below is
        // measured: data that is older than the window, kept or not pruned yet after the window was lowered, would make it huge.)
        let dataWindow = TELEPLOT.state.dataTimeout;
        if(dataWindow > 0 && to - from > dataWindow) from = to - dataWindow;
        // The latest state gets some room at the end: when it just showed up and nothing else makes time pass, it would have no
        // width at all, and it is the one people look for. (The axis tells what time that is: nothing is said to have happened there.)
        let room = (to - from) * ViewTimeline.LATEST_ROOM;
        let end = to;
        for(let { entry, kind } of this.getSources()) {
            let last = entry.timestamps.length - 1;
            if(last < 0 || (kind !== "state" && kind !== "stack") || String(entry.data[0][last]) === "") continue;
            let extent = ViewTimeline.extentOf(entry, entry.timestamps[last]);
            if(extent !== undefined && extent.start + room > end) end = extent.start + room;
        }
        if(dataWindow > 0 && end - from > dataWindow) from = end - dataWindow; // (the period stays as long as the window)
        return { from, to: end };
    }
    static TIME_TYPES = [20, 21, 22, 23]; // Numbers (1, 2 or 3 of them) and texts: what is sent as time passes
    static NO_DATA = Object.freeze({ timestamps: [], data: [[]], lastUpdate: 0 }); // (an action that was never called)

    // The calls of an action as bands of a lane: [{from (sent, else run), run, to (end; now while it runs), status, id, text, args}],
    // those that reach the period. Times come from the answers of the device (run, ok, err) and from when the page sent it.
    static buildCalls(calls, from, to, now) {
        let items = [];
        for(let call of calls) {
            let start = call.sent !== undefined ? call.sent : (call.run !== undefined ? call.run : call.end);
            if(start === undefined) continue;
            let end = call.end !== undefined ? call.end : (call.status === "run" ? Math.max(start, now) : (call.run !== undefined ? call.run : start));
            if(end < from || start > to) continue;
            items.push({ from: start, run: call.run, to: end, status: call.status, id: call.id, text: call.text || "", args: call.args });
        }
        return items;
    }

    // What the page asked a setting, as ticks above its lane: [{at, status, target}] within the period
    static buildRequests(history, type, from, to) {
        let ticks = [];
        for(let request of history) {
            if(request.target === undefined || request.t < from || request.t > to) continue;
            ticks.push({ at: request.t, status: request.status, target: TELEPLOT.commands.formatValue(type, request.target), reason: request.reason || "" });
        }
        return ticks;
    }
    static LATEST_ROOM = 0.04;            // Part of the period the latest state is given at least

    // Width of the plot in pixels (what the period is spread over): without a page (not mounted), a usual one
    getPlotWidth() {
        return this.page && this.page.width ? Math.max(50, this.page.width - this.page.gutter) : 600; // (the margin of the names: as last laid out)
    }

    update(){
        if (!super.__before_update()) return;

        let sources = this.getSources();
        let period = this.getTimeWindow();
        let width = this.getPlotWidth();
        let key = (period ? period.from + "," + period.to : "none") + "|" + width + "|" + (this.page ? this.page.width + "x" + this.page.height : "") + "|" + TELEPLOT.theme.key() + "|" + (this.options.displayTelemetryName ? 1 : 0) + "|" + this.options.stackDepth;
        let now = Date.now() / 1000;
        for(let { telem, entry, kind } of sources) {
            key += `|${telem.id}:${kind}:${entry.lastUpdate}:${entry.timestamps.length}:${telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME)}`;
            // Commands: what the page asked (requests of a setting, calls of an action), and a call that runs grows with the time
            let history = TELEPLOT.commands.history(telem);
            if(history.length) { let last = history[history.length - 1]; key += `:${history.length}:${last.status}`; if(last.status === "run" || last.status === "sent" || last.status === "pending") key += `:${Math.floor(now * 4)}`; }
            if(kind === "calls") { let last = TELEPLOT.commands.lastCall(telem); if(last && last.status === "run") key += `:${Math.floor(now * 4)}`; }
            let limits = kind === "limits" ? telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD] : undefined;
            if(limits !== undefined) key += `:${limits.lastUpdate}:${limits.timestamps.length}`;
            if(kind === "line") { let range = telem.getRange(); if(range !== undefined) key += `:${range.min}:${range.max}`; }
            let structure = kind === "stack" ? telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_ENUM] : undefined; // (it orders and colors a stack)
            if(structure !== undefined) key += `:${structure.lastUpdate}:${structure.timestamps.length}:${structure.lateInsertions}`;
        }
        let cursor = TELEPLOT.view.groups[this.group].cursorTimestamp;
        if(key === this.lastKey && cursor === this.lastCursor && !this.selection) return;
        if(key !== this.lastKey) {
            this.lastKey = key;
            this.period.from = period ? period.from : 0;
            this.period.to = period ? period.to : 0;
            let minDuration = period ? (period.to - period.from) / width * ViewTimeline.MIN_PIXELS : 0;
            this.lanes.length = 0;
            for(let { telem, entry, kind } of sources) {
                let lane = { id: telem.id, kind, isLog: kind === "log", name: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id), items: [], runs: undefined, line: undefined, color: "" };
                let declaration = TELEPLOT.commands.declaration(telem);
                if(declaration && declaration.kind === "setting" && period) lane.requests = ViewTimeline.buildRequests(TELEPLOT.commands.history(telem), declaration.type, period.from, period.to);
                if(kind === "calls") lane.calls = period ? ViewTimeline.buildCalls(TELEPLOT.commands.calls(telem), period.from, period.to, now) : [];
                else if(kind === "stack") { // Rows by branch (see buildBranches): the bands of a row are the runs of its nodes
                    let structure = telem.getEnum(), rank = undefined;
                    if(structure !== undefined) { rank = new Map(); structure.items.forEach((item, i) => rank.set(item.path, i)); }
                    let graph = telem.hasStructure(); // (a graph: the colors of the graph view)
                    let branches = period ? ViewTimeline.buildBranches(TELEPLOT.stackRuns(entry), period.from, period.to, minDuration, rank) : { rows: [], tree: [], entries: new Map() };
                    lane.rows = branches.rows;
                    lane.tree = branches.tree;
                    lane.entries = branches.entries;
                    for(let row of lane.rows) for(let item of row) {
                        if(item.mixed) continue;
                        if(item.status === null) item.color = graph ? "primary" : ViewTimeline.colorOf(item.label, this.colors);
                        else { item.color = graph ? ViewTimeline.statusColor(item.status) : ViewTimeline.colorOf(TELEPLOT.protocol.decodeName(item.status), this.colors); item.label += ": " + TELEPLOT.protocol.decodeName(item.status); }
                    }
                }
                else if(kind === "line") { // A number without thresholds: a line from sample to sample
                    if(this.decimators[telem.id] === undefined) this.decimators[telem.id] = new MinMaxDecimator();
                    lane.color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR) || TELEPLOT.colors.getColor(this.lanes.length + 1).toStrRGB();
                    if(period) lane.line = ViewTimeline.buildLine(entry, this.decimators[telem.id], period.from, period.to, width, telem.getRange());
                }
                else {
                    // Bands work on runs: a state by its text (the same text sent again is nothing new), a number by its value
                    // ("values") or by the threshold it is past ("limits"). A log has no runs: every line is a tick.
                    if(kind !== "log") lane.runs = kind === "limits" ? ViewTimeline.limitRuns(telem) : TELEPLOT.textRuns(entry);
                    if(period) lane.items = ViewTimeline.buildLane(kind === "log" ? entry : lane.runs, kind === "log", period.from, period.to, minDuration);
                    for(let item of lane.items) {
                        if(item.mixed) continue;
                        if(kind === "limits") item.color = lane.runs.colors.get(item.text) || "warn"; // (the color of the threshold, or the one of the theme)
                        else item.color = ViewTimeline.colorOf(item.text, kind === "log" ? undefined : this.colors); // (a log line only has a color when it is an error or a warning)
                    }
                }
                this.lanes.push(lane);
            }
            this.__layout();
        }
        this.lastCursor = cursor;
        this.__draw();
    }
    static MIN_PIXELS = 2; // What is narrower than this cannot be drawn as it is

    // Height of a stack lane and of its rows: { height, rowHeight }. The lane opens with the stack: a row of full height (rowHeight)
    // per level, up to "limit" rows (0: no limit). A deeper stack keeps that height and its rows get thinner, down to minRow; deeper
    // still, rows stay at minRow and the lane grows again.
    static laneSize(depth, limit, rowHeight, minRow) {
        depth = Math.max(1, depth);
        if(!(limit > 0) || depth <= limit) return { height: depth * rowHeight, rowHeight };
        let thinner = limit * rowHeight / depth;
        if(thinner >= minRow) return { height: limit * rowHeight, rowHeight: thinner };
        return { height: depth * minRow, rowHeight: minRow };
    }

    // The item of a lane at a time: the band that holds it, or the tick closest to it within "reach" seconds. undefined when none.
    static itemAt(lane, time, reach=0) {
        let items = lane.items, lo = 0, hi = items.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(items[mid].from <= time) lo = mid + 1; else hi = mid; }
        let best = undefined;
        for(let index of [lo - 1, lo]) {
            let item = items[index];
            if(item === undefined) continue;
            if(!item.tick) { if(index === lo - 1 && time < item.to) return item; continue; }
            let distance = Math.abs(item.from - time);
            if(distance <= reach && (best === undefined || distance < Math.abs(best.from - time))) best = item;
        }
        return best;
    }

    // How long the state in force at a time really lasts, whatever the period displayed shows of it: {start, end} (timestamps of
    // the first sample of the run of that text, and of the first sample that says something else: undefined when none does yet).
    // undefined when there is no state at that time.
    static extentOf(entry, time) {
        let stamps = entry.timestamps, texts = entry.data[0];
        let index = ViewTimeline.after(stamps, time) - 1;
        if(index < 0) return undefined;
        let text = String(texts[index]);
        let first = index, next = index + 1;
        while(first > 0 && String(texts[first - 1]) === text) first--;
        while(next < stamps.length && String(texts[next]) === text) next++;
        return { start: stamps[first], end: next < stamps.length ? stamps[next] : undefined };
    }

    // What the threshold of a name asks at a time, to go before the rest of a tip: "above 70 °C, " ("" when it is not known any more)
    static describeLimit(telem, name, time) {
        let threshold = telem ? telem.getThresholds(time).find((t) => t.name === name) : undefined;
        if(threshold === undefined) return "";
        let unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
        return (threshold.operator === TELEPLOT.protocol.THRESHOLD_ABOVE ? "above " : "below ") + threshold.value + (unit ? " " + unit : "") + ", ";
    }

    // "850 ms", "12.3 s", "2 min 05 s", "1 h 02 min"
    static formatDuration(seconds) {
        if(seconds < 1) return Math.round(seconds * 1000) + " ms";
        if(seconds < 60) return (Math.round(seconds * 10) / 10) + " s";
        if(seconds < 3600) return Math.floor(seconds / 60) + " min " + String(Math.floor(seconds % 60)).padStart(2, "0") + " s";
        return Math.floor(seconds / 3600) + " h " + String(Math.floor(seconds % 3600 / 60)).padStart(2, "0") + " min";
    }

    // Ticks of the time axis: {step, splits} with at least minSpace pixels between two of them
    static timeTicks(from, to, width, minSpace=90) {
        const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
        let span = to - from;
        if(!(span > 0) || !(width > 0)) return { step: 1, splits: [] };
        let step = STEPS.find((s) => s / span * width >= minSpace) || 86400 * Math.ceil(span / width * minSpace / 86400);
        let splits = [];
        for(let n = Math.ceil(from / step); n * step <= to && splits.length < 100; n++) splits.push(n * step);
        return { step, splits };
    }

    // ------------------------------------------------------------------ Page

    __attach(element) {
        let host = element.querySelector(".teleplot-js-timeline-canvas");
        if(!host || typeof host.appendChild !== "function") return;
        let canvas = document.createElement("canvas");
        host.appendChild(canvas);
        let page = TELEPLOT.Vue.markRaw({ host, canvas, context: canvas.getContext("2d"), width: 0, height: 0, ratio: 1, laneHeight: 0, gutter: 0, observer: undefined, listeners: [] });
        this.page = page;
        let listen = (target, type, handler) => { target.addEventListener(type, handler); page.listeners.push([target, type, handler]); };
        let position = (event) => { let box = canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
        let drag = undefined;
        listen(canvas, "pointerdown", (event) => {
            if(event.button !== 0) return;
            let at = position(event);
            if(at.x < page.gutter) return;
            drag = { x: at.x };
            try { canvas.setPointerCapture(event.pointerId); } catch(e) {}
        });
        listen(canvas, "pointermove", (event) => {
            let at = position(event);
            if(drag) this.selection = { from: Math.min(drag.x, at.x), to: Math.max(drag.x, at.x) };
            this.__hover(at);
            this.__draw();
        });
        let release = (event) => {
            if(!drag) return;
            let selection = this.selection;
            let pressed = drag;
            drag = undefined;
            this.selection = undefined;
            try { canvas.releasePointerCapture(event.pointerId); } catch(e) {}
            if(selection && selection.to - selection.from >= 4) { // A period was selected: the views of the group are held on it
                let from = this.__timeAt(selection.from), to = this.__timeAt(selection.to);
                if(from < to) TELEPLOT.view.zoomTo(this.group, from, to);
            }
            else if(pressed.x >= page.gutter) TELEPLOT.view.seek(this.group, Math.max(0, this.__timeAt(pressed.x))); // A click: held at that moment
            this.__draw();
        };
        listen(canvas, "pointerup", release);
        listen(canvas, "pointercancel", release);
        listen(canvas, "pointerleave", () => {
            if(drag) return;
            this.tip.shown = false;
            TELEPLOT.view.hoveredGroup = "";
            TELEPLOT.view.pointerLeft(this.group); // (the views show the moment of the group again)
        });
        listen(canvas, "dblclick", () => TELEPLOT.view.backToLive(this.group)); // Back to live, as Esc
        listen(host, "scroll", () => this.__draw()); // (the time axis stays at the bottom of what is visible)
        if(typeof ResizeObserver === "function") { page.observer = new ResizeObserver(() => this.__resize()); page.observer.observe(host); }
        this.__resize();
    }

    __detach() {
        let page = this.page;
        if(!page) return;
        for(let [target, type, handler] of page.listeners) target.removeEventListener(type, handler);
        if(page.observer) page.observer.disconnect();
        page.canvas.remove();
        this.page = undefined;
    }

    __resize() {
        let page = this.page;
        if(!page) return;
        let width = page.host.clientWidth;
        if(!width) return;
        page.width = width;
        this.lastKey = ""; // Laid out and drawn again by the next update
    }

    // Left margin with the names of the lanes
    __gutter() {
        let page = this.page;
        if(!page || !this.options.displayTelemetryName || !this.lanes.length) return 0;
        page.context.font = ViewTimeline.FONT;
        let widest = 0;
        for(let lane of this.lanes) widest = Math.max(widest, page.context.measureText(lane.name).width);
        page.tree = this.__treeWidth();
        return Math.round(Math.min(page.width * 0.3, widest + 14) + page.tree);
    }
    // Width of the tree of the stack lanes, drawn at the right of the names (0 when no lane has more than one row)
    __treeWidth() {
        let depth = -1;
        for(let lane of this.lanes) if(lane.tree && lane.tree.length > 1) for(let row of lane.tree) depth = Math.max(depth, row.depth);
        return depth < 0 ? 0 : ViewTimeline.TREE_STEP * (depth + 1) + 6;
    }
    static TREE_STEP = 9; // Indent of a level in the tree of a stack lane
    static FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    static AXIS = 20;     // Height of the time axis
    static LANE_MIN = 16; // Lanes share the height of the view between these two heights; more lanes than fit: the view scrolls
    static LANE_MAX = 30;
    static LANE_GAP = 4;
    static ROW_MIN = 7;   // The thinnest a row of a stack gets (its texts are not written under 11 pixels: the pointer tells them)

    // Size of the canvas for the lanes there are: the height of the view, or more (then the view scrolls)
    __layout() {
        let page = this.page;
        if(!page || !page.width) return;
        let available = page.host.clientHeight;
        // Lanes share the height of the view. A stack lane counts for as many rows as it opens to (see laneSize)
        let limit = Math.max(0, Number(this.options.stackDepth) || 0);
        let depthOf = (lane) => lane.rows ? Math.max(1, lane.rows.length) : 1;
        let units = 0;
        for(let lane of this.lanes) units += limit > 0 ? Math.min(depthOf(lane), limit) : depthOf(lane);
        let count = Math.max(1, this.lanes.length);
        let laneHeight = Math.max(ViewTimeline.LANE_MIN, Math.min(ViewTimeline.LANE_MAX, Math.floor((available - ViewTimeline.AXIS - ViewTimeline.LANE_GAP * (count + 1)) / Math.max(1, units))));
        let y = ViewTimeline.LANE_GAP;
        for(let lane of this.lanes) {
            let size = lane.rows ? ViewTimeline.laneSize(depthOf(lane), limit, laneHeight, ViewTimeline.ROW_MIN) : { height: laneHeight, rowHeight: laneHeight };
            lane.top = y; lane.height = size.height; lane.rowHeight = size.rowHeight;
            y += size.height + ViewTimeline.LANE_GAP;
        }
        let height = Math.max(available, y + ViewTimeline.AXIS);
        let ratio = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio) || 1, 2);
        page.laneHeight = laneHeight;
        page.gutter = this.__gutter();
        if(page.height !== height || page.ratio !== ratio || page.canvas.width !== Math.floor(page.width * ratio)) {
            page.height = height; page.ratio = ratio;
            page.canvas.width = Math.max(1, Math.floor(page.width * ratio));
            page.canvas.height = Math.max(1, Math.floor(height * ratio));
            page.canvas.style.width = page.width + "px";
            page.canvas.style.height = height + "px";
        }
    }

    __timeAt(x) {
        let page = this.page, plot = Math.max(1, page.width - page.gutter);
        return this.period.from + Math.max(0, Math.min(1, (x - page.gutter) / plot)) * (this.period.to - this.period.from);
    }

    // The pointer is at a place of the canvas: the cursor of the group follows, and what is under it is told
    __hover(at) {
        let page = this.page;
        if(!page || !(this.period.from < this.period.to)) { this.tip.shown = false; return; }
        let tip = this.tip;
        if(at.x < page.gutter) { // The names of the lanes: what each telemetry is (its unit and description)
            let lane = this.lanes.find((candidate) => at.y >= candidate.top && at.y < candidate.top + candidate.height);
            let telem = lane ? TELEPLOT.datastore.getTelemetry(lane.id) : undefined;
            if(!telem) { tip.shown = false; return; }
            let unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
            Object.assign(tip, { name: lane.name, desc: telem.getDescription(), text: unit ? "in " + unit : "", detail: "", flip: false,
                left: Math.round(at.x + page.host.offsetLeft), top: Math.round(at.y - page.host.scrollTop + page.host.offsetTop), shown: true });
            return;
        }
        let time = this.__timeAt(at.x);
        TELEPLOT.view.hoveredGroup = this.group;
        TELEPLOT.view.groups[this.group].cursorTimestamp = time;
        let lane = this.lanes.find((candidate) => at.y >= candidate.top && at.y < candidate.top + candidate.height);
        let row = lane && lane.rows ? Math.min(lane.rows.length - 1, Math.floor((at.y - lane.top) / lane.rowHeight)) : -1; // (of a stack: the level under the pointer)
        let perPixel = (this.period.to - this.period.from) / Math.max(1, page.width - page.gutter);
        let telem = lane ? TELEPLOT.datastore.getTelemetry(lane.id) : undefined;
        tip.desc = telem ? telem.getDescription() : "";
        let item = undefined;
        if(lane && lane.kind === "line") { // A line: the value it has at that time (the last sample at or before it)
            let entry = telem && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER];
            let index = entry ? ViewTimeline.after(entry.timestamps, time) - 1 : -1;
            if(index < 0) { tip.shown = false; return; }
            let unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
            tip.name = lane.name;
            tip.text = String(entry.data[0][index]) + (unit ? " " + unit : "");
            tip.detail = "at " + TELEPLOT.view.ViewLog.formatTime(entry.timestamps[index]);
        }
        else if(lane && lane.calls) { // An action: the call under the pointer
            let call = undefined;
            for(let candidate of lane.calls) if(time >= candidate.from - perPixel * 4 && time <= candidate.to + perPixel * 4) call = candidate;
            if(call === undefined) { tip.shown = false; return; }
            let args = call.args ? Object.keys(call.args).map((name) => name + "=" + TELEPLOT.commands.formatValue("", call.args[name])).join("  ") : "";
            tip.name = lane.name + " #" + call.id;
            tip.text = { ok: "Done", err: "Failed" + (call.text ? ": " + call.text : ""), run: "Running", sent: "Sent", noanswer: "No answer" }[call.status] + (call.status === "ok" && call.text ? ": " + call.text : "") + (args ? " · " + args : "");
            tip.detail = (call.run !== undefined ? "ran from " + TELEPLOT.view.ViewLog.formatTime(call.run) : "sent at " + TELEPLOT.view.ViewLog.formatTime(call.from)) + (call.status === "ok" || call.status === "err" ? (call.run !== undefined ? ", for " + ViewTimeline.formatDuration(call.to - call.run) : "") : "");
        }
        else if(lane && lane.requests && lane.requests.length && at.y < lane.top + 7 && lane.requests.some((r) => Math.abs(r.at - time) <= perPixel * 5)) { // A request of the page
            let request = lane.requests.reduce((best, r) => Math.abs(r.at - time) < Math.abs(best.at - time) ? r : best);
            tip.name = lane.name;
            tip.text = "Asked " + request.target + ": " + ({ pending: "waiting", applied: "applied", kept: "not applied", refused: "refused", noanswer: "no answer" }[request.status] || request.status);
            tip.detail = TELEPLOT.view.ViewLog.formatTime(request.at) + (request.reason ? " · " + request.reason : "");
        }
        else {
        item = lane ? ViewTimeline.itemAt(lane.rows ? { items: lane.rows[row] || [] } : lane, time, perPixel * 5) : undefined;
        if(item === undefined) { tip.shown = false; return; }
        tip.name = lane.name;
        if(item.tick) {
            tip.text = item.text;
            tip.detail = TELEPLOT.view.ViewLog.formatTime(item.from) + (item.count > 1 ? ", and " + (item.count - 1) + " more line" + (item.count > 2 ? "s" : "") + " right after" : "");
        }
        else if(item.mixed) {
            tip.text = item.count + " states too short to be drawn";
            tip.detail = "from " + TELEPLOT.view.ViewLog.formatTime(item.from) + ", in " + ViewTimeline.formatDuration(item.to - item.from) + ": zoom to see them";
        }
        else {
            // (the band is cut to the period displayed: the state itself may have started before, and may last longer)
            let runs = lane.rows ? lane.entries.get(item.node) : lane.runs;
            let extent = (runs && ViewTimeline.extentOf(runs, time)) || { start: item.from, end: item.to };
            let above = lane.rows && item.node.includes("/") ? item.node.split("/").slice(0, -1).map(TELEPLOT.protocol.decodeName).join(" / ") : ""; // (what a node of a stack runs in)
            tip.text = lane.rows ? item.label : item.text;
            tip.detail = (lane.kind === "limits" ? ViewTimeline.describeLimit(telem, item.text, time) : "") + (above !== "" ? "in " + above + ", " : "") + "from " + TELEPLOT.view.ViewLog.formatTime(extent.start) + (extent.end === undefined ? ", still the latest" : ", for " + ViewTimeline.formatDuration(extent.end - extent.start));
        }
        }
        tip.flip = at.x > page.width * 0.6; // (on the right half the tip opens to the left of the pointer)
        tip.left = Math.round(at.x + page.host.offsetLeft);
        tip.top = Math.round(at.y - page.host.scrollTop + page.host.offsetTop);
        tip.shown = true;
    }

    __draw() {
        let page = this.page;
        if(!page || !page.width || !page.height) return;
        let context = page.context, ratio = page.ratio;
        let width = page.width, height = page.height, gutter = page.gutter, plot = Math.max(1, width - gutter);
        let color = (name, fallback) => TELEPLOT.theme.color(name, page.host, fallback);
        let style = { text: color("--teleplot-text", "black"), muted: color("--teleplot-muted", "gray"), grid: color("--teleplot-grid", "rgba(128,128,128,0.2)"), error: color("--teleplot-error", "red"), warn: color("--teleplot-warn", "orange"), ok: color("--teleplot-ok", "green"), primary: color("--teleplot-primary", "blue") };
        let from = this.period.from, to = this.period.to, span = to - from;
        let x = (time) => gutter + (time - from) / span * plot;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        if(!(span > 0)) return;
        context.font = ViewTimeline.FONT;
        context.textBaseline = "middle";

        // Time axis: at the bottom of what is visible (it stays there when the lanes are scrolled), drawn over the lanes at the end
        let axisTop = Math.min(height, page.host.scrollTop + page.host.clientHeight) - ViewTimeline.AXIS;
        let ticks = ViewTimeline.timeTicks(from, to, plot);
        context.strokeStyle = style.grid;
        context.lineWidth = 1;
        context.beginPath();
        for(let split of ticks.splits) { let tx = Math.round(x(split)) + 0.5; context.moveTo(tx, 0); context.lineTo(tx, height); }
        context.stroke();

        // Lanes
        for(let l = 0; l < this.lanes.length; l++) {
            let lane = this.lanes[l];
            let top = lane.top, laneHeight = lane.height, middle = top + Math.min(laneHeight, lane.rowHeight) / 2;
            if(gutter > 0) {
                context.fillStyle = style.muted;
                context.textAlign = "left";
                context.fillText(ViewTimeline.fitText(context, lane.name, gutter - (page.tree || 0) - 10), 2, top + Math.min(laneHeight, page.laneHeight) / 2);
            }
            if(lane.tree && lane.tree.length > 1 && page.tree) { // The tree of a stack: from each row to the row of its parent
                let x0 = gutter - page.tree + 2, step = ViewTimeline.TREE_STEP, mid = (r) => top + r * lane.rowHeight + lane.rowHeight / 2;
                context.strokeStyle = style.muted;
                context.fillStyle = style.muted;
                context.globalAlpha = 0.75;
                context.lineWidth = 1;
                context.beginPath();
                lane.tree.forEach((row, r) => {
                    let lx = Math.round(x0 + row.depth * step) + 0.5;
                    if(row.parent >= 0) {
                        let px = Math.round(x0 + lane.tree[row.parent].depth * step) + 0.5;
                        context.moveTo(px, mid(row.parent) + 2); context.lineTo(px, Math.round(mid(r)) + 0.5); context.lineTo(lx, Math.round(mid(r)) + 0.5);
                    }
                });
                context.stroke();
                lane.tree.forEach((row, r) => { context.beginPath(); context.arc(x0 + row.depth * step + 0.5, mid(r), 1.8, 0, Math.PI * 2); context.fill(); });
                context.globalAlpha = 1;
                context.fillStyle = style.grid;
                lane.tree.forEach((row, r) => { if(row.first) context.fillRect(x0 - 2, top + r * lane.rowHeight - 1, width - x0 + 2, 1); }); // (a new root: another branch)
            }
            context.fillStyle = style.grid; // The lane itself: a hole shows as the lane without band
            context.fillRect(gutter, top, plot, laneHeight);
            if(lane.line && lane.line.timestamps.length) { // A number: straight segments between its samples, inside its lane
                let line = lane.line, pad = 3, room = laneHeight - 2 * pad, flat = !(line.max > line.min);
                let y = (value) => flat ? middle : top + pad + (1 - Math.max(-1, Math.min(2, (value - line.min) / (line.max - line.min)))) * room;
                context.save();
                context.beginPath();
                context.rect(gutter, top, plot, laneHeight);
                context.clip();
                context.beginPath();
                for(let i = 0; i < line.timestamps.length; i++) {
                    if(i === 0) context.moveTo(x(line.timestamps[i]), y(line.values[i]));
                    else context.lineTo(x(line.timestamps[i]), y(line.values[i]));
                }
                context.strokeStyle = lane.color;
                context.lineWidth = 1.5;
                context.lineJoin = "round";
                context.stroke();
                if(line.timestamps.length === 1) { context.fillStyle = lane.color; context.fillRect(x(line.timestamps[0]) - 1.5, y(line.values[0]) - 1.5, 3, 3); } // (a lone sample is a dot)
                context.restore();
            }
            // An action: a band per call, from its "run" to its end, a dotted line before (the call travelling, or waiting)
            if(lane.calls) for(let call of lane.calls) {
                let left = Math.max(gutter, x(call.from)), runX = call.run !== undefined ? Math.max(gutter, x(call.run)) : undefined;
                let right = Math.min(width, x(call.to));
                let paint = call.status === "ok" ? "#1e9e5a" : (call.status === "err" || call.status === "noanswer" ? style.error : style.primary);
                context.strokeStyle = style.muted;
                context.fillStyle = style.muted;
                if(runX !== undefined && runX > left + 1) {
                    context.setLineDash([2, 2]); context.beginPath(); context.moveTo(left, middle); context.lineTo(runX, middle); context.stroke(); context.setLineDash([]);
                }
                context.beginPath(); context.arc(left, middle, 2.5, 0, Math.PI * 2); context.fill();
                if(runX === undefined) { // Never started: the call alone (no answer, or still on its way)
                    if(call.status === "noanswer" || call.status === "err") { context.strokeStyle = paint; context.lineWidth = 1.5; context.strokeRect(left - 3, top + 3, 6, laneHeight - 6); context.lineWidth = 1; }
                    continue;
                }
                let bandWidth = Math.max(2, right - runX);
                context.fillStyle = paint;
                context.globalAlpha = call.status === "run" ? 0.2 : 0.35;
                context.fillRect(runX, top, bandWidth, laneHeight);
                context.globalAlpha = 1;
                if(call.status === "run") { // Still running: hatched
                    context.save(); context.beginPath(); context.rect(runX, top, bandWidth, laneHeight); context.clip();
                    context.strokeStyle = paint; context.globalAlpha = 0.5;
                    for(let hx = runX - laneHeight; hx < runX + bandWidth; hx += 6) { context.beginPath(); context.moveTo(hx, top + laneHeight); context.lineTo(hx + laneHeight, top); context.stroke(); }
                    context.restore();
                }
                context.fillStyle = paint;
                context.fillRect(runX, top, Math.min(2, bandWidth), laneHeight);
                let label = (call.status === "ok" ? "✓ " : call.status === "err" ? "✕ " : "") + ViewTimeline.formatDuration(call.to - call.run) + (call.status === "run" ? "…" : "");
                if(bandWidth > 30 && laneHeight >= 11) { context.fillStyle = style.text; context.textAlign = "left"; context.fillText(ViewTimeline.fitText(context, label, bandWidth - 8), runX + 5, top + laneHeight / 2 + 0.5); }
                else if(call.status !== "run") { context.fillStyle = paint; context.textAlign = "left"; context.fillText(label, Math.min(width - 40, runX + bandWidth + 4), top + laneHeight / 2 + 0.5); }
            }
            // Requests of the page on a setting: a small triangle at the top of its lane (filled: applied or waiting; hollow: not applied, refused)
            if(lane.requests) for(let request of lane.requests) {
                let tx = x(request.at);
                if(tx < gutter) continue;
                let hollow = request.status === "kept" || request.status === "refused" || request.status === "noanswer";
                let paint = request.status === "kept" ? style.warn : (hollow ? style.error : style.primary);
                context.beginPath(); context.moveTo(tx - 4, top); context.lineTo(tx + 4, top); context.lineTo(tx, top + 6); context.closePath();
                if(hollow) { context.strokeStyle = paint; context.lineWidth = 1.5; context.stroke(); context.lineWidth = 1; }
                else { context.fillStyle = paint; context.fill(); }
            }
            // Bands and ticks: of the lane, or of each row of a stack (thin rows are not written in: the pointer tells them)
            let rows = lane.rows || [lane.items];
            for(let r = 0; r < rows.length; r++) {
                let rowTop = top + r * lane.rowHeight, rowHeight = lane.rows ? Math.max(1, lane.rowHeight - (lane.rowHeight >= 10 ? 1 : 0)) : laneHeight;
                for(let item of rows[r]) {
                    let left = Math.max(gutter, x(item.from));
                    if(item.tick) {
                        let paint = item.color;
                        context.fillStyle = paint === "error" || paint === "warn" || paint === "ok" ? style[paint] : style.text;
                        context.globalAlpha = paint === "error" || paint === "warn" || paint === "ok" ? 1 : 0.6;
                        context.fillRect(Math.round(left) - (item.count > 1 ? 1 : 0), rowTop, item.count > 1 ? 3 : 1, rowHeight);
                        context.globalAlpha = 1;
                        continue;
                    }
                    let right = Math.min(width, x(item.to)), bandWidth = Math.max(1, right - left);
                    if(item.mixed) { // Several states in a couple of pixels: none of them is drawn, the block says there is more to see
                        context.fillStyle = style.muted;
                        context.globalAlpha = 0.55;
                        context.fillRect(left, rowTop + rowHeight * 0.25, bandWidth, rowHeight * 0.5);
                        context.globalAlpha = 1;
                        continue;
                    }
                    let paint = style[item.color] || item.color; // (a word of the theme, or a color of the palette)
                    context.fillStyle = paint;
                    context.globalAlpha = 0.32;
                    context.fillRect(left, rowTop, bandWidth, rowHeight);
                    context.globalAlpha = 1;
                    if(item.from > from) context.fillRect(left, rowTop, Math.min(2, bandWidth), rowHeight); // Where the state starts: a sample
                    if(bandWidth > 22 && rowHeight >= 11) {
                        context.fillStyle = style.text;
                        context.textAlign = "left";
                        context.fillText(ViewTimeline.fitText(context, item.label !== undefined ? item.label : item.text, bandWidth - 10), left + 6, rowTop + rowHeight / 2 + 0.5);
                    }
                }
            }
        }

        // The axis, over what was scrolled under it
        let labels = TELEPLOT.view.ViewChart.formatTimeTicks(null, ticks.splits, 0, 0, ticks.step);
        context.clearRect(0, axisTop, width, height - axisTop);
        context.fillStyle = style.muted;
        context.font = TELEPLOT.view.ViewChart.AXIS_FONT;
        context.textAlign = "center";
        for(let i = 0; i < ticks.splits.length; i++) {
            let tx = Math.round(x(ticks.splits[i])) + 0.5;
            let half = context.measureText(labels[i]).width / 2;
            if(tx - half >= gutter && tx + half <= width) context.fillText(labels[i], tx, axisTop + 11);
        }
        context.font = ViewTimeline.FONT;

        // Cursor of the group, selection being dragged
        let cursor = TELEPLOT.view.groups[this.group].cursorTimestamp;
        if(cursor >= from && cursor <= to) {
            context.fillStyle = style.text;
            context.globalAlpha = 0.7;
            context.fillRect(Math.round(x(cursor)), 0, 1, axisTop);
            context.globalAlpha = 1;
        }
        if(this.selection) {
            context.fillStyle = style.primary;
            context.globalAlpha = 0.18;
            context.fillRect(this.selection.from, 0, this.selection.to - this.selection.from, axisTop);
            context.globalAlpha = 1;
        }
    }

    // A text cut to a width, with an ellipsis ("" when not even a letter fits)
    static fitText(context, text, width) {
        if(context.measureText(text).width <= width) return text;
        let lo = 0, hi = text.length;
        while(lo < hi) { let mid = (lo + hi + 1) >> 1; if(context.measureText(text.slice(0, mid) + "…").width <= width) lo = mid; else hi = mid - 1; }
        return lo > 0 ? text.slice(0, lo) + "…" : "";
    }

    static vueHTML = `
        <div class="teleplot-js-timeline-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}>
            <div class="teleplot-js-timeline-canvas"></div>
            <div v-if="tip.shown" class="teleplot-js-timeline-tip" v-bind:class="{'teleplot-js-timeline-tip-flip': tip.flip}" v-bind:style="{ left: tip.left + 'px', top: tip.top + 'px' }">
                <div class="teleplot-js-timeline-tip-name">{{tip.name}}</div>
                <div v-if="tip.desc" class="teleplot-js-timeline-tip-desc">{{tip.desc}}</div>
                <div class="teleplot-js-timeline-tip-text">{{tip.text}}</div>
                <div class="teleplot-js-timeline-tip-detail">{{tip.detail}}</div>
            </div>
            <div v-if="emptyState.text" class="teleplot-js-empty">
                <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
                <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
            </div>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-timeline-container {
                position: relative;
                width: 100%;
                height: 100%;
                min-height: calc(4em * var(--layout-height, 1));
                padding: 0;
                overflow: hidden;
            }
            .teleplot-js-timeline-canvas { /* Out of the flow: lanes never make the view grow, it scrolls when there are too many */
                position: absolute;
                inset: 0.4em 0.6em 0.2em 0.6em;
                overflow-x: hidden;
                overflow-y: auto;
                scrollbar-width: thin;
            }
            .teleplot-js-has-title .teleplot-js-timeline-canvas { top: 2.2em; }
            .teleplot-js-timeline-canvas canvas { display: block; cursor: crosshair; touch-action: pan-y; }
            .teleplot-js-timeline-tip {
                position: absolute; z-index: 5; margin: 1.4em 0 0 1.3em; max-width: min(24em, 70%); pointer-events: none;
                padding: 0.35em 0.6em; border-radius: 6px; font-size: 0.8em; line-height: 1.35;
                background: var(--teleplot-surface); border: 1px solid var(--teleplot-line); box-shadow: 0 4px 14px rgba(0,0,0,0.22);
            }
            .teleplot-js-timeline-tip-flip { transform: translateX(-100%); margin-left: 0.2em; }
            .teleplot-js-timeline-tip-name, .teleplot-js-timeline-tip-detail { color: var(--teleplot-muted); }
            .teleplot-js-timeline-tip-desc { margin-bottom: 0.15em; font-style: italic; overflow-wrap: anywhere; }
            .teleplot-js-timeline-tip-text { font-weight: 650; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; }
        }
    `;
}

TELEPLOT.view.ViewTimeline = ViewTimeline;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewTimeline.vueCSS;
    document.head.appendChild(elem);
}
