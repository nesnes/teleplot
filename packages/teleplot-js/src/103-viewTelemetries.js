class ViewTelemetries extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.name = "telemetry";
        if (this.constructor === ViewTelemetries)
        {
            throw new Error("ViewTelemetries is an abstract class, it should only be inherited but never instanciated !");
        }

        // View options
        this.options._telemetry = {};
        this.setOption("displayNumberDecimals", 3);

        this.options.title = "";             // Text written in a corner of the view
        this.supportedLabel = "";            // Kind of data the view shows, for its empty state ("number", "text"...). Empty: any kind
        this.emptyState = TELEPLOT.Vue.reactive({ text: "", hint: "" }); // What to say instead of an empty view (nothing when there is something to show)
        this.telemetryIdOrNameList = [];
        this.dragContext =  TELEPLOT.Vue.reactive({
            isActive: false,
            counter: 0
        });
    }

    // Telemetries displayed by the view (ids or names). Reactive: applications can bind a list on it.
    get telemetryIdOrNameList() { return this._telemetryIdOrNameList; }
    set telemetryIdOrNameList(list) { this._telemetryIdOrNameList = TELEPLOT.Vue.reactive(Array.from(list || [])); }

    // What a view displays, in the order of the telemetry list: ids (of the telemetries that exist) of this.telemetries, which holds the data of each.
    // Components iterate this order, never the keys of this.telemetries (integer keys always come out in ascending order, whatever the list says).
    // Entries of telemetries no longer in the list are dropped.
    syncDisplayOrder(ids) {
        if(!this.displayOrder) this.displayOrder = TELEPLOT.Vue.reactive([]);
        if(this.displayOrder.length !== ids.length || ids.some((id, i) => this.displayOrder[i] !== id)) this.displayOrder.splice(0, this.displayOrder.length, ...ids);
        for(let key of Object.keys(this.telemetries)) if(!ids.some((id) => String(id) === key)) delete this.telemetries[key];
    }

    // Show a telemetry (id or name) in the view. false when it already is.
    addTelemetry(telemIdOrName) {
        let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
        let alreadyThere = this.telemetryIdOrNameList.some((entry) => {
            let other = TELEPLOT.datastore.getTelemetry(entry);
            return entry === telemIdOrName || (telem !== undefined && other !== undefined && other.id == telem.id);
        });
        if(alreadyThere) return false;
        this.telemetryIdOrNameList.push(telem !== undefined ? telem.id : telemIdOrName);
        return true;
    }

    // Moves a telemetry in the list (display order, series order of a chart): from an index to another. false when an index is out of range.
    moveTelemetry(fromIndex, toIndex) {
        let list = this.telemetryIdOrNameList;
        if(!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return false;
        if(fromIndex === toIndex) return true;
        let [entry] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, entry);
        return true;
    }

    // Stop showing a telemetry (id or name). false when it wasn't shown.
    removeTelemetry(telemIdOrName) {
        let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
        let idx = this.telemetryIdOrNameList.findIndex((entry) => {
            let other = TELEPLOT.datastore.getTelemetry(entry);
            return entry === telemIdOrName || (telem !== undefined && other !== undefined && other.id == telem.id);
        });
        if(idx < 0) return false;
        this.telemetryIdOrNameList.splice(idx, 1);
        return true;
    }

    // Color of the first telemetry of the view (what its top color shows): the telemetry's color, or the palette color its series gets. "" when none yet.
    getAccentColor() {
        let index = 0;
        for(let entry of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            if(telem === undefined) continue;
            index++;
            return telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR) || TELEPLOT.colors.getColor(index).toStrRGB();
        }
        return "";
    }

    // Why the view has nothing to show, if it has nothing: {text, hint}, both empty otherwise
    getEmptyState() {
        let nameOf = (telem) => telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id);
        let list = (names) => names.slice(0, 3).join(", ") + (names.length > 3 ? ", \u2026" : "");
        let entries = Array.from(this.telemetryIdOrNameList);
        if(!entries.length) return { text: "No telemetry", hint: "Drop one from the Telemetries panel" };

        let found = [], missing = [];
        for(let entry of entries) {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            if(telem === undefined) missing.push(String(entry)); else found.push(telem);
        }
        if(!found.length) return { text: "Waiting for data", hint: list(missing) };

        let hasData = (telem) => Object.keys(telem.data).length > 0;
        if(!found.some(hasData)) return { text: "Waiting for data", hint: list(found.map(nameOf)) };
        if(this.supportedDataTypes && !found.some((telem) => Object.keys(telem.data).some((type) => this.supportedDataTypes.includes(type)))) {
            let others = found.filter(hasData).map(nameOf);
            return { text: "Nothing to display", hint: `This view shows ${this.supportedLabel || "other"} data, not the one of ${list(others)}` };
        }
        return { text: "", hint: "" };
    }

    __sync(element) {
        super.__sync(element);
        let accent = this.getAccentColor();
        if(accent) { if(element.style.getPropertyValue("--teleplot-accent") !== accent) element.style.setProperty("--teleplot-accent", accent); }
        else element.style.removeProperty("--teleplot-accent");
        let empty = this.getEmptyState();
        if(empty.text !== this.emptyState.text) this.emptyState.text = empty.text;
        if(empty.hint !== this.emptyState.hint) this.emptyState.hint = empty.hint;
    }

    // Options a user can change, to build forms: [{key, label, type: "bool" | "int", min?, max?, step?}]
    getOptionsSchema() {
        return [{ key: "displayNumberDecimals", label: "Decimals", type: "int", min: 0, max: 10, step: 1 }];
    }

    clone() {
        let copy = new this.constructor("", this.telemetryIdOrNameList.slice(), this.group);
        return this.__copyStateTo(copy);
    }

    setOption(name, value, telemetryNameOrId) {
        // View-wide option
        if (telemetryNameOrId === null || telemetryNameOrId === undefined || telemetryNameOrId == "") {
            super.setOption(name, value);
            return;
        }
        // Telemetry-specific option
        let telem = TELEPLOT.datastore.getTelemetry(telemetryNameOrId);
        if(telem === undefined) return false;
        if(this.options._telemetry[telem.id] == undefined) { this.options._telemetry[telem.id] = {}; }
        this.options._telemetry[telem.id][name] = value;
    }

    getOption(name, telemetryNameOrId=undefined) {
        // Check for telemetry-specific option
        if (telemetryNameOrId !== null && telemetryNameOrId !== undefined) {
            let telem = TELEPLOT.datastore.getTelemetry(telemetryNameOrId);
            if( telem !== undefined 
             && this.options._telemetry[telem.id] !== undefined
             && this.options._telemetry[telem.id][name] !== undefined)
            { 
                return this.options._telemetry[telem.id][name];
            }
        }
        // Fallback to view-wide options
        return super.getOption(name);
    }

    onDragEnter(event, view) {
        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        if(!isTelemetry) return;
        view.dragContext.counter++;
        view.dragContext.isActive = true;
    }
    onDragLeave(event, view) {
        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        if(!isTelemetry) return;
        view.dragContext.counter--;
        view.dragContext.isActive = view.dragContext.counter > 0;
    }
    onDragDrop(event, view) {
        view.dragContext.isActive = false;
        view.dragContext.counter = 0;

        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        let hasId = event.dataTransfer.types.includes("text/x-teleplot-drag-id")
        if(!(isTelemetry && hasId)) return;

        // One telemetry ("drag-id"), or several (a group: "drag-ids", comma separated ids)
        let ids = [Number(event.dataTransfer.getData("text/x-teleplot-drag-id"))];
        if(event.dataTransfer.types.includes("text/x-teleplot-drag-ids")) {
            ids = event.dataTransfer.getData("text/x-teleplot-drag-ids").split(",").map(Number);
        }
        for(let id of ids) {
            if(TELEPLOT.datastore.getTelemetry(id) !== undefined) view.addTelemetry(id); // unknown telemetries are ignored
        }
    }

    static dragDropHtml = `
        @dragover.prevent
        @dragenter.stop.prevent="onDragEnter($event, self)"
        @dragleave="onDragLeave($event, self)"
        @drop.prevent="onDragDrop($event, self)"
        :class="{'teleplot-js-telemetry-card-drag-over': dragContext.isActive}"
    `;
    
}

TELEPLOT.view.ViewTelemetries = ViewTelemetries;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-telemetry-card { /* look: see 104-theme.js */
                min-height: calc( 4em * var(--layout-height, 1)); /* height step: 4em each */
                height: 100%; /* fills the cell when the layout stretches its views (align: stretch) */
            }
        }
    `;
    document.head.appendChild(elem);
}