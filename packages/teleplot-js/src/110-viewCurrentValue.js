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

        // Commands (doc/telecmd.md): settings are edited in place and actions called from their row, when CMD is on.
        // commandsUI false: never (a list of series of a chart). ui: what is being edited (one thing at a time in a view).
        this.commandsUI = true;
        this.ui = TELEPLOT.Vue.reactive({ hover: null, drag: null, edit: null, draft: "", error: "", form: {}, confirm: null, press: null });

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
                    dimmed: self.dimmed,
                    ui: self.ui
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
                // Commands
                caretAt: (telem) => self.caretAt(telem),
                barDown: (telem, event) => self.barDown(telem, event),
                barMove: (telem, event) => self.barMove(telem, event),
                barLeave: () => { self.ui.hover = null; },
                startEdit: (telem, event) => self.startEdit(telem, event),
                commitField: (telem) => self.commitField(telem),
                cancelEdit: () => self.cancelEdit(),
                toggle: (telem) => self.toggle(telem),
                pick: (telem, value) => self.pick(telem, value),
                actionDown: (telem, event) => self.actionDown(telem, event),
                actionUp: (telem) => self.actionUp(telem),
                confirmCall: (telem) => self.confirmCall(telem),
                callForm: (telem) => self.callForm(telem),
                formErrors: (telem) => self.formErrors(telem),
                argsOf: (telem) => TELEPLOT.commands.args(telem.telem),
                hasArgs: (telem) => TELEPLOT.commands.args(telem.telem).length > 0,
                statusIcon: (status) => ({ pending: "", applied: "✓", kept: "!", refused: "✕", noanswer: "✕", ok: "✓", err: "✕" }[status] || ""),
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
            // Commands: what can be written or called, and how the latest request went (only when it changed, too)
            let cmd = this.commandsUI ? ViewCurrentValue.commandState(telem, gauge.bar) : undefined;
            let cmdKey = cmd === undefined ? "" : JSON.stringify(cmd);
            if(shownTelem.cmdKey !== cmdKey) { shownTelem.cmdKey = cmdKey; shownTelem.cmd = cmd; }
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

    /*
     * Commands (doc/telecmd.md). What a row shows of a setting or an action, made of the library's state only (tested without a DOM):
     *   kind ("setting" | "action"), type, on (CMD), why (it cannot be written now), editable, continuous, choices, title, desc,
     *   confirm, longpress, color; a setting: status of its latest request ("pending", "applied", "kept", "refused", "noanswer"),
     *   reason (tooltip), targetAt (0 to 1: where the caret goes on the bar), reportedText; an action: call {id, status, text,
     *   duration, elapsed} of its latest call. undefined for a telemetry that is neither.
     */
    static commandState(telem, bar) {
        const C = TELEPLOT.commands, P = TELEPLOT.protocol;
        let declaration = C.declaration(telem);
        if(!declaration) return undefined;
        let on = TELEPLOT.state.commands === true;
        let why = on ? C.whyNot(telem) : "";
        let name = telem.getAttribute(P.TELEM_ATTR_NAME) || String(telem.id);
        let state = { kind: declaration.kind, type: declaration.type, on, why, editable: on && why === "", continuous: C.isContinuous(telem),
            choices: declaration.choices || [], title: telem.getAttribute(P.TELEM_ATTR_TITLE) || name, desc: telem.getAttribute(P.TELEM_ATTR_DESC) || "",
            confirm: declaration.confirm === true, longpress: declaration.longpress === true, color: telem.getAttribute(P.TELEM_ATTR_COLOR) || "" };
        if(declaration.kind === "setting") {
            let reported = C.reported(telem);
            state.reportedText = reported ? C.formatValue(declaration.type, reported.value) : "";
            let request = on ? C.request(telem) : undefined;
            state.status = request ? request.status : "";
            if(request) {
                let target = C.formatValue(declaration.type, request.target);
                state.reason = { pending: "Sent: " + target + ", waiting for the device", applied: "Applied: " + target,
                    kept: "Asked " + target + ": " + request.reason, refused: "Asked " + target + ", refused: " + request.reason, noanswer: "Asked " + target + ": " + request.reason }[request.status];
                if(bar && typeof request.target === "number" && (request.status === "pending" || request.status === "kept")) {
                    state.targetAt = Math.max(0, Math.min(1, (request.target - bar.min) / (bar.max - bar.min)));
                }
            }
        }
        else {
            let call = C.lastCall(telem);
            if(call) {
                state.call = { id: call.id, status: call.status, text: call.text || "" };
                if(call.end !== undefined && call.run !== undefined) state.call.duration = ViewCurrentValue.formatDuration(call.end - call.run);
                if(call.status === "run" && call.run !== undefined) state.call.elapsed = ViewCurrentValue.formatDuration(Math.max(0, Date.now() / 1000 - call.run));
            }
        }
        return state;
    }

    // "0.05 s", "3.8 s", "1 min 12 s"
    static formatDuration(seconds) {
        if(seconds < 10) return (Math.round(seconds * 100) / 100) + " s";
        if(seconds < 60) return (Math.round(seconds * 10) / 10) + " s";
        return Math.floor(seconds / 60) + " min " + Math.round(seconds % 60) + " s";
    }

    // The value of a setting where the bar is pointed at (0 to 1), on its step (else on a thousandth of the range, rounded nicely)
    static valueAt(bar, at, step) {
        let value = bar.min + Math.max(0, Math.min(1, at)) * (bar.max - bar.min);
        let grain = step > 0 ? step : Math.pow(10, Math.floor(Math.log10((bar.max - bar.min) / 1000)));
        let snapped = bar.min + Math.round((value - bar.min) / grain) * grain;
        let decimals = Math.max(0, -Math.floor(Math.log10(grain)) + 1);
        return Math.max(bar.min, Math.min(bar.max, Number(snapped.toFixed(decimals))));
    }

    // Where the caret of a row is (0 to 1), undefined when there is none: dragged, under the pointer, or what is asked
    caretAt(row) {
        if(!row.cmd || !row.cmd.on) return undefined;
        if(this.ui.drag && this.ui.drag.id === row.id) return this.ui.drag.at;
        if(row.cmd.targetAt !== undefined) return row.cmd.targetAt;
        if(this.ui.hover && this.ui.hover.id === row.id && row.cmd.editable) return this.ui.hover.at;
        return undefined;
    }

    static __barAt(event) {
        let rect = event.currentTarget.getBoundingClientRect();
        return rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
    }

    barMove(row, event) {
        if(!row.cmd || !row.cmd.editable || row.cmd.kind !== "setting" || row.cmd.continuous || this.ui.drag) return;
        this.ui.hover = { id: row.id, at: ViewCurrentValue.__barAt(event) };
    }

    barDown(row, event) {
        if(!row.cmd || !row.cmd.editable || row.cmd.kind !== "setting" || row.cmd.continuous || !row.bar) return;
        event.preventDefault();
        let bar = event.currentTarget, rect = bar.getBoundingClientRect();
        let at = (e) => rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
        let step = (TELEPLOT.commands.declaration(row.telem) || {}).step;
        let label = (a) => TELEPLOT.commands.formatNumber(ViewCurrentValue.valueAt(row.bar, a, step));
        this.ui.hover = null;
        this.ui.drag = { id: row.id, at: at(event), label: label(at(event)) };
        let move = (e) => { let a = at(e); this.ui.drag = { id: row.id, at: a, label: label(a) }; };
        let up = (e) => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            let a = e.type === "pointercancel" ? undefined : at(e);
            this.ui.drag = null;
            if(a !== undefined) TELEPLOT.commands.write(row.telem, ViewCurrentValue.valueAt(row.bar, a, step));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
    }

    // A click on the value of a setting: a field (numbers, texts, points) or the list of its choices
    startEdit(row, event) {
        if(!row.cmd || !row.cmd.editable || row.cmd.kind !== "setting" || row.cmd.continuous || row.cmd.type === "bool") return;
        if(event) event.stopPropagation();
        if(row.cmd.choices.length) { this.ui.edit = this.ui.edit && this.ui.edit.id === row.id ? null : { id: row.id, kind: "choices" }; return; }
        this.ui.edit = { id: row.id, kind: "field" };
        this.ui.draft = row.cmd.reportedText;
        this.ui.error = "";
        TELEPLOT.Vue.nextTick(() => {
            let element = document.getElementById(this.divId);
            let input = element && element.querySelector && element.querySelector(".teleplot-js-cmd-field input");
            if(input) { input.focus(); input.select(); }
        });
    }

    commitField(row) {
        let reason = TELEPLOT.commands.write(row.telem, this.ui.draft);
        if(reason) { this.ui.error = reason; return; }
        this.cancelEdit();
    }

    cancelEdit() {
        this.ui.edit = null;
        this.ui.error = "";
        this.ui.confirm = null;
    }

    toggle(row) {
        if(!row.cmd || !row.cmd.editable) return;
        let reported = TELEPLOT.commands.reported(row.telem);
        TELEPLOT.commands.write(row.telem, reported && Number(reported.value) ? 0 : 1);
    }

    pick(row, value) {
        TELEPLOT.commands.write(row.telem, value);
        this.cancelEdit();
    }

    // The button of an action: arguments open the form, "confirm" asks first, "longpress" must be held, else it calls
    actionDown(row, event) {
        if(!row.cmd || !row.cmd.editable) return;
        event.stopPropagation();
        if(TELEPLOT.commands.args(row.telem).length) {
            if(this.ui.edit && this.ui.edit.id === row.id) return this.cancelEdit();
            this.ui.edit = { id: row.id, kind: "form" };
            this.ui.form = {};
            for(let arg of TELEPLOT.commands.args(row.telem)) this.ui.form[arg.name] = arg.type === "bool" ? (arg.optional ? "" : "0") : "";
            return;
        }
        if(row.cmd.longpress) {
            let start = Date.now();
            this.ui.press = { id: row.id, progress: 0 };
            let timer = setInterval(() => {
                if(!this.ui.press || this.ui.press.id !== row.id) return clearInterval(timer);
                let progress = (Date.now() - start) / 1000;
                if(progress >= 1) { clearInterval(timer); this.ui.press = null; TELEPLOT.commands.call(row.telem, {}); }
                else this.ui.press = { id: row.id, progress };
            }, 30);
            return;
        }
        if(row.cmd.confirm) { this.ui.confirm = row.id; return; }
        TELEPLOT.commands.call(row.telem, {});
    }

    actionUp(row) { if(this.ui.press && this.ui.press.id === row.id) this.ui.press = null; }

    confirmCall(row) {
        this.ui.confirm = null;
        TELEPLOT.commands.call(row.telem, {});
    }

    formErrors(row) { return TELEPLOT.commands.validate(row.telem, this.ui.form).errors; }

    callForm(row) {
        let result = TELEPLOT.commands.call(row.telem, this.ui.form);
        if(result.reason === "") this.cancelEdit();
        else this.ui.error = result.reason;
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
                
                <!-- NAME (the unit is written after the value); a pen when it can be written (CMD on) -->
                <div v-if="options.displayTelemetryName && !telem.imageOnly" class="teleplot-js-current-value-name" v-bind:title="telem.cmd && telem.cmd.desc ? telem.name + ': ' + telem.cmd.desc : telem.name">
                    <span>{{telem.name}}</span><span v-if="telem.cmd && telem.cmd.on && telem.cmd.kind == 'setting'" class="teleplot-js-cmd-pen"
                        v-bind:title="telem.cmd.why || (telem.cmd.continuous ? 'Driven from a joystick view' : 'Can be changed: drag the bar or click the value')">✎</span>
                </div>

                <!-- COMMANDS: the state of the latest request of a setting -->
                <span v-if="telem.cmd && telem.cmd.status == 'pending'" class="teleplot-js-cmd-spin" v-bind:title="telem.cmd.reason"></span>
                <span v-else-if="telem.cmd && telem.cmd.status" class="teleplot-js-cmd-icon" v-bind:class="'teleplot-js-cmd-' + telem.cmd.status" v-bind:title="telem.cmd.reason">{{statusIcon(telem.cmd.status)}}</span>

                <!-- An action: its last call, and its button (CMD on) -->
                <div v-if="telem.cmd && telem.cmd.kind == 'action'" class="teleplot-js-cmd-action">
                    <span v-if="telem.cmd.call && telem.cmd.call.duration !== undefined" class="teleplot-js-cmd-last" v-bind:title="'#' + telem.cmd.call.id + (telem.cmd.call.text ? ': ' + telem.cmd.call.text : '')">
                        <span class="teleplot-js-cmd-icon" v-bind:class="'teleplot-js-cmd-' + telem.cmd.call.status">{{statusIcon(telem.cmd.call.status)}}</span>{{telem.cmd.call.duration}}</span>
                    <span v-else-if="telem.cmd.call && telem.cmd.call.status == 'noanswer'" class="teleplot-js-cmd-last" title="No answer">
                        <span class="teleplot-js-cmd-icon teleplot-js-cmd-noanswer">✕</span></span>
                    <template v-if="telem.cmd.on">
                        <template v-if="ui.confirm == telem.id">
                            <button class="teleplot-js-cmd-button" v-on:click.stop="cancelEdit()">Cancel</button>
                            <button class="teleplot-js-cmd-button teleplot-js-cmd-danger" v-on:click.stop="confirmCall(telem)">{{telem.cmd.title}}?</button>
                        </template>
                        <button v-else class="teleplot-js-cmd-button" v-bind:disabled="!telem.cmd.editable || (telem.cmd.call && (telem.cmd.call.status == 'sent' || telem.cmd.call.status == 'run'))"
                            v-bind:class="{'teleplot-js-cmd-colored': !!telem.cmd.color}" v-bind:style="telem.cmd.color ? {'--cmd-color': telem.cmd.color} : {}"
                            v-bind:title="telem.cmd.why || telem.cmd.desc || telem.cmd.title"
                            v-on:pointerdown="actionDown(telem, $event)" v-on:pointerup="actionUp(telem)" v-on:pointerleave="actionUp(telem)" v-on:click.stop>
                            <span v-if="ui.press && ui.press.id == telem.id" class="teleplot-js-cmd-fill" v-bind:style="{'width': (ui.press.progress * 100) + '%'}"></span>
                            <template v-if="telem.cmd.call && telem.cmd.call.status == 'sent'"><span class="teleplot-js-cmd-spin"></span>#{{telem.cmd.call.id}}</template>
                            <template v-else-if="telem.cmd.call && telem.cmd.call.status == 'run'"><span class="teleplot-js-cmd-spin teleplot-js-cmd-running"></span>{{telem.cmd.call.elapsed}}</template>
                            <template v-else>{{telem.cmd.title}}{{hasArgs(telem) ? ' …' : ''}}</template>
                        </button>
                    </template>
                </div>

                <!-- A setting being typed -->
                <div v-if="ui.edit && ui.edit.id == telem.id && ui.edit.kind == 'field'" class="teleplot-js-cmd-field" v-on:click.stop>
                    <input type="text" v-model="ui.draft" v-on:keydown.enter.prevent="commitField(telem)" v-on:keydown.esc.prevent="cancelEdit()" v-on:blur="cancelEdit()"
                        v-bind:class="{'teleplot-js-cmd-bad': !!ui.error}" v-bind:title="ui.error || 'Enter sends, Esc cancels'"/>
                    <span v-if="ui.error" class="teleplot-js-cmd-error">{{ui.error}}</span>
                </div>
                    
                <!-- NUMBERS & TEXT (one line per data type) -->
                <div v-else-if="!(telem.cmd && telem.cmd.kind == 'action')" class="teleplot-js-current-value-values"
                    v-bind:class="{'teleplot-js-cmd-editable': telem.cmd && telem.cmd.editable && telem.cmd.kind == 'setting' && !telem.cmd.continuous && telem.cmd.type != 'bool'}"
                    v-on:click="startEdit(telem, $event)">
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-text" 
                        v-bind:title="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastValue[0]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastDisplayValue[0]}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastValue[0]"
                        v-bind:style="telem.status ? {'color': telem.status.color || 'var(--teleplot-warn)'} : {}">
                        <span v-if="telem.status" class="teleplot-js-current-value-status" v-bind:title="'Threshold: ' + telem.status.name">{{telem.status.name}}</span>
                        <span>{{telem.cmd && telem.cmd.type == 'bool' ? telem.cmd.reportedText : telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastDisplayValue[0]}}</span><span v-if="telem.unit" class="teleplot-js-current-value-unit">{{telem.unit}}</span>
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

                <!-- A switch for a bool setting (CMD on), striped on its new side until the echo -->
                <span v-if="telem.cmd && telem.cmd.on && telem.cmd.type == 'bool' && !telem.cmd.continuous" class="teleplot-js-cmd-switch"
                    v-bind:class="{'teleplot-js-cmd-switch-on': telem.cmd.reportedText == 'on', 'teleplot-js-cmd-switch-pending': telem.cmd.status == 'pending', 'teleplot-js-cmd-disabled': !telem.cmd.editable}"
                    v-bind:title="telem.cmd.why || telem.cmd.reason || 'Switch'" v-on:click.stop="toggle(telem)"></span>

                <!-- RANGE: where the number is between its minimum and its maximum, with its thresholds; the caret is a target (commands) -->
                <div v-if="telem.bar" class="teleplot-js-current-value-bar" v-bind:title="telem.bar.min + ' to ' + telem.bar.max + (telem.unit ? ' ' + telem.unit : '')"
                    v-bind:class="{'teleplot-js-cmd-bar': telem.cmd && telem.cmd.editable && telem.cmd.kind == 'setting' && !telem.cmd.continuous}"
                    v-on:pointerdown="barDown(telem, $event)" v-on:pointermove="barMove(telem, $event)" v-on:pointerleave="barLeave()">
                    <div class="teleplot-js-current-value-bar-fill" v-bind:style="{'width': (telem.bar.fill * 100) + '%', 'background': telem.status ? (telem.status.color || 'var(--teleplot-warn)') : telem.color}"></div>
                    <div v-for="tick in telem.bar.ticks" v-bind:key="tick.name" class="teleplot-js-current-value-bar-tick" v-bind:title="tick.name"
                        v-bind:style="{'left': (tick.at * 100) + '%', 'background': tick.color || 'var(--teleplot-warn)'}"></div>
                    <div v-if="caretAt(telem) !== undefined" class="teleplot-js-cmd-caret" v-bind:style="{'left': (caretAt(telem) * 100) + '%'}"
                        v-bind:class="{'teleplot-js-cmd-caret-hover': !(ui.drag && ui.drag.id == telem.id) && telem.cmd.targetAt === undefined, 'teleplot-js-cmd-caret-pending': telem.cmd.status == 'pending' && !(ui.drag && ui.drag.id == telem.id), 'teleplot-js-cmd-caret-kept': telem.cmd.status == 'kept'}"></div>
                    <div v-if="ui.drag && ui.drag.id == telem.id" class="teleplot-js-cmd-bubble" v-bind:style="{'left': (ui.drag.at * 100) + '%'}">{{ui.drag.label}}</div>
                </div>
                <!-- ... and, lightly, what the bar goes from and to, and the names of the thresholds under their ticks (see fitScales) -->
                <div v-if="telem.bar && options.displayScale" class="teleplot-js-current-value-scale">
                    <span class="teleplot-js-current-value-scale-end">{{formatEnd(telem.bar.min)}}</span>
                    <span v-for="tick in telem.bar.ticks" v-bind:key="tick.name" class="teleplot-js-current-value-scale-tick" v-bind:data-at="tick.at"
                        v-bind:style="{'color': tick.color || 'var(--teleplot-warn)'}">{{tick.name}}</span>
                    <span class="teleplot-js-current-value-scale-end teleplot-js-current-value-scale-max">{{formatEnd(telem.bar.max)}}</span>
                </div>

                <!-- The choices of a setting, opened by a click on its value -->
                <div v-if="ui.edit && ui.edit.id == telem.id && ui.edit.kind == 'choices'" class="teleplot-js-cmd-choices" v-on:click.stop>
                    <template v-if="telem.cmd.choices.length <= 5">
                        <button v-for="choice in telem.cmd.choices" v-bind:key="choice" v-bind:class="{'teleplot-js-cmd-choice-current': choice == telem.cmd.reportedText}" v-on:click.stop="pick(telem, choice)">{{choice}}</button>
                    </template>
                    <select v-else v-on:change="pick(telem, $event.target.value)">
                        <option v-for="choice in telem.cmd.choices" v-bind:key="choice" v-bind:value="choice" v-bind:selected="choice == telem.cmd.reportedText">{{choice}}</option>
                    </select>
                </div>

                <!-- The form of an action with arguments: one field per argument, in order -->
                <div v-if="ui.edit && ui.edit.id == telem.id && ui.edit.kind == 'form'" class="teleplot-js-cmd-form" v-on:click.stop v-on:keydown.esc="cancelEdit()">
                    <div v-if="telem.cmd.desc" class="teleplot-js-cmd-form-desc">{{telem.cmd.desc}}</div>
                    <div v-for="arg in argsOf(telem)" v-bind:key="arg.name" class="teleplot-js-cmd-arg">
                        <div class="teleplot-js-cmd-arg-label"><b>{{arg.name}}</b><span>{{arg.type}}{{arg.unit ? ' · ' + arg.unit : ''}}{{arg.min !== undefined || arg.max !== undefined ? ' · ' + (arg.min !== undefined ? arg.min : '') + ' – ' + (arg.max !== undefined ? arg.max : '') : ''}}</span><i>{{arg.optional ? 'optional' : ''}}</i></div>
                        <div v-if="arg.choices && arg.choices.length" class="teleplot-js-cmd-choices">
                            <button v-for="choice in arg.choices" v-bind:key="choice" v-bind:class="{'teleplot-js-cmd-choice-current': ui.form[arg.name] == choice}" v-on:click.stop="ui.form[arg.name] = ui.form[arg.name] == choice && arg.optional ? '' : choice">{{choice}}</button>
                        </div>
                        <label v-else-if="arg.type == 'bool'" class="teleplot-js-cmd-check"><input type="checkbox" v-bind:checked="ui.form[arg.name] == '1'" v-on:change="ui.form[arg.name] = $event.target.checked ? '1' : '0'"/> {{arg.name}}</label>
                        <input v-else type="text" v-model="ui.form[arg.name]" v-bind:placeholder="arg.default !== undefined ? arg.default : (arg.type == 'pose2d' ? 'x, y, yaw' : (arg.type == 'xy' ? 'x, y' : (arg.type == 'xyz' ? 'x, y, z' : '')))"
                            v-bind:class="{'teleplot-js-cmd-bad': formErrors(telem)[arg.name] && ui.form[arg.name] !== ''}" v-on:keydown.enter.prevent="Object.keys(formErrors(telem)).length || callForm(telem)"/>
                        <div class="teleplot-js-cmd-arg-help" v-bind:class="{'teleplot-js-cmd-error': formErrors(telem)[arg.name] && ui.form[arg.name] !== ''}">{{formErrors(telem)[arg.name] && ui.form[arg.name] !== '' ? formErrors(telem)[arg.name] : (arg.desc || '') + (arg.optional && arg.default !== undefined ? ' Empty: ' + arg.default + '.' : '')}}</div>
                    </div>
                    <div class="teleplot-js-cmd-form-buttons">
                        <span v-if="ui.error" class="teleplot-js-cmd-error">{{ui.error}}</span>
                        <button class="teleplot-js-cmd-button" v-on:click.stop="cancelEdit()">Cancel</button>
                        <button class="teleplot-js-cmd-button teleplot-js-cmd-primary" v-bind:disabled="Object.keys(formErrors(telem)).length > 0" v-on:click.stop="callForm(telem)">{{telem.cmd.title}}</button>
                    </div>
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

            /* COMMANDS (doc/telecmd.md): only drawn when CMD is on, light enough not to move the layout */
            .teleplot-js-cmd-pen { color: var(--teleplot-primary); margin-left: 0.3em; font-size: 0.85em; }
            .teleplot-js-cmd-editable { cursor: text; }
            .teleplot-js-cmd-editable .teleplot-js-current-value-value > span:not(.teleplot-js-current-value-unit):not(.teleplot-js-current-value-status) { border-bottom: 1px dashed color-mix(in srgb, var(--teleplot-primary) 70%, transparent); }
            .teleplot-js-cmd-icon { display: inline-grid; place-items: center; flex: none; width: 1.05em; height: 1.05em; border-radius: 50%; font: 700 0.7em/1 sans-serif; color: #fff; margin-right: 0.3em; }
            .teleplot-js-cmd-applied, .teleplot-js-cmd-ok { background: #1e9e5a; }
            .teleplot-js-cmd-kept { background: var(--teleplot-warn); }
            .teleplot-js-cmd-refused, .teleplot-js-cmd-noanswer, .teleplot-js-cmd-err { background: var(--teleplot-error); }
            .teleplot-js-cmd-spin { display: inline-block; flex: none; width: 0.75em; height: 0.75em; border-radius: 50%; border: 2px solid var(--teleplot-primary); border-right-color: transparent; animation: teleplot-js-cmd-rot 0.8s linear infinite; vertical-align: -0.1em; margin-right: 0.3em; }
            .teleplot-js-cmd-running { border-color: #1e9e5a; border-right-color: transparent; }
            @keyframes teleplot-js-cmd-rot { to { transform: rotate(360deg); } }
            .teleplot-js-cmd-bar { cursor: pointer; touch-action: none; }
            .teleplot-js-cmd-bar::before { content: ""; position: absolute; left: 0; right: 0; top: -0.6em; bottom: -0.6em; } /* (a bar is thin: a taller target) */
            .teleplot-js-cmd-caret { position: absolute; top: -0.7em; width: 0; height: 0; margin-left: -0.4em; border-left: 0.4em solid transparent; border-right: 0.4em solid transparent; border-top: 0.5em solid var(--teleplot-primary); pointer-events: none; }
            .teleplot-js-cmd-caret::after { content: ""; position: absolute; left: -0.5px; top: 0; width: 1px; height: 0.9em; background: var(--teleplot-primary); opacity: 0.8; }
            .teleplot-js-cmd-caret-hover { opacity: 0.45; }
            .teleplot-js-cmd-caret-pending { animation: teleplot-js-cmd-bob 1s ease-in-out infinite; }
            .teleplot-js-cmd-caret-kept { border-top-color: var(--teleplot-warn); }
            .teleplot-js-cmd-caret-kept::after { background: var(--teleplot-warn); }
            @keyframes teleplot-js-cmd-bob { 50% { transform: translateY(-2px); } }
            .teleplot-js-cmd-bubble { position: absolute; bottom: 1em; transform: translateX(-50%); font: 700 0.7em var(--teleplot-mono); color: #fff; background: var(--teleplot-primary); border-radius: 0.5em; padding: 0 0.4em; white-space: nowrap; pointer-events: none; z-index: 2; }
            .teleplot-js-cmd-switch { flex: none; position: relative; width: 2.1em; height: 1.15em; border-radius: 1em; background: color-mix(in srgb, var(--teleplot-text) 12%, transparent); border: 1px solid var(--teleplot-line); cursor: pointer; }
            .teleplot-js-cmd-switch::after { content: ""; position: absolute; top: 0.1em; left: 0.1em; width: 0.85em; height: 0.85em; border-radius: 50%; background: var(--teleplot-muted); transition: left .15s; }
            .teleplot-js-cmd-switch-on { background: var(--teleplot-primary); border-color: var(--teleplot-primary); }
            .teleplot-js-cmd-switch-on::after { left: 1.05em; background: #fff; }
            .teleplot-js-cmd-switch-pending { background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--teleplot-primary) 45%, transparent) 0 4px, transparent 4px 8px); border: 1px dashed var(--teleplot-primary); }
            .teleplot-js-cmd-disabled { opacity: 0.45; cursor: not-allowed; }
            .teleplot-js-cmd-field { flex: 0 1 12em; display: flex; flex-direction: column; align-items: end; min-width: 0; }
            .teleplot-js-cmd-field input, .teleplot-js-cmd-form input[type=text], .teleplot-js-cmd-choices select {
                font: 0.95em var(--teleplot-mono); width: 100%; min-width: 4em; box-sizing: border-box; padding: 0.1em 0.35em; border-radius: 0.35em;
                border: 1px solid var(--teleplot-primary); background: var(--teleplot-bg); color: var(--teleplot-text);
            }
            .teleplot-js-cmd-form input[type=text] { border-color: var(--teleplot-line); }
            .teleplot-js-cmd-form input[type=text]:focus { border-color: var(--teleplot-primary); outline: none; }
            .teleplot-js-cmd-form input::placeholder { color: var(--teleplot-muted); font-style: italic; }
            input.teleplot-js-cmd-bad { border-color: var(--teleplot-error) !important; }
            .teleplot-js-cmd-error { color: var(--teleplot-error); font-size: 0.75em; }
            .teleplot-js-cmd-choices { flex: 1 0 100%; display: flex; gap: 0.15em; padding: 0.15em; margin: 0.2em 0; border-radius: 0.6em; background: color-mix(in srgb, var(--teleplot-text) 8%, transparent); }
            .teleplot-js-cmd-choices button { flex: 1; font: 0.82em sans-serif; padding: 0.1em 0.3em; border: 1px solid transparent; border-radius: 0.45em; background: none; color: var(--teleplot-muted); cursor: pointer; white-space: nowrap; }
            .teleplot-js-cmd-choices button:hover { background: color-mix(in srgb, var(--teleplot-primary) 12%, transparent); }
            .teleplot-js-cmd-choices .teleplot-js-cmd-choice-current { background: var(--teleplot-surface); color: var(--teleplot-text); font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
            .teleplot-js-cmd-action { flex: 0 1 auto; display: flex; align-items: center; justify-content: flex-end; gap: 0.35em; flex-wrap: wrap; }
            .teleplot-js-cmd-last { display: inline-flex; align-items: center; font: 0.8em var(--teleplot-mono); color: var(--teleplot-muted); white-space: nowrap; }
            .teleplot-js-cmd-button { position: relative; overflow: hidden; display: inline-flex; align-items: center; font: 600 0.82em sans-serif; padding: 0.15em 0.65em; border-radius: 0.45em;
                border: 1px solid var(--teleplot-line); background: var(--teleplot-bg); color: var(--teleplot-text); cursor: pointer; white-space: nowrap; }
            .teleplot-js-cmd-button:hover:not(:disabled) { border-color: var(--teleplot-primary); }
            .teleplot-js-cmd-button:disabled { opacity: 0.55; cursor: default; }
            .teleplot-js-cmd-primary { background: var(--teleplot-primary); border-color: var(--teleplot-primary); color: #fff; }
            .teleplot-js-cmd-danger { background: var(--teleplot-error); border-color: var(--teleplot-error); color: #fff; }
            .teleplot-js-cmd-colored { background: var(--cmd-color); border-color: var(--cmd-color); color: #fff; }
            .teleplot-js-cmd-fill { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, currentColor 25%, transparent); pointer-events: none; }
            .teleplot-js-cmd-form { flex: 1 0 100%; margin: 0.3em 0 0.2em; padding: 0.45em 0.55em; border: 1px solid var(--teleplot-line); border-radius: 0.5em; background: var(--teleplot-bg); font-size: 0.95em; cursor: default; }
            .teleplot-js-cmd-form-desc { color: var(--teleplot-muted); font-size: 0.85em; margin-bottom: 0.2em; }
            .teleplot-js-cmd-arg { margin-top: 0.35em; }
            .teleplot-js-cmd-arg-label { display: flex; gap: 0.4em; align-items: baseline; font-size: 0.85em; margin-bottom: 0.1em; }
            .teleplot-js-cmd-arg-label b { font-family: var(--teleplot-mono); }
            .teleplot-js-cmd-arg-label span { color: var(--teleplot-muted); }
            .teleplot-js-cmd-arg-label i { margin-left: auto; font-style: normal; color: var(--teleplot-muted); font-size: 0.9em; }
            .teleplot-js-cmd-arg-help { font-size: 0.75em; color: var(--teleplot-muted); min-height: 1em; }
            .teleplot-js-cmd-check { font-size: 0.85em; }
            .teleplot-js-cmd-form-buttons { display: flex; gap: 0.35em; justify-content: flex-end; align-items: center; margin-top: 0.45em; }

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