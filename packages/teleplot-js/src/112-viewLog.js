/*
 * Log view: every text update of one or more telemetries as a line, oldest at the top, newest at the bottom.
 * - Follows the time window of its group (the zoomed range when set, all the stored data otherwise).
 * - Cursor synchronisation: the line closest to the group cursor is highlighted (and scrolled into view when the cursor
 *   comes from another view), hovering a line moves the group cursor to its timestamp.
 * - Sticks to the newest line while scrolled to the bottom, stays where it is when the user scrolled up to read.
 * - Only the newest "maxLines" lines of the window are rendered (the stored data is untouched).
 */
class ViewLog extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "log";
        this.type = "teleplot-log";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];

        this.options.displayTimestamp = true;      // Show the time of each line
        this.options.displayTelemetryName = true;  // Show the telemetry name of each line (only when several telemetries are displayed)
        this.options.displayTelemetryColor = true; // Color mark of each line (only when several telemetries are displayed)
        this.options.maxLines = 500;               // Maximum number of lines displayed

        this.layout.width = 2;
        this.layout.height = 4;

        // Vue data
        this.state = TELEPLOT.Vue.reactive({
            rows: TELEPLOT.Vue.markRaw([]), // [{t, time, text, color, name}], replaced as a whole (not reactive in depth)
            hidden: 0,                      // Number of lines of the window not displayed (older than maxLines)
            multi: false,                   // Several telemetries: lines show which one they come from
            cursorIndex: -1                 // Line closest to the group cursor
        });
        this.lastKey = "";
        this.followLatest = true; // Is the view scrolled to the bottom ?
        this.hovering = false;    // Is the mouse over the view ? (then the cursor comes from this view, do not scroll)
        this.lastScrolledCursor = -2;
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    state: self.state,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext
                }
            },
            methods: {
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop,
                onScroll(event) { self.followLatest = ViewLog.isAtBottom(event.target); },
                onRowEnter(row) { self.hoverRow(row); },
                onLeave() { self.hoverEnd(); }
            },
            template: ViewLog.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);
        this.vue.mount(`#${this.divId}`);
    }

    // The mouse is over a line / left the view: the group cursor follows
    hoverRow(row) {
        this.hovering = true;
        TELEPLOT.view.groups[this.group].cursorTimestamp = row.t;
    }
    hoverEnd() {
        this.hovering = false;
        TELEPLOT.view.groups[this.group].cursorTimestamp = -1;
    }

    // First index of a sorted array whose value is >= x (or > x if strict)
    static bound(sorted, x, strict=false) {
        let lo = 0, hi = sorted.length;
        while (lo < hi) {
            let mid = (lo + hi) >> 1;
            if (strict ? sorted[mid] <= x : sorted[mid] < x) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    static isAtBottom(element) {
        return element.scrollHeight - element.scrollTop - element.clientHeight < 4;
    }

    static formatTime(t) { // t: seconds since epoch -> HH:MM:SS.mmm (local time)
        let d = new Date(t * 1000);
        let p = (n, w=2) => String(n).padStart(w, "0");
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
    }

    getTextEntry(telem) {
        for(let dataType in telem.data) {
            if(this.supportedDataTypes.includes(dataType)) return telem.data[dataType];
        }
        return undefined;
    }

    // Time window displayed: the zoomed range of the group, or everything
    getTimeWindow() {
        let group = TELEPLOT.view.groups[this.group];
        if (group.cursorActive && group.timestampFrom < group.timestampTo) return { from: group.timestampFrom, to: group.timestampTo };
        return { from: -Infinity, to: Infinity };
    }

    update(){
        if (!super.__before_update()) return;

        let range = this.getTimeWindow();
        let maxLines = Math.max(1, this.getOption("maxLines"));

        // Telemetries with text, and what changed since the last update
        let sources = [];
        let key = `${range.from},${range.to},${maxLines}`;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            let entry = this.getTextEntry(telem);
            if(entry === undefined) continue;
            sources.push({ telem, entry });
            key += `|${telem.id}:${entry.lastUpdate}:${entry.timestamps.length}`;
        }
        if (key != this.lastKey) {
            this.lastKey = key;
            this.rebuildRows(sources, range, maxLines);
        }
        this.updateCursor();
    }

    rebuildRows(sources, range, maxLines) {
        let rows = [];
        let total = 0;
        sources.forEach((source, idx) => {
            let { telem, entry } = source;
            let from = ViewLog.bound(entry.timestamps, range.from);
            let to = ViewLog.bound(entry.timestamps, range.to, true);
            total += to - from;
            let color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR) || TELEPLOT.colors.getColor(idx + 1).toStrRGB();
            let name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            for (let i = Math.max(from, to - maxLines); i < to; i++) {
                let t = entry.timestamps[i];
                rows.push({ t, time: ViewLog.formatTime(t), text: ""+entry.data[0][i], color, name });
            }
        });
        if (sources.length > 1) rows.sort((a, b) => a.t - b.t); // Stable: lines of the same instant keep the telemetry order
        if (rows.length > maxLines) rows.splice(0, rows.length - maxLines);
        let hidden = total - rows.length;

        this.state.multi = sources.length > 1;
        this.state.hidden = hidden;
        this.state.rows = TELEPLOT.Vue.markRaw(rows);
        this.afterRender(() => this.scrollToFollow());
    }

    // Highlight the line closest to the group cursor
    updateCursor() {
        let target = TELEPLOT.view.groups[this.group].cursorTimestamp;
        let rows = this.state.rows;
        let index = -1;
        if (target >= 0 && rows.length) {
            let lo = 0, hi = rows.length; // First line at or after the cursor
            while (lo < hi) { let mid = (lo + hi) >> 1; if (rows[mid].t < target) lo = mid + 1; else hi = mid; }
            index = (lo > 0 && (lo == rows.length || target - rows[lo-1].t <= rows[lo].t - target)) ? lo - 1 : lo;
        }
        let wasOnCursor = this.state.cursorIndex >= 0;
        if (index != this.state.cursorIndex) this.state.cursorIndex = index;
        if (index < 0 && wasOnCursor) { // Back to live: show the latest lines again
            this.followLatest = true;
            this.afterRender(() => this.scrollToFollow());
        }
        if (index != this.lastScrolledCursor) {
            this.lastScrolledCursor = index;
            if (index >= 0 && !this.hovering) this.afterRender(() => this.scrollToCursor());
        }
    }

    afterRender(callback) {
        let next = (TELEPLOT.Vue.nextTick) ? TELEPLOT.Vue.nextTick : queueMicrotask;
        next(callback);
    }

    getScrollElement() {
        let element = document.getElementById(this.divId);
        return element ? element.querySelector(".teleplot-js-log-container") : null;
    }

    scrollToFollow() {
        let scroller = this.getScrollElement();
        if (!scroller || !this.followLatest || this.state.cursorIndex >= 0) return;
        scroller.scrollTop = scroller.scrollHeight;
    }

    scrollToCursor() {
        let scroller = this.getScrollElement();
        let row = scroller && scroller.querySelector(".teleplot-js-log-row-cursor");
        if (row) row.scrollIntoView({ block: "nearest" });
    }

    static vueHTML = `
        <div class="teleplot-js-log-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        @scroll="onScroll($event)" @mouseleave="onLeave()"
        ${ViewTelemetries.dragDropHtml}>
            <div v-if="state.hidden > 0" class="teleplot-js-log-hidden">&hellip; {{state.hidden}} older line{{state.hidden > 1 ? 's' : ''}} not shown</div>
            <div v-for="(row, index) in state.rows" v-bind:key="index" class="teleplot-js-log-row"
                v-bind:class="{'teleplot-js-log-row-cursor': index == state.cursorIndex}"
                v-bind:style="state.multi && options.displayTelemetryColor ? {'border-left-color': row.color} : {}"
                v-bind:title="row.text" @mouseenter="onRowEnter(row)">
                <span v-if="options.displayTimestamp" class="teleplot-js-log-time">{{row.time}}</span>
                <span v-if="state.multi && options.displayTelemetryName" class="teleplot-js-log-name">{{row.name}}</span>
                <span class="teleplot-js-log-text">{{row.text}}</span>
            </div>
            <div v-if="!state.rows.length" class="teleplot-js-log-empty">No log yet</div>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-log-container {
                width: 100%;
                height: 100%;
                font-size: 0.8em;
                overflow-x: hidden;
                overflow-y: auto;
                scrollbar-width: thin;
            }
            .teleplot-js-log-row {
                display: flex;
                flex-direction: row;
                flex-wrap: wrap; /* Narrow view: the text goes below the time and name instead of being squeezed */
                align-items: baseline;
                gap: 0 0.6em;
                padding: 0.1em 0.4em;
                border-left: 3px solid transparent;
            }
            .teleplot-js-log-row-cursor {
                background-color: rgba(0, 126, 255, 0.25);
            }
            .teleplot-js-log-time {
                flex: 0 0 auto;
                font-family: monospace;
                opacity: 0.6;
            }
            .teleplot-js-log-name {
                flex: 0 1 auto;
                max-width: 30%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: bold;
            }
            .teleplot-js-log-text {
                flex: 1 1 10em;
                min-width: 0;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }
            .teleplot-js-log-hidden, .teleplot-js-log-empty {
                padding: 0.3em 0.5em;
                opacity: 0.6;
                font-style: italic;
            }
        }
    `;
}

TELEPLOT.view.ViewLog = ViewLog;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewLog.vueCSS;
    document.head.appendChild(elem);
}
