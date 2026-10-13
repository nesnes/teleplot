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
 *   a telemetry are told apart; texts that look like errors or warnings take the colors of the theme for them, as in the Log view.
 * What is drawn is first computed without any canvas (buildLane, getTimeWindow): that part is tested.
 */
class ViewTimeline extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "timeline";
        this.type = "teleplot-timeline";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
        this.supportedLabel = "text";

        this.options.displayTelemetryName = true; // Name of each lane, on its left

        this.layout.width = 2;
        this.layout.height = 2;

        // What is drawn (raw: read on every draw): [{id, name, isLog, items: see buildLane}], and the period it covers
        this.lanes = TELEPLOT.Vue.markRaw([]);
        this.period = TELEPLOT.Vue.markRaw({ from: 0, to: 0 });
        this.colors = TELEPLOT.Vue.markRaw(new Map()); // Text -> index of its color, in the order texts showed up (see colorOf)
        this.lastKey = "";
        this.lastCursor = -2;
        this.page = undefined;      // Canvas and listeners, once mounted
        this.selection = undefined; // Drag in progress: {from, to} in pixels of the plot
        this.tip = TELEPLOT.Vue.reactive({ shown: false, left: 0, top: 0, flip: false, name: "", text: "", detail: "" }); // What is under the pointer
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
        return [{ key: "displayTelemetryName", label: "Telemetry names", type: "bool" }];
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
        if(level) return level == 2 ? "error" : "warn";
        let index = known ? known.get(text) : undefined;
        if(index === undefined) {
            if(known && known.size < ViewTimeline.COLOR_MEMORY) { index = known.size; known.set(text, index); }
            else { index = 5381; for(let i = 0; i < text.length; i++) index = ((index * 33) ^ text.charCodeAt(i)) >>> 0; }
        }
        return TELEPLOT.colors.palette[ViewTimeline.PALETTE[index % ViewTimeline.PALETTE.length]].toStrRGB();
    }
    static PALETTE = [1, 2, 4, 3, 5, 6, 0, 10, 11, 12, 13, 7]; // Colors of the palette that are told apart, blue first (red last: it reads as an alarm)
    static COLOR_MEMORY = 500;

    // Text entries of the telemetries of the view, in the order of its list: [{telem, entry}]
    getSources() {
        let sources = [];
        for(let telemIdOrName of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            let entry = telem && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
            if(entry === undefined || sources.some((source) => source.telem.id === telem.id)) continue;
            sources.push({ telem, entry });
        }
        return sources;
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
        // The latest state gets some room at the end: when it just showed up and nothing else makes time pass, it would have no
        // width at all, and it is the one people look for. (The axis tells what time that is: nothing is said to have happened there.)
        let room = (to - from) * ViewTimeline.LATEST_ROOM;
        for(let { telem, entry } of this.getSources()) {
            let last = entry.timestamps.length - 1;
            if(last < 0 || telem.getAttribute(P.TELEM_ATTR_LOG) === true || String(entry.data[0][last]) === "") continue;
            let extent = ViewTimeline.extentOf(entry, entry.timestamps[last]);
            if(extent !== undefined && extent.start + room > to) to = extent.start + room;
        }
        let dataWindow = TELEPLOT.state.dataTimeout;
        if(dataWindow > 0 && to - from > dataWindow) from = to - dataWindow; // (a state kept from before the window is shown from where the window starts)
        return { from, to };
    }
    static TIME_TYPES = [20, 21, 22, 23]; // Numbers (1, 2 or 3 of them) and texts: what is sent as time passes
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
        let key = (period ? period.from + "," + period.to : "none") + "|" + width + "|" + (this.page ? this.page.width + "x" + this.page.height : "") + "|" + TELEPLOT.theme.key() + "|" + (this.options.displayTelemetryName ? 1 : 0);
        for(let { telem, entry } of sources) key += `|${telem.id}:${entry.lastUpdate}:${entry.timestamps.length}:${telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME)}:${telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) === true ? 1 : 0}`;
        let cursor = TELEPLOT.view.groups[this.group].cursorTimestamp;
        if(key === this.lastKey && cursor === this.lastCursor && !this.selection) return;
        if(key !== this.lastKey) {
            this.lastKey = key;
            this.period.from = period ? period.from : 0;
            this.period.to = period ? period.to : 0;
            let minDuration = period ? (period.to - period.from) / width * ViewTimeline.MIN_PIXELS : 0;
            this.lanes.length = 0;
            for(let { telem, entry } of sources) {
                let isLog = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) === true;
                let lane = {
                    id: telem.id, isLog,
                    name: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id),
                    items: period ? ViewTimeline.buildLane(isLog ? entry : TELEPLOT.textRuns(entry), isLog, period.from, period.to, minDuration) : [] // (a state: its runs, the same text sent again is nothing new)
                };
                for(let item of lane.items) if(!item.mixed) item.color = ViewTimeline.colorOf(item.text, isLog ? undefined : this.colors); // (a log line only has a color when it is an error or a warning)
                this.lanes.push(lane);
            }
            this.__layout();
        }
        this.lastCursor = cursor;
        this.__draw();
    }
    static MIN_PIXELS = 2; // What is narrower than this cannot be drawn as it is

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
            drag = undefined;
            this.selection = undefined;
            try { canvas.releasePointerCapture(event.pointerId); } catch(e) {}
            if(selection && selection.to - selection.from >= 4) { // A period was selected: the views of the group zoom on it
                let group = TELEPLOT.view.groups[this.group];
                let from = this.__timeAt(selection.from), to = this.__timeAt(selection.to);
                if(from < to) { group.timestampFrom = from; group.timestampTo = to; group.cursorActive = true; }
            }
            this.__draw();
        };
        listen(canvas, "pointerup", release);
        listen(canvas, "pointercancel", release);
        listen(canvas, "pointerleave", () => {
            if(drag) return;
            this.tip.shown = false;
            TELEPLOT.view.hoveredGroup = "";
            if(!TELEPLOT.view.groups[this.group].cursorActive) TELEPLOT.view.groups[this.group].cursorTimestamp = -1; // (while zoomed the cursor stays where it was last, as on charts)
        });
        listen(canvas, "dblclick", () => TELEPLOT.view.backToLive(this.group));
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
        return Math.round(Math.min(page.width * 0.3, widest + 14));
    }
    static FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    static AXIS = 20;     // Height of the time axis
    static LANE_MIN = 16; // Lanes share the height of the view between these two heights; more lanes than fit: the view scrolls
    static LANE_MAX = 30;
    static LANE_GAP = 4;

    // Size of the canvas for the lanes there are: the height of the view, or more (then the view scrolls)
    __layout() {
        let page = this.page;
        if(!page || !page.width) return;
        let available = page.host.clientHeight;
        let count = Math.max(1, this.lanes.length);
        let laneHeight = Math.max(ViewTimeline.LANE_MIN, Math.min(ViewTimeline.LANE_MAX, Math.floor((available - ViewTimeline.AXIS - ViewTimeline.LANE_GAP) / count) - ViewTimeline.LANE_GAP));
        let height = Math.max(available, count * (laneHeight + ViewTimeline.LANE_GAP) + ViewTimeline.LANE_GAP + ViewTimeline.AXIS);
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
        if(!page || !(this.period.from < this.period.to) || at.x < page.gutter) { this.tip.shown = false; return; }
        let time = this.__timeAt(at.x);
        TELEPLOT.view.hoveredGroup = this.group;
        TELEPLOT.view.groups[this.group].cursorTimestamp = time;
        let index = Math.floor((at.y - ViewTimeline.LANE_GAP / 2) / (page.laneHeight + ViewTimeline.LANE_GAP));
        let lane = this.lanes[index];
        let perPixel = (this.period.to - this.period.from) / Math.max(1, page.width - page.gutter);
        let item = lane ? ViewTimeline.itemAt(lane, time, perPixel * 5) : undefined;
        if(item === undefined) { this.tip.shown = false; return; }
        let tip = this.tip;
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
            let telem = TELEPLOT.datastore.getTelemetry(lane.id);
            let entry = telem && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
            let extent = (entry && ViewTimeline.extentOf(entry, time)) || { start: item.from, end: item.to };
            tip.text = item.text;
            tip.detail = "from " + TELEPLOT.view.ViewLog.formatTime(extent.start) + (extent.end === undefined ? ", still the latest" : ", for " + ViewTimeline.formatDuration(extent.end - extent.start));
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
        let style = { text: color("--teleplot-text", "black"), muted: color("--teleplot-muted", "gray"), grid: color("--teleplot-grid", "rgba(128,128,128,0.2)"), error: color("--teleplot-error", "red"), warn: color("--teleplot-warn", "orange"), primary: color("--teleplot-primary", "blue") };
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
        let laneHeight = page.laneHeight;
        for(let l = 0; l < this.lanes.length; l++) {
            let lane = this.lanes[l];
            let top = ViewTimeline.LANE_GAP + l * (laneHeight + ViewTimeline.LANE_GAP), middle = top + laneHeight / 2;
            if(gutter > 0) {
                context.fillStyle = style.muted;
                context.textAlign = "left";
                context.fillText(ViewTimeline.fitText(context, lane.name, gutter - 10), 2, middle);
            }
            context.fillStyle = style.grid; // The lane itself: a hole shows as the lane without band
            context.fillRect(gutter, top, plot, laneHeight);
            for(let item of lane.items) {
                let left = Math.max(gutter, x(item.from));
                if(item.tick) {
                    let paint = item.color;
                    context.fillStyle = paint === "error" ? style.error : (paint === "warn" ? style.warn : style.text);
                    context.globalAlpha = paint === "error" || paint === "warn" ? 1 : 0.6;
                    context.fillRect(Math.round(left) - (item.count > 1 ? 1 : 0), top, item.count > 1 ? 3 : 1, laneHeight);
                    context.globalAlpha = 1;
                    continue;
                }
                let right = Math.min(width, x(item.to)), bandWidth = Math.max(1, right - left);
                if(item.mixed) { // Several states in a couple of pixels: none of them is drawn, the block says there is more to see
                    context.fillStyle = style.muted;
                    context.globalAlpha = 0.55;
                    context.fillRect(left, top + laneHeight * 0.25, bandWidth, laneHeight * 0.5);
                    context.globalAlpha = 1;
                    continue;
                }
                let paint = item.color === "error" ? style.error : (item.color === "warn" ? style.warn : item.color);
                context.fillStyle = paint;
                context.globalAlpha = 0.32;
                context.fillRect(left, top, bandWidth, laneHeight);
                context.globalAlpha = 1;
                if(item.from > from) context.fillRect(left, top, Math.min(2, bandWidth), laneHeight); // Where the state starts: a sample
                if(bandWidth > 22) {
                    context.fillStyle = style.text;
                    context.textAlign = "left";
                    context.fillText(ViewTimeline.fitText(context, item.text, bandWidth - 10), left + 6, middle + 0.5);
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
