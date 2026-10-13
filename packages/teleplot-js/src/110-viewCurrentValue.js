class ViewCurrentValue extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "value";
        this.type = "teleplot-current-value";
        this.telemetryIdOrNameList = telemetryIdOrNameList;

        this.options.displayLayoutRow = false; // Change from default column layout to row
        this.options.displayTelemetryName = true; // Show telemetry name
        this.options.displayTelemetryColor = true; // Show telemetry color
        this.options.displayScale = true; // Under the bar of a number that has a range: its minimum, its maximum and the names of its thresholds
        this.scaleKey = "";               // What those labels are made of, to lay them out again only when it changes

        // Reduce default size
        this.layout.width = 1;
        this.layout.height = 1;

        // Rows can be made interactive by whoever embeds the view (ex: the chart legend lists its series with a ViewCurrentValue):
        // rowHandlers = { click(id), enter(id), leave(id) } (all optional), dimmed = reactive { telemetryId: true } of rows drawn as switched off
        this.rowHandlers = {};
        this.dimmed = TELEPLOT.Vue.reactive({});

        // Vue data
        this.telemetries = TELEPLOT.Vue.reactive({});
        this.displayOrder = TELEPLOT.Vue.reactive([]); // see syncDisplayOrder
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    telemetries : self.telemetries,
                    displayOrder: self.displayOrder,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext,
                    emptyState: self.emptyState,
                    dimmed: self.dimmed
                }
            },
            computed: {
                ordered() { return this.displayOrder.map((id) => this.telemetries[id]).filter(Boolean); }
            },
            methods: {
                onRowClick: (id) => { if(self.rowHandlers.click) self.rowHandlers.click(id); },
                onRowEnter: (id) => { if(self.rowHandlers.enter) self.rowHandlers.enter(id); },
                onRowLeave: (id) => { if(self.rowHandlers.leave) self.rowHandlers.leave(id); },
                formatEnd: (value) => ViewCurrentValue.formatEnd(value),
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop
            },
            template: ViewCurrentValue.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);
    }

    getOptionsSchema() {
        return [
            ...super.getOptionsSchema(),
            { key: "displayLayoutRow", label: "Values in a row", type: "bool" },
            { key: "displayTelemetryName", label: "Telemetry names", type: "bool" },
            { key: "displayTelemetryColor", label: "Telemetry colors", type: "bool" },
            { key: "displayScale", label: "Range labels", type: "bool" },
        ];
    }

    update(){
        if (!super.__before_update()) return;

        let serieIdx = 0;
        let shown = [];
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx += 1;
            if(!shown.includes(telem.id)) shown.push(telem.id);

            // Add telem to vue data
            if(this.telemetries[telem.id] === undefined) {
                this.telemetries[telem.id] = {id: telem.id, telem: telem, name: "", unit: "", color:"", data: {}};
            }
            
            // Resolve color
            this.telemetries[telem.id].color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR);
            if (!this.telemetries[telem.id].color) {
                this.telemetries[telem.id].color = TELEPLOT.colors.getColor(serieIdx).toStrRGB();
            }

            // Extract telem attributes
            this.telemetries[telem.id].telem = telem;
            this.telemetries[telem.id].name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            this.telemetries[telem.id].unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
            let dataTypes = Object.keys(telem.data).filter((type) => type != TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD); // (thresholds are not a value: they qualify the number)
            this.telemetries[telem.id].empty = dataTypes.length == 0;
            this.telemetries[telem.id].imageOnly = dataTypes.length == 1 && dataTypes[0] == ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE; // The image fills the block, the name is overlaid on it
            for(let dataType of dataTypes) {
                if(this.telemetries[telem.id].data[dataType] === undefined) {
                    this.telemetries[telem.id].data[dataType] = { timestamp:0, lastValue: [], lastDisplayValue: [] };
                }

                let targetTimestamp = TELEPLOT.view.groups[this.group].cursorTimestamp;
                let dataPoint = telem.getDataPoint(dataType, targetTimestamp);
                if (dataPoint.index === undefined) continue;

                this.telemetries[telem.id].data[dataType].timestamp = dataPoint.timestamp;

                // Get latest value of each channel and compute string representation
                let formatter = new Intl.NumberFormat('en-US', {
                    style: 'decimal',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: this.getOption("displayNumberDecimals", telem.id)
                });
                let channelIdx = 0;
                if(dataType == ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD) { // A cloud is not written out: how many points it has, and what they carry
                    let shown = this.telemetries[telem.id].data[dataType];
                    let points = dataPoint.data[0] ? dataPoint.data[0].length / 3 : 0;
                    shown.lastValue[0] = points;
                    shown.lastDisplayValue[0] = points + " points" + (dataPoint.data[1] ? ", intensity" : "") + (dataPoint.data[2] ? ", color" : "");
                    continue;
                }
                
                for(let dataChannel in dataPoint.data) {
                    let lastValue = dataPoint.data[dataChannel];
                    this.telemetries[telem.id].data[dataType].lastValue[channelIdx] = lastValue;
                    let displayStr = ""+lastValue;
                    // Per type conversion to lastDisplayValue
                    if(typeof lastValue === "number") displayStr = formatter.format(lastValue);
                    if(dataChannel == "1" && dataType == ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE) {
                        //console.log("img", targetTimestamp, dataPoint.timestamp)
                        let imgType = this.telemetries[telem.id].data[dataType].lastValue[0];
                        let imgTypeStr = "jpeg";
                        if (imgType == TELEPLOT.protocol.IMAGE_TYPE_PNG) imgTypeStr = "png";
                        displayStr = "data:image/" + imgTypeStr + ";base64," + displayStr;
                    }
                    this.telemetries[telem.id].data[dataType].lastDisplayValue[channelIdx] = displayStr;
                    channelIdx++;
                }
            }

            // A number with a range gets a bar, one with thresholds tells which one it is past
            let shownTelem = this.telemetries[telem.id];
            let number = shownTelem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER];
            let gauge = ViewCurrentValue.gauge(telem, number ? number.lastValue[0] : undefined, TELEPLOT.view.groups[this.group].cursorTimestamp);
            let gaugeKey = gauge === ViewCurrentValue.NO_GAUGE ? "" : JSON.stringify(gauge);
            if(shownTelem.gaugeKey !== gaugeKey) { // (only when it changed: the page is not redrawn for nothing)
                shownTelem.gaugeKey = gaugeKey;
                shownTelem.status = gauge.status;
                shownTelem.bar = gauge.bar;
            }
        }
        this.syncDisplayOrder(shown);

        // Labels under the bars (ends of the range, names of the thresholds): placed again when they or the width of the view change
        let scaleKey = "";
        if(this.options.displayScale) for(let id of shown) {
            let bar = this.telemetries[id].bar;
            if(bar) scaleKey += id + ":" + bar.min + ":" + bar.max + ":" + bar.ticks.map((tick) => tick.name + "@" + tick.at).join(",") + "|";
        }
        if(scaleKey !== "") { let element = document.getElementById(this.divId); scaleKey += element ? element.clientWidth : 0; }
        if(scaleKey !== this.scaleKey) {
            this.scaleKey = scaleKey;
            if(scaleKey !== "") TELEPLOT.Vue.nextTick(() => this.fitScales()); // (the DOM follows the data on the next tick)
        }
    }

    // An end of a range as it is written under the bar: at most 3 decimals, no trailing zeros
    static formatEnd(value) {
        return String(+Number(value).toFixed(3));
    }

    // Which of the labels placed along a bar are shown: [{left, width}] in pixels, in order of importance -> [true / false].
    // A label is dropped when it would touch one that is already shown (gap: pixels to leave between two labels).
    static fitLabels(labels, gap=4) {
        let kept = [];
        return labels.map((label) => {
            let free = kept.every((other) => label.left >= other.left + other.width + gap || label.left + label.width + gap <= other.left);
            if(free) kept.push(label);
            return free;
        });
    }

    // Places the names of the thresholds under their tick (kept inside the bar), then hides what overlaps: thresholds come first
    // (a limit without its name says little), the ends of the range take the room that is left (they are in the tooltip of the bar too)
    fitScales() {
        let element = document.getElementById(this.divId);
        if(!element || typeof element.querySelectorAll !== "function") return;
        for(let scale of element.querySelectorAll(".teleplot-js-current-value-scale")) {
            let width = scale.clientWidth;
            if(!width) continue;
            let ticks = Array.from(scale.querySelectorAll(".teleplot-js-current-value-scale-tick"));
            let ends = Array.from(scale.querySelectorAll(".teleplot-js-current-value-scale-end"));
            let labels = [];
            for(let tick of ticks) {
                let own = tick.offsetWidth, at = Number(tick.dataset.at) || 0;
                let left = Math.max(0, Math.min(width - own, at * width - own / 2));
                tick.style.left = left + "px";
                labels.push({ left, width: own });
            }
            for(let end of ends) labels.push({ left: end.offsetLeft, width: end.offsetWidth });
            let shown = ViewCurrentValue.fitLabels(labels);
            ticks.concat(ends).forEach((label, i) => { label.style.visibility = shown[i] ? "" : "hidden"; });
        }
    }

    // What the range and the thresholds of a telemetry say about a value at a time (the latest ones without time):
    //   status: { name, color } of the threshold the value is past (color "": none was given), undefined when it is past none
    //   bar: { fill (0 to 1: where the value is in the range), min, max, ticks: [{ at (0 to 1), name, color }] the thresholds inside
    //        the range }, undefined without a range that has both ends
    static NO_GAUGE = Object.freeze({ status: undefined, bar: undefined });
    static gauge(telem, value, timestamp=-1) {
        let range = telem.getRange();
        let hasThresholds = telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD] !== undefined;
        if(range === undefined && !hasThresholds) return ViewCurrentValue.NO_GAUGE;
        let isNumber = typeof value === "number" && !isNaN(value);
        let thresholds = hasThresholds ? telem.getThresholds(timestamp) : [];
        let past = isNumber ? telem.getThresholdStatus(value, timestamp) : undefined;
        let status = past === undefined ? undefined : { name: past.name, color: past.color };
        let bar = undefined;
        if(range !== undefined && range.min !== undefined && range.max !== undefined && range.max > range.min) {
            let place = (v) => Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min)));
            bar = { fill: isNumber ? place(value) : 0, min: range.min, max: range.max, ticks: [] };
            for(let threshold of thresholds) {
                if(threshold.value < range.min || threshold.value > range.max) continue;
                bar.ticks.push({ at: place(threshold.value), name: threshold.name, color: threshold.color });
            }
        }
        return (status === undefined && bar === undefined) ? ViewCurrentValue.NO_GAUGE : { status, bar };
    }
    
    static vueHTML = `
        <div class="teleplot-js-current-value-container teleplot-js-telemetry-card" 
        v-bind:class="{'teleplot-js-current-value-row': options.displayLayoutRow, 'teleplot-js-telemetry-card-drag-over':dragContext.isActive}"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}
        >
            <div v-if="emptyState.text" class="teleplot-js-empty">
                <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
                <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
            </div>
            <template v-if="!emptyState.text">
            <div v-for="telem in ordered" v-bind:key="telem.id" class="teleplot-js-current-value-block"
                v-bind:class="{'teleplot-js-current-value-block-image-only': telem.imageOnly, 'teleplot-js-current-value-off': dimmed[telem.id], 'teleplot-js-current-value-selectable': !!self.rowHandlers.click}"
                v-on:click="onRowClick(telem.id)" v-on:mouseenter="onRowEnter(telem.id)" v-on:mouseleave="onRowLeave(telem.id)">
                
                <div v-if="options.displayTelemetryColor && ordered.length>1" class="teleplot-js-current-value-color" v-bind:style="{'background-color': telem.color}"></div>
                
                <!-- NAME (the unit is written after the value) -->
                <div v-if="options.displayTelemetryName && !telem.imageOnly" class="teleplot-js-current-value-name" v-bind:title="telem.name">
                    <span>{{telem.name}}</span>
                </div>
                    
                <!-- NUMBERS & TEXT (one line per data type) -->
                <div class="teleplot-js-current-value-values">
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-text" 
                        v-bind:title="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastValue[0]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastDisplayValue[0]}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastValue[0]"
                        v-bind:style="telem.status ? {'color': telem.status.color || 'var(--teleplot-warn)'} : {}">
                        <span v-if="telem.status" class="teleplot-js-current-value-status" v-bind:title="'Past the threshold ' + telem.status.name">{{telem.status.name}}</span>
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastDisplayValue[0]}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[1]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastDisplayValue.join(", ")}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[1]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[2]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastDisplayValue.join(", ")}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD}].lastDisplayValue[0]}}</span>
                    </div>
                    <div v-if="telem.empty" class="teleplot-js-current-value-value teleplot-js-current-value-empty" title="No data yet">&mdash;</div>
                </div>

                <!-- RANGE: where the number is between its minimum and its maximum, with its thresholds -->
                <div v-if="telem.bar" class="teleplot-js-current-value-bar" v-bind:title="telem.bar.min + ' to ' + telem.bar.max + (telem.unit ? ' ' + telem.unit : '')">
                    <div class="teleplot-js-current-value-bar-fill" v-bind:style="{'width': (telem.bar.fill * 100) + '%', 'background': telem.status ? (telem.status.color || 'var(--teleplot-warn)') : telem.color}"></div>
                    <div v-for="tick in telem.bar.ticks" v-bind:key="tick.name" class="teleplot-js-current-value-bar-tick" v-bind:title="tick.name"
                        v-bind:style="{'left': (tick.at * 100) + '%', 'background': tick.color || 'var(--teleplot-warn)'}"></div>
                </div>
                <!-- ... and, lightly, what the bar goes from and to, and the names of the thresholds under their ticks (see fitScales) -->
                <div v-if="telem.bar && options.displayScale" class="teleplot-js-current-value-scale">
                    <span class="teleplot-js-current-value-scale-end">{{formatEnd(telem.bar.min)}}</span>
                    <span v-for="tick in telem.bar.ticks" v-bind:key="tick.name" class="teleplot-js-current-value-scale-tick" v-bind:data-at="tick.at"
                        v-bind:style="{'color': tick.color || 'var(--teleplot-warn)'}">{{tick.name}}</span>
                    <span class="teleplot-js-current-value-scale-end teleplot-js-current-value-scale-max">{{formatEnd(telem.bar.max)}}</span>
                </div>

                <!-- IMAGE -->
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}] != undefined" class="teleplot-js-current-value-image">
                    <img v-bind:src="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}].lastDisplayValue[1]"/>
                    <div v-if="telem.imageOnly && options.displayTelemetryName" class="teleplot-js-current-value-name" v-bind:title="telem.name">
                        <span>{{telem.name}}</span>
                        <span v-if="telem.unit"> ({{telem.unit}})</span>
                    </div>
                </div>
            </div>
            </template>
        </div>
    `;
    
    /*
     * Layout rules, in order of importance:
     * 1. Values are never clipped: text wraps, numbers don't (they are short). Names come second: at most 2 lines, the full name is in the tooltip.
     * 2. When a view is too small for its content, it scrolls instead of cutting the content.
     * 3. A telemetry with several kinds of data (number + text + image...) shows one line per kind.
     * 4. An image fills the room it is given (the view's, or what the other values leave); the name of an image-only telemetry is overlaid on it.
     */
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-current-value-container {
                padding: 0.25em 0.3em;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-evenly;
                overflow-x: hidden; /* Column mode: blocks always fit the width, so a vertical scrollbar must never create a horizontal one */
                overflow-y: auto;
                scrollbar-width: thin;
            }

            .teleplot-js-current-value-block {
                position: relative;
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                justify-content: end;
                align-items: center;
                gap: 0 0.5em;
                padding: 0.15em 0.5em 0.15em 0.8em; /* left: room for the color bar */
                box-sizing: border-box;
                flex: 1 0 auto; /* Shares the free height, never shrinks below its content */
            }

            .teleplot-js-current-value-selectable { cursor: pointer; }
            .teleplot-js-current-value-selectable:hover { background: color-mix(in srgb, var(--teleplot-text) 7%, transparent); }
            .teleplot-js-current-value-off { opacity: 0.45; }
            .teleplot-js-current-value-off .teleplot-js-current-value-name { text-decoration: line-through; }

            .teleplot-js-current-value-color {
                position: absolute;
                left: 0px;
                top: 0px;
                width: 0.3em;
                height: 100%
            }

            .teleplot-js-current-value-name {
                color: var(--teleplot-muted);
                font-size: 0.9em;
                flex: 1 1 6em;
                min-width: 0;
                overflow: hidden;
                overflow-wrap: anywhere;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
                line-clamp: 2;
            }

            .teleplot-js-current-value-values {
                flex: 0 1 auto;
                max-width: 100%;
                display: flex;
                flex-direction: column;
                align-items: end;
                text-align: end;
            }
            .teleplot-js-current-value-value {
                font-family: var(--teleplot-mono);
                font-weight: 650;
                font-size: 1.25em;
                overflow-wrap: anywhere;
                font-variant-numeric: tabular-nums; /* Digits keep their width: live values don't jitter */
            }
            .teleplot-js-current-value-text { /* Long texts (logs...) are cut after a few lines, the tooltip has all of it */
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 5;
                line-clamp: 5;
                overflow: hidden;
            }
            .teleplot-js-current-value-number { /* "42", "x, y", "x, y, z" must not wrap; what goes with them (the threshold that is passed, the unit) goes to another line when the view is narrow */
                white-space: nowrap;
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                align-items: baseline;
                max-width: 100%;
            }
            .teleplot-js-current-value-number > .teleplot-js-current-value-status { align-self: center; }
            .teleplot-js-current-value-empty {
                opacity: 0.4;
            }
            .teleplot-js-current-value-unit { /* after the value, smaller and quiet: the value is what is read first */
                margin-left: 0.3em;
                font-size: 0.6em;
                font-weight: 500;
                color: var(--teleplot-muted);
                white-space: normal; /* a long unit goes on under the number instead of being cut (the number itself never breaks) */
                overflow-wrap: anywhere;
                min-width: 0;
                max-width: 100%;
            }
            .teleplot-js-current-value-status { /* the threshold the value is past: said with its name, not only with a color */
                display: inline-block; max-width: 9em; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;
                margin-right: 0.6em; padding: 0.05em 0.55em; border: 1px solid currentColor; border-radius: 1em;
                font: 700 0.55em/1.5 var(--teleplot-mono); letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
            }
            .teleplot-js-current-value-bar { /* own line under the value */
                position: relative;
                flex: 1 0 100%;
                height: 0.3em;
                margin: 0.1em 0 0.3em;
                border-radius: 1em;
                background: color-mix(in srgb, var(--teleplot-text) 12%, transparent);
            }
            .teleplot-js-current-value-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; min-width: 2px; border-radius: inherit; }
            .teleplot-js-current-value-bar-tick { position: absolute; top: -0.2em; bottom: -0.2em; width: 2px; margin-left: -1px; border-radius: 1px; }
            .teleplot-js-current-value-bar:has(+ .teleplot-js-current-value-scale) { margin-bottom: 0.1em; }
            .teleplot-js-current-value-scale { /* own line under the bar: small and quiet, it is there to be glanced at */
                position: relative;
                flex: 1 0 100%;
                height: 1.25em;
                margin-bottom: 0.25em;
                font: 0.62em/1.25 var(--teleplot-mono);
                letter-spacing: 0.02em;
                color: var(--teleplot-muted);
                white-space: nowrap;
                overflow: hidden;
            }
            .teleplot-js-current-value-scale > span { position: absolute; top: 0; }
            .teleplot-js-current-value-scale-end { left: 0; opacity: 0.85; }
            .teleplot-js-current-value-scale-max { left: auto; right: 0; }
            .teleplot-js-current-value-scale-tick { left: 0; opacity: 0.9; text-transform: uppercase; }

            /* IMAGE: own line below the values, takes all the free room (the image is drawn to fit, whatever its size) */
            .teleplot-js-current-value-image {
                position: relative;
                flex: 1 0 100%;
                align-self: stretch;
                min-height: 5em;
            }
            .teleplot-js-current-value-block:has(.teleplot-js-current-value-image) {
                flex-grow: 4; /* Images are what people look at: they get more of the free height than numbers */
            }
            .teleplot-js-current-value-image img {
                border-radius: 4px;
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            .teleplot-js-current-value-image .teleplot-js-current-value-name {
                position: absolute;
                top: 0.1em;
                left: 0.1em;
                max-width: calc(100% - 0.2em);
                color: var(--teleplot-text);
                background: color-mix(in srgb, var(--teleplot-surface) 65%, transparent);
                backdrop-filter: blur(5px);
                border-radius: 3px;
                box-sizing: border-box;
                padding: 0.1em;
                transition: opacity .1s ease-in-out;
            }
            .teleplot-js-current-value-image img:hover + .teleplot-js-current-value-name {
                opacity: 0;
            }
            .teleplot-js-current-value-block-image-only {
                padding: 0;
            }
            .teleplot-js-current-value-block-image-only .teleplot-js-current-value-values {
                display: none;
            }
            .teleplot-js-current-value-block-image-only .teleplot-js-current-value-image {
                min-height: 4em;
            }
            
            /* Row mode: one column per telemetry */
            .teleplot-js-current-value-container.teleplot-js-current-value-row {
                flex-direction: row;
                overflow-x: auto; /* Columns have a minimum width: scroll when there are too many */
            }
            @scope (.teleplot-js-current-value-row) {
                .teleplot-js-current-value-block {
                    flex: 1 1 auto; /* Column as wide as its content, shrinks (text wraps) when the view is narrow */
                    min-width: 5em;
                    flex-direction: column;
                    flex-wrap: nowrap;
                    justify-content: safe center; /* "safe": a column taller than the view starts at the top (can be scrolled), instead of being cut on both sides */
                    align-items: center;
                    text-align: center;
                    padding: 0.4em 0.3em 0.15em 0.3em; /* top: room for the color bar */
                }
                .teleplot-js-current-value-color {
                    width: 100%;
                    height: 0.3em
                }
                .teleplot-js-current-value-name {
                    flex: 0 0 auto;
                    max-width: 100%;
                    display: block; /* A narrow column: one line and an ellipsis (tooltip has the full name) rather than a name broken in the middle of a word */
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }
                .teleplot-js-current-value-text {
                    -webkit-line-clamp: 3;
                    line-clamp: 3;
                    overflow-wrap: break-word; /* Wrap between words, break inside a word only if it is longer than the column */
                }
                .teleplot-js-current-value-values {
                    align-items: center;
                    text-align: center;
                }
                .teleplot-js-current-value-number { justify-content: center; }
                .teleplot-js-current-value-image {
                    flex: 1 0 auto;
                    align-self: stretch;
                }
                .teleplot-js-current-value-bar, .teleplot-js-current-value-scale {
                    flex: 0 0 auto;
                    align-self: stretch;
                }
                .teleplot-js-current-value-block:has(.teleplot-js-current-value-image) {
                    flex: 2 1 8em;
                }
                .teleplot-js-current-value-block-image-only {
                    padding: 0;
                    min-width: 0; /* An image has no content width to protect: it shrinks first, so a vertical scrollbar appearing does not push the columns into a horizontal scroll */
                }
            }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewCurrentValue.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewCurrentValue = ViewCurrentValue;