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
        this.setOption("decimation", true); // Only give the chart what it can display (see MinMaxDecimator), stored data is untouched
        this.decimators = {};               // One MinMaxDecimator per telemetry id
        this.lastDisplayRange = "";         // Time range and resolution used to build chartData, to detect a need for update

        // Vue data
        this.telemetries = TELEPLOT.Vue.reactive({});
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
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext,
                    emptyState: self.emptyState,
                    legend: self.legend,
                    hidden: self.hidden,
                    popoverDivId: self.popoverDivId
                }
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

    getOptionsSchema() {
        return [...super.getOptionsSchema(), { key: "decimation", label: "Decimation", type: "bool" }];
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
        let blocks = Array.from(legendEl.querySelectorAll(".teleplot-js-chart-legend-block"));
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
        if(this.legend.visible !== visible) this.legend.visible = visible;
        let folded = widths.length - visible;
        if(this.legend.folded !== folded) this.legend.folded = folded;
        if(!folded && this.legend.open) this.closeLegendList();
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
                y: { range: (u, min, max) => (min == null || max == null) ? [0, 1] : TELEPLOT.uPlot.rangeNum(min, max, 0.1, true) }
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
                setCursor: [
                    (u) => {
                        if(this.updateRunning) return;
                        // Mouse leave
                        if(u.cursor.left < 0) {
                            TELEPLOT.view.groups[this.group].cursorActive = false;
                            TELEPLOT.view.groups[this.group].cursorTimestamp = -1;
                            return;
                        }
                        // Mouse hover
                        const idx = u.posToIdx(u.cursor.left);
                        if (idx != null)
                            TELEPLOT.view.groups[this.group].cursorTimestamp = u.data[0][idx];
                        }
                ],
                setScale: [
                    (u, key) => {
                        if(this.updateRunning) return;
                        if(key != "x") return;
                        // Zoom selected
                        const s = u.scales[key];
                        TELEPLOT.view.groups[this.group].timestampFrom = s.min;
                        TELEPLOT.view.groups[this.group].timestampTo = s.max;
                        TELEPLOT.view.groups[this.group].cursorActive = true;
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
        let serieIdx = 0;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx += 1;

            // Get name and unit
            if(this.telemetries[telem.id] === undefined) {
                this.telemetries[telem.id] = {telem: telem, name: "", unit: "", color: "", lastUpdate: 0, lastTargetTimestamp: 0, actualValue: [], actualStrValue: []};
            }
            this.telemetries[telem.id].name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            this.telemetries[telem.id].unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);

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
            for(let dataType in telem.data) {
                if(!this.supportedDataTypes.includes(dataType)) continue;
                
                let targetTimestamp = TELEPLOT.view.groups[this.group].cursorTimestamp;
                let dataPoint = telem.getDataPoint(dataType, targetTimestamp);
                
                // Check update need
                needUpdate |= this.telemetries[telem.id].lastUpdate != telem.data[dataType].lastUpdate;
                needUpdate |= this.telemetries[telem.id].lastTargetTimestamp != targetTimestamp;
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
        if(needUpdate || this.updateForced) {
            this.lastDisplayRange = displayRange.key;
            let dataList = [];
            for(let telemIdOrName of this.telemetryIdOrNameList){
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                if(telem === undefined) continue;
                
                let dataEntry = this.getSupportedDataEntry(telem);
                if(dataEntry === undefined) continue;
                dataList.push(this.getSeriesData(telem, dataEntry, displayRange));
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
                });// Allows a single chart redraw even if we call multiple updates (data and scale)
            }
        }
        // Used to ignore hooks triggered by updating the chart
        queueMicrotask(()=>{this.updateRunning = false;}); // Need to use queueMicrotask to make sure to run after uPlot hooks are fired
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
                <div v-for="(telem, key, i) in telemetries" v-bind:key="key" class="teleplot-js-chart-legend-block"
                    v-bind:class="{'teleplot-js-chart-legend-folded': i >= legend.visible, 'teleplot-js-chart-legend-off': hidden[key]}"
                    v-bind:style="{'--chip-color': telem.color}"
                    v-on:click="onLegendClick(key)" v-on:mouseenter="onLegendEnter(key)" v-on:mouseleave="onLegendLeave()">

                    <div v-if="telem.actualStrValue && telem.actualStrValue.length" class="teleplot-js-chart-legend-value"
                        v-bind:style="{'min-width': ''+(telem.valueChars || 0)+'ch' }"
                        v-bind:title="telem.actualValue" >
                        <span>{{telem.actualStrValue.join(",")}}</span>
                    </div>

                    <div class="teleplot-js-chart-legend-name" v-bind:class="{'teleplot-js-chart-legend-name-unsupported': (!telem.actualStrValue || !telem.actualStrValue.length)}">
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