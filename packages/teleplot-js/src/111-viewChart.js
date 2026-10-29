class ViewChart extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "chart";
        this.type = "teleplot-chart";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.updateForced = true; // Force initial update
        this.updateRunning = false;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER];
        this.supportedLabel = "number";
        // What can be added to the chart: numbers (its series) and texts (marks on them, see buildOverlay)
        this.acceptedDataTypes = [...this.supportedDataTypes, ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
        this.setOption("decimation", true); // Only give the chart what it can display (see MinMaxDecimator), stored data is untouched
        this.setOption("thresholds", "fit"); // Thresholds of the series: "fit" (drawn, and the scale keeps them in view), "show" (drawn when they are in view), "hide"
        this.setOption("scale", "auto");     // Vertical scale: "auto" (fits what is drawn) or "range" (the range of the telemetries, TELEM_ATTR_RANGE, when they have one)
        // What is drawn over the series, computed by update() for the period displayed (raw: read on every draw):
        //   thresholds: [{id, lines: see Telemetry.getThresholdSteps}]   marks: [{id, color, marks: see ViewChart.buildMarks}]
        this.overlay = TELEPLOT.Vue.markRaw({ thresholds: [], marks: [] });
        this.overlayKey = "";
        this.decimators = TELEPLOT.Vue.markRaw({}); // One MinMaxDecimator per telemetry id. Not reactive: a proxied decimator never recognises its source (raw) and rescans all the data on every update
        this.lastDisplayRange = "";         // Time range and resolution used to build chartData, to detect a need for update

        // Vue data
        this.telemetries = TELEPLOT.Vue.reactive({});
        this.displayOrder = TELEPLOT.Vue.reactive([]); // see syncDisplayOrder
        this.chartDivId = "teleplot-chart-"+crypto.randomUUID();
        this.chartData = TELEPLOT.Vue.markRaw([]); // Not reactive: uPlot reads it all the time, proxies would slow it down
        this.chart = TELEPLOT.Vue.reactive({});
        this.chartOptions = TELEPLOT.Vue.reactive({});

        // Legend: entries that don't fit are folded behind a "+N" chip, which opens the list of all the series (a ViewCurrentValue)
        this.hidden = TELEPLOT.Vue.reactive({});   // { telemetryId: true } series switched off by a click on their legend entry (shared with the list)
        this.legend = TELEPLOT.Vue.reactive({ visible: Infinity, folded: 0, open: false });
        this.popoverDivId = "teleplot-chart-popover-"+crypto.randomUUID();
        this.popoverView = undefined;
        this.legendKey = "";
        this.valueChars = {};                      // Width (characters) of the value slot of each legend entry: only grows, so entries never shake
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    chartDivId: self.chartDivId,
                    chartOptions: self.chartOptions,
                    chartData: self.chartData,
                    chart: self.chart,
                    telemetries : self.telemetries,
                    displayOrder: self.displayOrder,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext,
                    emptyState: self.emptyState,
                    legend: self.legend,
                    hidden: self.hidden,
                    popoverDivId: self.popoverDivId
                }
            },
            computed: {
                ordered() { return this.displayOrder.map((id) => this.telemetries[id]).filter(Boolean); }
            },
            methods: {
                onLegendClick: (id) => self.toggleSeries(id),
                onLegendEnter: (id) => self.highlightSeries(id),
                onLegendLeave: () => self.highlightSeries(undefined),
                onLegendMore: () => self.toggleLegendList(),
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop
            },
            template: ViewChart.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);

        // Create uPlot chart
        this.createChart();
    }
    
    dispose() {
        this.closeLegendList();
        this.destroyChart();
        this.updateForced = true;
        super.dispose();
    }

    // Texts are marks on the curves of numbers: a chart that only has texts says what it is missing
    getEmptyState() {
        let state = super.getEmptyState();
        if(state.text === "Nothing to display" && this.getMarkTelemetries().length) return { text: "No number to chart", hint: "Text telemetries are drawn as marks on the curves: add a number telemetry" };
        return state;
    }

    getOptionsSchema() {
        return [...super.getOptionsSchema(), { key: "decimation", label: "Decimation", type: "bool" },
            { key: "thresholds", label: "Thresholds", type: "choice", choices: [["fit", "In view"], ["show", "If in view"], ["hide", "Hidden"]] }, // (kept in view by the scale / drawn when the scale has them in view)
            { key: "scale", label: "Scale", type: "choice", choices: [["auto", "Auto"], ["range", "Range"]] }]; // (fits what is drawn / the range of the telemetries)
    }

    destroyChart() {
        if(this.chart && this.chart.destroy) this.chart.destroy();
        this.chart = {}; // A destroyed chart must not be resized or drawn any more (a redraw would still be queued)
    }

    // Index of a telemetry's series in the chart (0 is the time axis), -1 when it has none
    seriesIndexOf(id) {
        return this.getSeriesTelemetries().findIndex(t => t.id == id) + 1 || -1;
    }

    // Shows or hides the series of a telemetry (click on its legend entry or its row of the list)
    toggleSeries(id) {
        if(this.hidden[id]) delete this.hidden[id]; else this.hidden[id] = true;
        let idx = this.seriesIndexOf(id);
        if(idx > 0 && this.chart && this.chart.setSeries) this.chart.setSeries(idx, { show: !this.hidden[id] });
        this.updateForced = true; // Its thresholds, or its marks when it is a text telemetry, go with it
        this.highlightSeries(this.hidden[id] ? undefined : id); // The pointer is still on the entry: a series that is back is highlighted, one switched off has nothing to highlight
    }

    // Draws the series of a telemetry over the others (hover on its legend entry or row), no id: back to normal
    highlightSeries(id) {
        if(!this.chart || !this.chart.setSeries) return;
        let idx = id === undefined ? -1 : this.seriesIndexOf(id);
        if(idx > 0 && this.hidden[id]) idx = -1; // A switched off series has nothing to highlight
        this.chart.setSeries(idx > 0 ? idx : null, { focus: idx > 0 });
    }

    // Which legend entries fit in the legend row: the others are folded (still measurable, out of the flow) and counted by the "+N" chip
    layoutLegend() {
        let legendEl = document.getElementById(this.chartDivId);
        legendEl = legendEl && legendEl.parentElement && legendEl.parentElement.querySelector(".teleplot-js-chart-legend");
        if(!legendEl) return;
        let { visible, folded } = ViewChart.fitLegend(legendEl);
        if(this.legend.visible !== visible) this.legend.visible = visible;
        if(this.legend.folded !== folded) this.legend.folded = folded;
        if(!folded && this.legend.open) this.closeLegendList();
    }

    // How many entries of a legend row (a ".teleplot-js-chart-legend" element) fit in its width, and how many do not: {visible, folded}.
    // Shared by the views that have such a legend (the markup and its style are the chart's).
    static fitLegend(legendEl) {
        let blocks = Array.from(legendEl.querySelectorAll(":scope > .teleplot-js-chart-legend-block"));
        let style = getComputedStyle(legendEl);
        let gap = parseFloat(style.columnGap) || 0;
        let chip = legendEl.querySelector(".teleplot-js-chart-legend-more");
        let chipWidth = (chip ? chip.offsetWidth : 0) || parseFloat(style.fontSize) * 4; // Not rendered yet: a "+99 v" chip is about 4em
        let widths = blocks.map(b => b.offsetWidth);
        let total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
        let room = legendEl.clientWidth;
        let visible = widths.length;
        if(total > room) {
            visible = 0;
            let used = chipWidth + gap;
            for(let w of widths) {
                if(used + w > room) break;
                used += w + gap;
                visible++;
            }
        }
        return { visible, folded: widths.length - visible };
    }

    toggleLegendList() {
        if(this.legend.open) this.closeLegendList(); else this.openLegendList();
    }

    // List of all the series: a ViewCurrentValue on a popover, a row per telemetry that scrolls when there is not enough height
    openLegendList() {
        let host = document.getElementById(this.popoverDivId);
        if(!host || this.popoverView) return;
        this.legend.open = true;
        let list = new TELEPLOT.view.ViewCurrentValue(this.popoverDivId, this.getSeriesTelemetries().map(t => t.id), this.group);
        list.options.displayNumberDecimals = this.options.displayNumberDecimals;
        list.options.displayScale = false; // (a list of series: rows stay short)
        list.commandsUI = false; // (a list to pick series from: nothing is edited there)
        list.dimmed = this.hidden;
        list.rowHandlers = { click: (id) => this.toggleSeries(id), enter: (id) => this.highlightSeries(id), leave: () => this.highlightSeries(undefined) };
        this.popoverView = list;
        this.popoverKey = this.seriesKey;
        this.updateLegendList();
        this.outsideHandler = (e) => {
            let path = e.composedPath ? e.composedPath() : [];
            if(path.includes(host) || path.some(n => n.classList && n.classList.contains("teleplot-js-chart-legend-more"))) return;
            this.closeLegendList();
        };
        this.keyHandler = (e) => { if(e.key === "Escape") this.closeLegendList(); };
        document.addEventListener("pointerdown", this.outsideHandler, true);
        document.addEventListener("keydown", this.keyHandler, true);
    }

    closeLegendList() {
        if(this.outsideHandler) document.removeEventListener("pointerdown", this.outsideHandler, true);
        if(this.keyHandler) document.removeEventListener("keydown", this.keyHandler, true);
        this.outsideHandler = this.keyHandler = undefined;
        if(this.popoverView) {
            this.popoverView.dispose();
            this.popoverView = undefined;
            this.highlightSeries(undefined);
            let host = document.getElementById(this.popoverDivId);
            if(host) { host.removeAttribute("v-pre"); host.innerHTML = ""; } // Else the list would not mount again on the next opening
        }
        this.legend.open = false;
    }

    // Keeps the opened list in line with the chart: same telemetries, same height limit
    updateLegendList() {
        let list = this.popoverView;
        if(!list) return;
        if(this.popoverKey !== this.seriesKey) {
            this.popoverKey = this.seriesKey;
            let ids = this.getSeriesTelemetries().map(t => t.id);
            list.telemetryIdOrNameList = ids;
            for(let id of Object.keys(list.telemetries)) if(!ids.includes(Number(id)) && !ids.includes(id)) delete list.telemetries[id];
        }
        let host = document.getElementById(this.popoverDivId);
        let root = host && host.parentElement;
        if(root) {
            let max = Math.max(60, root.clientHeight - host.offsetTop - 8) + "px"; // What is left under the legend
            if(host.style.getPropertyValue("--pop-max") !== max) host.style.setProperty("--pop-max", max);
        }
        list.update();
    }

    // Telemetries that have a series in the chart, in series order (the order of the joined chartData).
    // A telemetry only counts once it has data of a supported type: the list changes when data shows up or a telemetry is dropped on the view.
    getSeriesTelemetries() {
        let list = [];
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined || this.getSupportedDataEntry(telem) === undefined) continue;
            list.push(telem);
        }
        return list;
    }
    
    static AXIS_FONT = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    // Labels of the time axis: HH:MM:SS, with decimals when ticks are closer than a second, HH:MM from a minute, the day when the range is long.
    // One format for the whole axis (uPlot's default mixes ":07.000" and ":08", and writes the date on a second line)
    static formatTimeTicks(u, splits, axisIdx, foundSpace, foundIncr) {
        if(!splits.length) return [];
        const pad = (n, l = 2) => String(n).padStart(l, "0");
        let range = splits[splits.length - 1] - splits[0];
        let decimals = foundIncr >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(foundIncr)));
        let withDay = range >= 86400;
        return splits.map((s) => {
            let d = new Date(s * 1000);
            let text = pad(d.getHours()) + ":" + pad(d.getMinutes());
            if(foundIncr < 60) text += ":" + pad(d.getSeconds()) + (decimals ? "." + pad(d.getMilliseconds(), 3).slice(0, decimals) : "");
            return withDay ? pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + text : text;
        });
    }

    createChart() {
        let themed = (name) => () => TELEPLOT.theme.color(name, document.getElementById(this.chartDivId));
        // Default options
        this.chartOptions = {
            title: "",
            width: undefined,
            height: undefined,
            // Without data uPlot has no range to lay the axes out and throws while drawing: give empty charts a default one
            scales: {
                x: { time: true, range: (u, min, max) => (min == null || max == null) ? [Date.now() / 1000 - 10, Date.now() / 1000] : [min, max] },
                y: { range: (u, min, max) => this.getScaleRange(min, max) }
            },
            series: [ {} ],
            // Colors come from the theme (--teleplot-*) and are read on every draw, so light and dark both work
            axes: [
                { gap: 2, size: 26, space: 80, font: ViewChart.AXIS_FONT, stroke: themed("--teleplot-muted"), values: ViewChart.formatTimeTicks,
                  grid: { stroke: themed("--teleplot-grid"), width: 1 }, ticks: { show: true, size: 3, stroke: themed("--teleplot-grid"), width: 1 } },
                { space: 24, gap: 3, font: ViewChart.AXIS_FONT, stroke: themed("--teleplot-muted"),
                  grid: { stroke: themed("--teleplot-grid"), width: 1 }, ticks: { show: true, size: 3, stroke: themed("--teleplot-grid"), width: 1 } }
            ],
            focus: { alpha: 0.25, }, // Series drawn behind the one highlighted from the legend
            cursor: {
                lock: false,
                focus: { prox: -1, }, // Highlight comes from the legend only, not from the cursor getting close to a line
                //sync: { key: window.cursorSync.key,  setSeries: true }
            },
            legend: { show: false },
            hooks: {
                drawClear: [ (u) => { this.drawThinned(u); this.drawNotReceived(u); } ], // Under the grid and the series
                draw: [ (u) => this.drawOverlay(u) ],      // Over them: thresholds and marks
                setCursor: [
                    (u) => {
                        if(this.updateRunning) return;
                        // Mouse leave: the views of the group show its moment again (the latest data when live, else the moment it is held at)
                        if(u.cursor.left < 0) {
                            TELEPLOT.view.pointerLeft(this.group);
                            return;
                        }
                        // Mouse hover
                        const idx = u.posToIdx(u.cursor.left);
                        if (idx != null) {
                            // (beyond the last number, where marks widened the chart: the time pointed at, so that the views show what was then)
                            const times = u.data[0], at = u.posToVal(u.cursor.left, "x");
                            TELEPLOT.view.groups[this.group].cursorTimestamp = times.length && at > times[times.length - 1] ? at : times[idx];
                        }
                        }
                ],
                setScale: [
                    (u, key) => {
                        if(this.updateRunning) return;
                        if(key != "x") return;
                        const s = u.scales[key];
                        // Zoom reset (double click: uPlot goes back to all its data): back to live, as Esc (doc/time.md)
                        const times = u.data && u.data[0];
                        if(times && times.length && s.min <= times[0] && s.max >= times[times.length - 1]) {
                            TELEPLOT.view.backToLive(this.group);
                            this.updateForced = true; // (uPlot went back to the extent of the numbers: the marks widen it again)
                            return;
                        }
                        // A period selected: the group is held on it (a live window would slide the selection away)
                        TELEPLOT.view.zoomTo(this.group, s.min, s.max);
                    }
                ]
            }
        };
        // Configure series
        let seriesTelemetries = this.getSeriesTelemetries();
        this.seriesKey = seriesTelemetries.map(t => t.id).join();
        for(let telem of seriesTelemetries) {
            this.chartOptions.series.push({
                width: 1.5,
                show: !this.hidden[telem.id],
                label: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME),
                stroke: () =>{ return this.telemetries[telem.id] ? this.telemetries[telem.id].color : "gray"; }
            });
        }
        // Create chart
        this.resize();
        this.chart = new TELEPLOT.uPlot(this.chartOptions, this.chartData, document.getElementById(this.chartDivId));
        // The pointer on this chart drives the cursor of the group; on the other charts the cursor follows the group (see syncCursor)
        this.pointerInside = false;
        if(this.chart.over && this.chart.over.addEventListener) {
            this.chart.over.addEventListener("mouseenter", () => { this.pointerInside = true; TELEPLOT.view.hoveredGroup = this.group; });
            this.chart.over.addEventListener("mouseleave", () => { this.pointerInside = false; TELEPLOT.view.hoveredGroup = ""; });
            // A click (not a drag): the group is held at that moment
            let down = undefined, u = this.chart;
            this.chart.over.addEventListener("mousedown", (e) => { down = [e.clientX, e.clientY]; });
            this.chart.over.addEventListener("click", (e) => {
                if(!down || Math.abs(e.clientX - down[0]) > 3 || Math.abs(e.clientY - down[1]) > 3 || u.cursor.left < 0) return;
                let at = u.posToVal(u.cursor.left, "x");
                if(at >= 0) TELEPLOT.view.seek(this.group, at);
            });
        }
        // The moment shown when the group is not live: a line over the chart, moved without drawing the chart again (doc/time.md)
        this.headLine = undefined;
        this.headKey = "";
        if(this.chart.over && typeof document !== "undefined" && document.createElement) {
            this.headLine = document.createElement("div");
            this.headLine.className = "teleplot-js-chart-head";
            this.headLine.hidden = true;
            this.chart.over.appendChild(this.headLine);
        }
    }

    // Up to when the data of the series was thinned out to save memory (Telemetry.thinOldest), 0 when it never was
    getThinnedBefore() {
        let until = 0;
        for(let telem of this.getSeriesTelemetries()) {
            let entry = this.getSupportedDataEntry(telem);
            if(entry && entry.thinnedBefore > until) until = entry.thinnedBefore;
        }
        return until;
    }

    // The part of the chart where stored data was thinned out gets a tint and a word: what is drawn there is less than what was received
    // The periods not received (reception was off): hatched, under the series (which break there, see breakAt)
    drawNotReceived(u) {
        if(!u.ctx || !u.bbox || !u.scales || !u.scales.x || u.scales.x.min == null) return;
        let periods = TELEPLOT.datastore.gapsIn(this.telemetryIdOrNameList, u.scales.x.min, u.scales.x.max);
        if(!periods.length) return;
        let ratio = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
        let color = TELEPLOT.theme.color("--teleplot-warn", document.getElementById(this.chartDivId), "orange");
        let right = u.bbox.left + u.bbox.width;
        u.ctx.save();
        u.ctx.beginPath();
        u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
        u.ctx.clip();
        u.ctx.globalAlpha = 0.25;
        u.ctx.strokeStyle = color;
        u.ctx.lineWidth = ratio;
        for(let p of periods) {
            let a = Math.max(u.bbox.left, u.valToPos(p.from, "x", true)), b = Math.min(right, u.valToPos(p.to, "x", true));
            if(!(b > a)) continue;
            u.ctx.save();
            u.ctx.beginPath();
            u.ctx.rect(a, u.bbox.top, b - a, u.bbox.height);
            u.ctx.clip();
            u.ctx.beginPath();
            for(let x = a - u.bbox.height; x < b; x += 6 * ratio) { u.ctx.moveTo(x, u.bbox.top + u.bbox.height); u.ctx.lineTo(x + u.bbox.height, u.bbox.top); }
            u.ctx.stroke();
            u.ctx.restore();
        }
        u.ctx.restore();
    }

    drawThinned(u) {
        let until = this.getThinnedBefore();
        if(!(until > 0) || !u.ctx || !u.bbox || !u.scales || !u.scales.x || u.scales.x.min == null || until <= u.scales.x.min) return;
        let ratio = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
        let element = document.getElementById(this.chartDivId);
        let left = u.bbox.left, right = Math.min(u.bbox.left + u.bbox.width, u.valToPos(until, "x", true));
        if(!(right > left)) return;
        u.ctx.save();
        u.ctx.fillStyle = TELEPLOT.theme.color("--teleplot-grid", element, "rgba(128,128,128,0.1)");
        u.ctx.fillRect(left, u.bbox.top, right - left, u.bbox.height);
        if(right - left > 60 * ratio) {
            u.ctx.fillStyle = TELEPLOT.theme.color("--teleplot-muted", element, "gray");
            u.ctx.font = `${11 * ratio}px sans-serif`;
            u.ctx.textBaseline = "top";
            u.ctx.fillText("thinned", left + 4 * ratio, u.bbox.top + 3 * ratio);
        }
        u.ctx.restore();
    }

    // Vertical scale from the lowest and highest values drawn: thresholds are kept in view (option "thresholds": "fit"), and the
    // range of the telemetries replaces it on the sides it gives (option "scale": "range")
    getScaleRange(min, max) {
        if(this.getOption("thresholds") === "fit") {
            for(let item of this.overlay.thresholds) for(let line of item.lines) for(let step of line.steps) {
                if(min == null || step.value < min) min = step.value;
                if(max == null || step.value > max) max = step.value;
            }
        }
        let fixed = this.getOption("scale") === "range" ? this.getSeriesRange() : undefined;
        if(fixed !== undefined && fixed.min !== undefined && fixed.max !== undefined && fixed.min < fixed.max) return [fixed.min, fixed.max];
        if(min == null || max == null) return [0, 1];
        let range = TELEPLOT.uPlot.rangeNum ? TELEPLOT.uPlot.rangeNum(min, max, 0.1, true) : [min, max];
        if(fixed !== undefined) {
            if(fixed.min !== undefined && fixed.min < range[1]) range[0] = fixed.min;
            if(fixed.max !== undefined && fixed.max > range[0]) range[1] = fixed.max;
        }
        return range;
    }

    // What the ranges of the series shown cover together: {min, max} (a side is undefined when no series gives it), undefined when none has a range
    getSeriesRange() {
        let min = undefined, max = undefined;
        for(let telem of this.getSeriesTelemetries()) {
            let range = this.hidden[telem.id] ? undefined : telem.getRange();
            if(range === undefined) continue;
            if(range.min !== undefined && (min === undefined || range.min < min)) min = range.min;
            if(range.max !== undefined && (max === undefined || range.max > max)) max = range.max;
        }
        return (min === undefined && max === undefined) ? undefined : { min, max };
    }

    static LATEST_ROOM = 0.04; // Part of the period given after a mark that is the latest thing shown

    // Text telemetries of the view: they have no series, their samples are marks on the time axis
    getMarkTelemetries() {
        let list = [];
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined || this.getSupportedDataEntry(telem) !== undefined || list.some((other) => other.id === telem.id)) continue;
            if(telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT] !== undefined) list.push(telem);
        }
        return list;
    }

    // Marks of a text data entry between two times: [{t, text, count}]. A log gives one per line. A state gives one where its
    // value changes (the same value sent again says nothing new) and none where it becomes empty. Marks closer than minGap
    // (seconds: what a few pixels show) to the one before are folded into it: it counts them, and keeps its own text.
    static buildMarks(entry, isLog, from, to, minGap=0) {
        let stamps = entry.timestamps, texts = entry.data[0];
        let lo = 0, hi = stamps.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(stamps[mid] < from) lo = mid + 1; else hi = mid; }
        let previous = (!isLog && lo > 0) ? String(texts[lo - 1]) : undefined;
        let marks = [], last = undefined;
        for(let i = lo; i < stamps.length && stamps[i] <= to; i++) {
            let text = String(texts[i]);
            if(!isLog) { if(text === previous) continue; previous = text; }
            if(text === "") continue;
            if(last !== undefined && stamps[i] - last.t < minGap) { last.count++; continue; }
            last = { t: stamps[i], text, count: 1 };
            marks.push(last);
        }
        return marks;
    }

    // Computes what is drawn over the series for the period displayed (see this.overlay), when what it is made from changed.
    // Returns a key that changes when it does.
    buildOverlay(displayRange) {
        const P = TELEPLOT.protocol;
        let key = this.getOption("thresholds") + "|" + this.getOption("scale") + "|" + displayRange.key;
        let withThresholds = [], withMarks = [];
        if(this.getOption("thresholds") !== "hide") for(let telem of this.getSeriesTelemetries()) {
            let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD];
            if(entry === undefined || this.hidden[telem.id]) continue;
            key += `|${telem.id}:${entry.lastUpdate}:${entry.timestamps.length}`;
            withThresholds.push(telem);
        }
        if(this.getOption("scale") === "range") key += "|" + JSON.stringify(this.getSeriesRange() || null);
        for(let telem of this.getMarkTelemetries()) {
            let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT];
            key += `|${telem.id}:${entry.lastUpdate}:${entry.timestamps.length}:${this.hidden[telem.id] ? 0 : 1}`;
            if(!this.hidden[telem.id]) withMarks.push(telem);
        }
        if(key === this.overlayKey) return key;
        let hasPeriod = displayRange.from < displayRange.to;
        let minGap = hasPeriod ? (displayRange.to - displayRange.from) / displayRange.maxBuckets * ViewChart.MARK_GAP : 0;
        this.overlay.thresholds = !hasPeriod ? [] : withThresholds.map((telem) => ({ id: telem.id, lines: telem.getThresholdSteps(displayRange.from, displayRange.to) }));
        this.overlay.marks = !hasPeriod ? [] : withMarks.map((telem) => {
            let isLog = telem.getAttribute(P.TELEM_ATTR_LOG) === true, entry = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT];
            return { id: telem.id, marks: ViewChart.buildMarks(isLog ? entry : TELEPLOT.textRuns(entry), isLog, displayRange.from, displayRange.to, minGap) }; // (a state: its runs are where it changes)
        });
        return key;
    }

    static MARK_GAP = 6; // Pixels between two marks: closer ones are folded into one

    // Thresholds (dashed steps, with their name on the side that is past the limit) and marks (a vertical line and its text), over the series
    drawOverlay(u) {
        if(!u.ctx || !u.bbox || !u.valToPos || (!this.overlay.thresholds.length && !this.overlay.marks.length)) return;
        let ratio = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
        let element = document.getElementById(this.chartDivId);
        let ctx = u.ctx, box = u.bbox;
        let right = box.left + box.width, bottom = box.top + box.height;
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.left, box.top, box.width, box.height);
        ctx.clip();
        ctx.font = `${10 * ratio}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        let charWidth = ctx.measureText("0").width || 6 * ratio;
        let surface = TELEPLOT.theme.color("--teleplot-surface", element, "white");
        let label = (text, x, y, color, align) => { // A text on a patch of the background, so that it reads over the curves
            let width = text.length * charWidth + 6 * ratio;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = surface;
            ctx.fillRect(align === "right" ? x - width : x, y - 6.5 * ratio, width, 13 * ratio);
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.textBaseline = "middle";
            ctx.fillText(text, align === "right" ? x - 3 * ratio : x + 3 * ratio, y);
        };

        // Thresholds
        let warn = TELEPLOT.theme.color("--teleplot-warn", element, "orange");
        ctx.lineWidth = ratio;
        ctx.setLineDash([6 * ratio, 4 * ratio]);
        for(let item of this.overlay.thresholds) for(let line of item.lines) {
            let color = line.color || warn;
            ctx.strokeStyle = color;
            ctx.beginPath();
            let previous = undefined;
            for(let step of line.steps) {
                let x0 = u.valToPos(step.from, "x", true), x1 = u.valToPos(step.to, "x", true), y = Math.round(u.valToPos(step.value, "y", true)) + 0.5;
                if(previous !== undefined && previous.to === step.from) ctx.lineTo(x0, y); // (the limit changed: a step, never a slope)
                else ctx.moveTo(x0, y);
                ctx.lineTo(x1, y);
                previous = step;
            }
            ctx.stroke();
            let last = line.steps[line.steps.length - 1];
            let y = u.valToPos(last.value, "y", true);
            let above = line.operator === TELEPLOT.protocol.THRESHOLD_ABOVE; // The name is written on the side that is past the limit
            let x = Math.min(right, u.valToPos(last.to, "x", true)) - 2 * ratio;
            ctx.setLineDash([]);
            label(line.name, x, Math.max(box.top + 8 * ratio, Math.min(bottom - 8 * ratio, y + (above ? -9 : 9) * ratio)), color, "right");
            ctx.setLineDash([6 * ratio, 4 * ratio]);
        }
        ctx.setLineDash([]);

        // Marks: the text when there is room before the next mark, each text telemetry on its own line of texts
        let row = 0;
        for(let item of this.overlay.marks) {
            let color = (this.telemetries[item.id] && this.telemetries[item.id].color) || TELEPLOT.theme.color("--teleplot-muted", element, "gray");
            let y = box.top + (8 + 14 * (row++ % 4)) * ratio;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            let xs = item.marks.map((mark) => Math.round(u.valToPos(mark.t, "x", true)) + 0.5);
            // A mark alone is a line over the whole chart; marks that were folded together (too close to be told apart) are a short
            // tick at the top: a busy period reads as a row of ticks, and the curves under it stay visible
            for(let i = 0; i < xs.length; i++) { ctx.moveTo(xs[i], box.top); ctx.lineTo(xs[i], item.marks[i].count > 1 ? box.top + 7 * ratio : bottom); }
            ctx.stroke();
            ctx.globalAlpha = 1;
            let used = box.left; // Where the text of the mark before ends
            for(let i = 0; i < item.marks.length; i++) {
                let mark = item.marks[i];
                let room = (i + 1 < xs.length ? xs[i + 1] : right) - xs[i] - 8 * ratio;
                let text = mark.count > 1 ? mark.text + " +" + (mark.count - 1) : mark.text;
                // The last mark, near the right end: its text goes on the left of its line when it fits better there
                let leftRoom = xs[i] - used - 8 * ratio, toLeft = i + 1 === xs.length && text.length * charWidth > room && leftRoom > room;
                let chars = Math.floor((toLeft ? leftRoom : room) / charWidth);
                if(chars < 3) continue;
                if(text.length > chars) text = mark.count > 1 && chars < 8 ? "+" + mark.count : text.slice(0, chars - 1) + "\u2026";
                label(text, toLeft ? xs[i] - ratio : xs[i] + ratio, mark.count > 1 ? y + 8 * ratio : y, color, toLeft ? "right" : "left");
                used = xs[i] + (toLeft ? 0 : text.length * charWidth + 4 * ratio);
            }
        }
        ctx.restore();
    }

    // Shows the cursor of the group (the timestamp hovered on any view) as a vertical line on a chart the pointer is not on,
    // so every chart marks the instant the other views show. Hidden when there is no cursor or it is outside of this chart's range,
    // and when it is the moment the group is held at (the head line shows it, see syncHead).
    syncCursor() {
        let u = this.chart;
        if(this.pointerInside || !u || !u.setCursor || !u.valToPos || !u.scales || !u.scales.x || u.scales.x.min == null) return;
        let group = TELEPLOT.view.groups[this.group];
        let ts = group.mode !== undefined && group.mode !== "live" && group.cursorTimestamp === group.at ? -1 : group.cursorTimestamp;
        let left = -10;
        if(ts >= 0 && ts >= u.scales.x.min && ts <= u.scales.x.max) left = u.valToPos(ts, "x");
        if(Math.abs((u.cursor.left === undefined ? -10 : u.cursor.left) - left) < 0.5) return;
        u.setCursor({ left: left, top: -10 }, false); // false: do not fire the setCursor hook, it is the pointer's business (top < 0: no horizontal line)
    }

    // The moment of a group that is not live: a line in the color of its mode (held, replay), only moved when its pixel changes
    syncHead() {
        let u = this.chart, line = this.headLine;
        if(!line || !u || !u.valToPos || !u.scales || !u.scales.x || u.scales.x.min == null) return;
        let group = TELEPLOT.view.groups[this.group];
        let shown = group.mode === "held" || group.mode === "replay";
        let left = shown && group.at >= u.scales.x.min && group.at <= u.scales.x.max ? Math.round(u.valToPos(group.at, "x") * 2) / 2 : -1;
        let key = left < 0 ? "" : left + ":" + group.mode;
        if(key === this.headKey) return;
        this.headKey = key;
        line.hidden = key === "";
        if(key === "") return;
        line.style.left = left + "px";
        line.classList.toggle("teleplot-js-chart-head-replay", group.mode === "replay");
    }

    // A series with an explicit null inside each hole left by a stop of reception (gaps: the last sample before, the first one after,
    // see Telemetry.gapsOf; a decimated series keeps samples on both sides): uPlot breaks its line at a null (and spans the undefined
    // that uPlot.join puts where a series has no sample at a time of another). Fresh arrays.
    static breakAt(series, gaps) {
        let times = series[0], values = series[1];
        if(!times || times.length < 2) return series;
        let outTimes = [], outValues = [], p = 0;
        for(let i = 0; i < times.length; i++) {
            let broken = false;
            while(p < gaps.length && gaps[p].to <= times[i]) {
                let gap = gaps[p++];
                if(!broken && i > 0 && times[i - 1] <= gap.from && times[i - 1] < times[i]) { outTimes.push((Math.max(times[i - 1], gap.from) + Math.min(times[i], gap.to)) / 2); outValues.push(null); broken = true; }
            }
            outTimes.push(times[i]);
            outValues.push(values[i]);
        }
        return [outTimes, outValues];
    }

    resize(){
        // Default values
        let width = 200;
        let height = 100;
        let elem = document.getElementById(this.chartDivId)
        if (elem) {
            width = elem.clientWidth;
            height = elem.clientHeight;
        }
        let sizeHasChanged = this.chartOptions.width != width || this.chartOptions.height != height;

        this.chartOptions.width = width;
        this.chartOptions.height = height;
        if (sizeHasChanged && this.chart && "setSize" in this.chart) {
            this.chart.setSize({width, height});
        }
    }

    update(){
        if (!super.__before_update()) return;
        this.updateRunning = true;

        // A telemetry got its first data, was added or removed after the chart was created: the chart needs another set of series.
        // Done before any resize: a destroyed chart must not have a redraw pending (it would draw series the data no longer has)
        if(this.seriesKey !== undefined && this.seriesKey != this.getSeriesTelemetries().map(t => t.id).join()) {
            this.destroyChart();
            let container = document.getElementById(this.chartDivId);
            if(container) container.innerHTML = "";
            // The new chart has another number of series than the data left by the previous one: start from empty columns (filled below, same update)
            this.chartData.length = 0;
            for(let i = 0; i <= this.getSeriesTelemetries().length; i++) this.chartData.push([]);
            this.createChart();
            this.updateForced = true;
        }

        // Trigger chart resize (only if needed)
        this.resize();
        // The theme changed (light/dark): colors are read when drawing, so draw again
        let themeKey = TELEPLOT.theme.key();
        if(themeKey !== this.themeKey) {
            this.themeKey = themeKey;
            if(this.chart && this.chart.redraw) this.chart.redraw();
        }
        // For each telemetry
        let needUpdate = false;
        let live = TELEPLOT.view.isLive(this.group);
        let serieIdx = 0;
        let shown = [];
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx += 1;
            if(!shown.includes(telem.id)) shown.push(telem.id);

            // Get name and unit
            if(this.telemetries[telem.id] === undefined) {
                this.telemetries[telem.id] = {id: telem.id, telem: telem, name: "", unit: "", color: "", lastUpdate: 0, lastTargetTimestamp: 0, actualValue: [], actualStrValue: []};
            }
            this.telemetries[telem.id].name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            this.telemetries[telem.id].unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
            this.telemetries[telem.id].tip = TELEPLOT.view.telemetryTip(telem); // (its description, when it has one)

            // Resolve color
            this.telemetries[telem.id].color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR);
            if (!this.telemetries[telem.id].color) {
                this.telemetries[telem.id].color = TELEPLOT.colors.getColor(serieIdx).toStrRGB();
            }
            
            // Check last update, last value, and str representation
            let formatter = new Intl.NumberFormat('en-US', {
                style: 'decimal',
                minimumFractionDigits: 0,
                maximumFractionDigits: this.getOption("displayNumberDecimals", telem.id)
            });
            // A text telemetry has no series: its samples are marks (see buildOverlay), its legend entry tells the text at the cursor
            let shownTelem = this.telemetries[telem.id];
            let textEntry = this.getSupportedDataEntry(telem) === undefined ? telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT] : undefined;
            if((textEntry !== undefined) !== !!shownTelem.isMarks) shownTelem.isMarks = textEntry !== undefined;
            if(textEntry !== undefined) {
                let text = ViewChart.textAt(textEntry, TELEPLOT.view.groups[this.group].cursorTimestamp);
                if(shownTelem.actualValue[0] !== text) {
                    shownTelem.actualValue[0] = text;
                    shownTelem.actualStrValue[0] = text.length > 24 ? text.slice(0, 23) + "\u2026" : text;
                }
            }
            for(let dataType in telem.data) {
                if(!this.supportedDataTypes.includes(dataType)) continue;
                
                let targetTimestamp = TELEPLOT.view.groups[this.group].cursorTimestamp;
                let dataPoint = telem.getDataPoint(dataType, targetTimestamp);
                // The threshold the value is past (its legend entry takes its color)
                let past = telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD] !== undefined ? telem.getThresholdStatus(dataPoint.data[0], targetTimestamp) : undefined;
                let status = past === undefined ? "" : past.name, statusColor = past === undefined ? "" : (past.color || "var(--teleplot-warn)");
                if(shownTelem.status !== status) shownTelem.status = status;
                if(shownTelem.statusColor !== statusColor) shownTelem.statusColor = statusColor;
                
                // Check update need
                // (New data while the group is not live lands after its frozen window: nothing to draw. A cursor that moves is a
                // line over the chart: nothing to draw either, see syncCursor / syncHead)
                if(live) needUpdate |= this.telemetries[telem.id].lastUpdate != telem.data[dataType].lastUpdate;
                this.telemetries[telem.id].lastUpdate = telem.data[dataType].lastUpdate;
                this.telemetries[telem.id].lastTargetTimestamp = targetTimestamp;
                
                for (let channel in dataPoint.data) {
                    let value = dataPoint.data[channel];
                    this.telemetries[telem.id].actualValue[channel] = value;
                    this.telemetries[telem.id].actualStrValue[channel] = (typeof value === "number") ? formatter.format(value) : ""+value;
                }
                break;
            }
        }

        this.syncDisplayOrder(shown);
        if(!live && this.wasLive) needUpdate = true; // (held: the window is frozen from now on)
        this.wasLive = live;

        // Legend: value slots only grow (no shaking), entries are measured again when something that changes their width did
        let slots = [];
        for(let id in this.telemetries) {
            let t = this.telemetries[id];
            let chars = (t.actualStrValue && t.actualStrValue.length) ? t.actualStrValue.join(",").length : 0;
            if(chars > (this.valueChars[id] || 0)) this.valueChars[id] = chars;
            t.valueChars = this.valueChars[id] || 0;
            slots.push(id + ":" + t.valueChars + ":" + (t.name || "") + ":" + (t.unit || ""));
        }
        let legendKey = slots.join("|") + "|" + (this.chartOptions.width || 0) + "|" + (document.getElementById(this.divId) ? document.getElementById(this.divId).clientWidth : 0);
        if(legendKey !== this.legendKey) {
            this.legendKey = legendKey;
            TELEPLOT.Vue.nextTick(() => this.layoutLegend()); // The DOM follows the data on the next tick
        }
        this.updateLegendList();

        // Create chart data
        let displayRange = this.getDisplayRange();
        needUpdate |= this.lastDisplayRange != displayRange.key;
        // What is drawn over the series (thresholds, marks of text telemetries): the chart is drawn again when it changes
        let overlayKey = this.buildOverlay(displayRange);
        needUpdate |= this.overlayKey != overlayKey;
        this.overlayKey = overlayKey;
        if(needUpdate || this.updateForced) {
            this.lastDisplayRange = displayRange.key;
            let dataList = [];
            for(let telemIdOrName of this.telemetryIdOrNameList){
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                if(telem === undefined) continue;
                
                let dataEntry = this.getSupportedDataEntry(telem);
                if(dataEntry === undefined) continue;
                let series = this.getSeriesData(telem, dataEntry, displayRange);
                // Holes left by stops of reception: the line breaks there instead of joining the samples around
                let gaps = Telemetry.gapsOf(dataEntry, displayRange.from, displayRange.to);
                dataList.push(gaps.length ? ViewChart.breakAt(series, gaps) : series);
            }
            this.chartData.length = 0;
            this.chartData.push(...(dataList.length ? TELEPLOT.uPlot.join(dataList) : [[]])); // Nothing to display yet: uPlot.join() cannot join no series
            // Update chart
            this.updateForced = false;
            if(dataList.length && this.chart && this.chart.batch) { // Nothing to draw: uPlot cannot lay out axes without data (the empty state is shown instead). Not the case while the view isn't mounted (ex: hidden in a stack)
                this.chart.batch(() => {
                    //Set data
                    this.chart.setData(this.chartData);
                    // Set scale
                    if(TELEPLOT.view.groups[this.group].cursorActive) {
                        this.chart.setScale("x", {
                            min: TELEPLOT.view.groups[this.group].timestampFrom,
                            max: TELEPLOT.view.groups[this.group].timestampTo
                        });
                    }
                    else if(displayRange.widened) this.chart.setScale("x", { min: displayRange.from, max: displayRange.to }); // (uPlot only knows the numbers: the marks widen it)
                });// Allows a single chart redraw even if we call multiple updates (data and scale)
            }
        }
        this.syncCursor();
        this.syncHead();
        // Used to ignore hooks triggered by updating the chart
        queueMicrotask(()=>{this.updateRunning = false;}); // Need to use queueMicrotask to make sure to run after uPlot hooks are fired
    }
    
    // The text of a text data entry at a time (the last sample at or before it; the latest without time), "" when there is none
    static textAt(entry, timestamp=-1) {
        let stamps = entry.timestamps, index = stamps.length - 1;
        if(timestamp >= 0 && index >= 0 && stamps[index] > timestamp) {
            let lo = 0, hi = stamps.length;
            while(lo < hi) { let mid = (lo + hi) >> 1; if(stamps[mid] <= timestamp) lo = mid + 1; else hi = mid; }
            index = lo - 1;
        }
        return index < 0 ? "" : String(entry.data[0][index]);
    }

    // Data entry of the telemetry that this chart can display (only 1 datatype expected)
    getSupportedDataEntry(telem) {
        for(let dataType in telem.data) {
            if(this.supportedDataTypes.includes(dataType)) return telem.data[dataType];
        }
        return undefined;
    }

    // Time range currently displayed (the zoomed range, or all the data), and number of pixel columns to display it
    getDisplayRange() {
        let group = TELEPLOT.view.groups[this.group];
        let from = Infinity;
        let to = -Infinity;
        if(group.cursorActive) {
            from = group.timestampFrom;
            to = group.timestampTo;
        }
        else {
            for(let telemIdOrName of this.telemetryIdOrNameList){
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                let dataEntry = telem && this.getSupportedDataEntry(telem);
                if(dataEntry === undefined || dataEntry.timestamps.length == 0) continue;
                from = Math.min(from, dataEntry.timestamps[0]);
                to = Math.max(to, dataEntry.timestamps.at(-1));
            }
            // The marks are part of what is shown: a text that comes after the last number (or before the first) widens the period.
            // (Only when there are numbers to chart; a state kept from before the data window does not stretch it back.)
            if(from <= to) {
                let markFrom = Infinity, markTo = -Infinity;
                for(let telem of this.getMarkTelemetries()) {
                    let entry = telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
                    if(!entry.timestamps.length) continue;
                    markFrom = Math.min(markFrom, entry.timestamps[0]);
                    markTo = Math.max(markTo, entry.timestamps.at(-1));
                }
                let numbers = { from, to };
                to = Math.max(to, markTo);
                let window = TELEPLOT.state.dataTimeout;
                from = Math.min(from, window > 0 ? Math.max(markFrom, to - window) : markFrom);
                // A mark that is the latest thing shown gets some room after it, as a timeline gives its latest state: on the very edge
                // its line would be the frame and its text would be cut. (The axis tells what time that is: nothing is said to have happened there.)
                if(markTo > numbers.to) to += (to - from) * ViewChart.LATEST_ROOM;
                if(from < numbers.from || to > numbers.to) {
                    let maxBuckets = Math.max(this.chartOptions.width || 0, 100);
                    return { from, to, maxBuckets, key: `${from},${to},${maxBuckets}`, widened: true };
                }
            }
        }
        let maxBuckets = Math.max(this.chartOptions.width || 0, 100);
        return { from, to, maxBuckets, key: `${from},${to},${maxBuckets}` };
    }

    // [timestamps, values] of a series, as given to uPlot
    getSeriesData(telem, dataEntry, displayRange) {
        if(!this.getOption("decimation") || !(displayRange.from < displayRange.to) || dataEntry.timestamps.length == 0) {
            return [dataEntry.timestamps, ...dataEntry.data]; // only 1 channel expected
        }
        if(this.decimators[telem.id] === undefined) {
            this.decimators[telem.id] = new MinMaxDecimator();
        }
        let view = this.decimators[telem.id].getView(dataEntry, displayRange.from, displayRange.to, displayRange.maxBuckets);

        // Always include the first and last samples: uPlot uses the extent of its data to reset the zoom
        let last = dataEntry.timestamps.length - 1;
        if(!(dataEntry.timestamps[0] >= view.timestamps[0])) {
            view.timestamps.unshift(dataEntry.timestamps[0]);
            view.values.unshift(dataEntry.data[0][0]);
        }
        if(!(dataEntry.timestamps[last] <= view.timestamps.at(-1))) {
            view.timestamps.push(dataEntry.timestamps[last]);
            view.values.push(dataEntry.data[0][last]);
        }
        return [view.timestamps, view.values];
    }

    static vueHTML = `
        <div class="teleplot-js-chart-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}>
            <div class="teleplot-js-chart-legend">
                <div v-for="(telem, i) in ordered" v-bind:key="telem.id" class="teleplot-js-chart-legend-block"
                    v-bind:class="{'teleplot-js-chart-legend-folded': i >= legend.visible, 'teleplot-js-chart-legend-off': hidden[telem.id], 'teleplot-js-chart-legend-marks': telem.isMarks}"
                    v-bind:style="{'--chip-color': telem.color}"
                    v-on:click="onLegendClick(telem.id)" v-on:mouseenter="onLegendEnter(telem.id)" v-on:mouseleave="onLegendLeave()">

                    <div v-if="telem.actualStrValue && telem.actualStrValue.length" class="teleplot-js-chart-legend-value"
                        v-bind:style="{'min-width': ''+(telem.valueChars || 0)+'ch', 'color': telem.statusColor || null }"
                        v-bind:title="telem.status ? telem.actualValue + ' (threshold: ' + telem.status + ')' : telem.actualValue" >
                        <span>{{telem.actualStrValue.join(",")}}</span>
                    </div>

                    <div class="teleplot-js-chart-legend-name" v-bind:class="{'teleplot-js-chart-legend-name-unsupported': !telem.isMarks && (!telem.actualStrValue || !telem.actualStrValue.length)}" v-bind:title="telem.tip">
                        <span>{{telem.name}}</span>
                        <span v-if="telem.unit"> ({{telem.unit}})</span>
                    </div>

                </div>
                <button v-if="legend.folded > 0" type="button" class="teleplot-js-chart-legend-more" v-bind:class="{'teleplot-js-chart-legend-more-open': legend.open}"
                    title="All the series" v-on:click.stop="onLegendMore()">+{{legend.folded}} <span>&#9662;</span></button>
            </div>
            <div class="teleplot-js-chart-popover" v-show="legend.open" v-bind:id="popoverDivId"></div>
            <div class="teleplot-js-chart-uplot" v-bind:id="chartDivId"></div>
            <div v-if="emptyState.text" class="teleplot-js-empty">
                <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
                <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
            </div>
        </div>
    `;
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-chart-container {
                position: relative;
                font-size: 0.8em;
                min-height: calc(5em * var(--layout-height, 1)); /* the height step is 4em of the normal font size: this view's font is 0.8em, so 5em here (else it is shorter than the other views of the same height) */
                width: 100%;
                display: flex;
                flex-direction: column;
            }
            .u-select { background: color-mix(in srgb, var(--teleplot-primary) 18%, transparent); }
            .teleplot-js-chart-uplot {
                flex: 1 1 0;       /* the chart takes what is left, it never pushes its container to its own size (else it could not shrink) */
                min-height: 0;
                overflow: hidden;
            }
            .teleplot-js-chart-legend {
                height: 1.5em !important;               /* keyword probably not required, but this dimension is important */
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;            /* entries start at the left: a new one never moves the others */
                flex-wrap: nowrap;
                gap: 1.2em;
                overflow: hidden;                       /* what doesn't fit is folded behind the "+N" chip (see layoutLegend) */
                position: relative;
            }
            .teleplot-js-has-title .teleplot-js-chart-legend { margin-left: 42%; } /* the title takes the left of the legend row */
            .teleplot-js-chart-legend-block {
                display: flex;
                flex-direction: row;
                align-items: center;
                flex-wrap: nowrap;
                gap: 0.4em;
                white-space: nowrap;
            }
            .teleplot-js-chart-legend-block { cursor: pointer; flex: 0 0 auto; }
            .teleplot-js-chart-legend-folded { position: absolute; visibility: hidden; pointer-events: none; } /* out of the flow, but still measurable */
            .teleplot-js-chart-legend-off { opacity: 0.45; }
            .teleplot-js-chart-legend-off .teleplot-js-chart-legend-name { text-decoration: line-through; }
            .teleplot-js-chart-legend-more {
                flex: 0 0 auto; order: 3; font: inherit; color: var(--teleplot-muted); cursor: pointer;
                background: color-mix(in srgb, var(--teleplot-text) 8%, transparent); border: 0; border-radius: 1em; padding: 0.05em 0.7em;
            }
            .teleplot-js-chart-legend-more:hover, .teleplot-js-chart-legend-more-open { color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-text) 16%, transparent); }
            .teleplot-js-chart-container > .teleplot-js-chart-popover { /* the list of all series, over the chart */
                position: absolute; z-index: 20; top: 1.7em; left: 0; width: min(30em, 100%); font-size: 1.15em;
                background: var(--teleplot-surface); border: 1px solid var(--teleplot-line); border-radius: 8px;
                box-shadow: 0 6px 20px rgba(0,0,0,0.25); overflow: hidden;
                /* the list is a view of its own, drawn without card look */
                --teleplot-card-bg: transparent; --teleplot-card-bw: 0px; --teleplot-card-radius: 0px; --teleplot-card-shadow: none; --teleplot-accent-w: 0px;
            }
            .teleplot-js-chart-popover > * { display: contents; }
            .teleplot-js-chart-popover .teleplot-js-current-value-container { height: auto; min-height: 0; max-height: var(--pop-max, 20em); justify-content: flex-start; } /* scrolls when the height is short */
            .teleplot-js-chart-legend-name { order: 1; color: var(--teleplot-muted); }
            .teleplot-js-chart-legend-name::before { /* color key of the series */
                content: ""; display: inline-block; width: 0.6em; height: 0.6em; margin-right: 0.4em;
                border-radius: 50%; background: var(--chip-color, gray);
            }
            .teleplot-js-chart-legend-marks .teleplot-js-chart-legend-name::before { width: 0.2em; height: 0.9em; border-radius: 1px; vertical-align: -0.1em; } /* a text telemetry: the key is a mark */
            .teleplot-js-chart-legend-value {
                order: 2;
                font-family: var(--teleplot-mono);
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--teleplot-text);
                text-align: left;
            }
            .teleplot-js-chart-legend-name-unsupported {
                opacity: 0.7;
                text-decoration: line-through;
            }
            .teleplot-js-chart-container .teleplot-js-empty { top: 1.5em; padding-top: 0; }
        }
    `;

}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewChart.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewChart = ViewChart;
