// Handle default theme: the one of the system, also when it changes during the session (the last choice made wins: system or Edit panel)
{
    const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (darkQuery?.matches) document.documentElement.dataset["theme"] = "dark";
    darkQuery?.addEventListener?.("change", (event) => { document.documentElement.dataset["theme"] = event.matches ? "dark" : "light"; });
}

var app = Vue.createApp({
    data() {
        return {
            TP: Vue.reactive({}),
            ctx: Vue.reactive({
                sidePanel: "",   // Panel of the left dock: "telemetries", "sources" or ""
                helpOpen: false, // The Help panel, in its own dock on the right: it can be open next to a left panel
                helpRequest: null, // {sender, tile}: what the Help shows when it opens (the language to write its lines for, a tile); taken by the panel
                exportOpen: false, // The Export and import panel, on the right too: it takes the place of Help (one of the two at a time)
                topPanel: "",
                showHelp: true,
                sampleRunning: false,
                sampleError: "", // Why the sample could not start (sample-controls.js)
                bandVisible: false, // The band above the dashboard (room for the top menu) is scrolled into view
                activeDashboard: null,
                timeGroup: "",  // The time group the time line of the top menu, Space and Esc act on ("": the dashboard's own, see doc/time.md)
                droppedFiles: null // Files dropped on the page, waiting for the Export panel to take them
            }),
            editor: null,
            shownPanel: "", // The side panel on display: it stays until the dock has finished closing
            shownHelp: false, // Same for the Help panel
            shownExport: false, // And for the Export and import panel
            sheets: false, // Panels are sheets rising from the bottom (no room for them beside the dashboard: style.css "Sheets")
            sheet: 0.55,   // Height of a sheet, as a share of the window (its grip changes it)
            grip: null     // The grip of a sheet being dragged: {startY, start, dock}
        }
    },
    computed: {
        sheetShown() { return !!(this.ctx.sidePanel || this.ctx.helpOpen || this.ctx.exportOpen || this.editor.state.enabled); }
    },
    methods: {
        // The edit chrome (pills, "+") follows the views while a dock opens or closes: refresh it on every frame until the motion ends
        motion(event, delta){
            const t = event.target;
            if (!t.classList || !(t.classList.contains("dock") || t.classList.contains("main-panel"))) return;
            this._moving = Math.max(0, (this._moving || 0) + delta);
            if (this._moving && !this._frame) {
                const frame = ()=>{
                    this.editor.refresh();
                    this._frame = this._moving ? requestAnimationFrame(frame) : 0;
                };
                this._frame = requestAnimationFrame(frame);
            }
        },
        // The grip of a sheet: its height follows the pointer; let go near the bottom, the sheet closes (the edit panel keeps a small height)
        gripDown(event, dock){
            if (!this.sheets) return;
            event.preventDefault();
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) {}
            this.grip = { startY: event.clientY, start: this.sheet, dock };
            const target = event.currentTarget;
            const move = (e)=>{ this.sheet = Math.min(0.92, Math.max(0.12, this.grip.start + (this.grip.startY - e.clientY) / window.innerHeight)); };
            const up = ()=>{
                target.removeEventListener("pointermove", move);
                target.removeEventListener("pointerup", up);
                target.removeEventListener("pointercancel", up);
                const dock = this.grip.dock, start = this.grip.start;
                this.grip = null;
                if (this.sheet >= 0.25) return;
                if (dock == "edit") { this.sheet = 0.3; return; }
                this.sheet = start; // (the next one opens at the height this one had)
                if (dock == "left") this.ctx.sidePanel = "";
                else if (dock == "help") this.ctx.helpOpen = false;
                else if (dock == "export") this.ctx.exportOpen = false;
            };
            target.addEventListener("pointermove", move);
            target.addEventListener("pointerup", up);
            target.addEventListener("pointercancel", up);
        },
        // Edit mode on a sheet: the selected element is scrolled into the part of the dashboard above the sheet
        revealSelection(){
            const view = this.editor.getSelected(), ws = this._workspace;
            const el = view && document.getElementById(view.divId);
            if (!el || !ws) return;
            const top = scrollerTop(ws) + 5 * parseFloat(getComputedStyle(document.documentElement).fontSize); // (under the top menu)
            const room = window.innerHeight * (1 - this.sheet) - top;
            const box = el.getBoundingClientRect();
            if (box.top >= top && box.bottom <= top + room) return;
            ws.scrollBy({ top: box.top - top, behavior: "smooth" });
        }
    },
    watch: {
        // Editing keeps the menu: show the band so that it does not hide the data
        "editor.state.enabled"(enabled){
            if (enabled && this._workspace) this._workspace.scrollTo({ top: 0, behavior: "smooth" });
        },
        "ctx.sidePanel"(name){
            clearTimeout(this._dockTimer);
            if (name && this.sheets) { this.ctx.helpOpen = false; this.ctx.exportOpen = false; } // One sheet at a time
            if (name) this.shownPanel = name;
            else this._dockTimer = setTimeout(()=>{ if (!this.ctx.sidePanel) this.shownPanel = ""; }, 400); // Longer than the dock transition (style.css)
        },
        "ctx.exportOpen"(open){
            clearTimeout(this._exportTimer);
            if (open) { this.shownExport = true; this.ctx.helpOpen = false; if (this.sheets) this.ctx.sidePanel = ""; }
            else this._exportTimer = setTimeout(()=>{ if (!this.ctx.exportOpen) this.shownExport = false; }, 400);
        },
        "ctx.helpOpen"(open){
            clearTimeout(this._helpTimer);
            if (open) { this.shownHelp = true; this.ctx.exportOpen = false; if (this.sheets) this.ctx.sidePanel = ""; }
            else this._helpTimer = setTimeout(()=>{ if (!this.ctx.helpOpen) this.shownHelp = false; }, 400);
        },
        "editor.state.selectedId"(id){
            if (id && this.sheets) this.$nextTick(()=>this.revealSelection());
        },
        // The editor works on the displayed dashboard
        "ctx.activeDashboard"(dashboard){
            this.editor.setRoot(dashboard ? dashboard.getView() : undefined);
            if (!dashboard) this.editor.setEnabled(false);
        }
    },
    mounted() {
        // The workspace starts scrolled past the band of room for the top menu (style.css): full stage for the data. Scrolling up reveals the band.
        const ws = this._workspace = dashboardScroller();
        const band = ()=> parseFloat(getComputedStyle(document.querySelector(".workspace")).getPropertyValue("--tm-h")) * parseFloat(getComputedStyle(document.documentElement).fontSize);
        ws.scrollTop = band();
        scrollEventsOf(ws).addEventListener("scroll", ()=>{
            if (ws.scrollLeft) ws.scrollLeft = 0; // (it cannot be scrolled sideways by hand, but focus and scripts could: never hide the left of the views)
            this.ctx.bandVisible = ws.scrollTop < band() - 1;
            this.editor.refresh(); // The edit chrome follows the scroll
            // Never rest half way through the band: settle on one side
            clearTimeout(this._settleTimer);
            this._settleTimer = setTimeout(()=>{
                const top = ws.scrollTop, b = band();
                if (top > 0 && top < b - 1) ws.scrollTo({ top: top < b / 2 ? 0 : b, behavior: "smooth" });
            }, 140);
        }, { passive: true });
        // Sheets or docks: the panels rise from the bottom when they would leave the dashboard too little room beside them (style.css)
        const narrow = window.matchMedia("(max-width: 640px)");
        const apply = ()=>{
            this.sheets = narrow.matches;
            if (this.sheets && this.ctx.sidePanel && (this.ctx.helpOpen || this.ctx.exportOpen)) this.ctx.sidePanel = "";
        };
        apply();
        narrow.addEventListener("change", apply);
    },
    created() {
        // Escape closes the open popup, then brings the chosen time group back to live (Shift: every group of the dashboard), then closes
        // the Help, then the side panel, then leaves the edit mode
        this._onKeyDown = (e)=>{
            if (e.key != "Escape") return;
            const t = e.target;
            if (t && (t.tagName == "INPUT" || t.tagName == "TEXTAREA" || t.isContentEditable)) { if (t.blur) t.blur(); return; }
            if (t && t.blur && t.closest && t.closest(".tm")) t.blur();
            const T = Vue.toRaw(this.TP), dashboard = this.ctx.activeDashboard;
            const base = dashboard ? dashboard.getGroupName() : "", group = this.ctx.timeGroup || base;
            const notLive = (name) => !T.view.isLive(name) || T.view.isZoomed(name);
            const dashboardNotLive = base !== "" && Object.keys(T.view.groups).some((name) => (name === base || name.startsWith(base + T.view.TIME_GROUP_SEPARATOR)) && notLive(name));
            if (this.ctx.topPanel) this.ctx.topPanel = "";
            else if (e.shiftKey && dashboardNotLive) { T.view.allLive(base); this.ctx.timeGroup = ""; }
            else if (group && notLive(group)) T.view.backToLive(group);
            else if (this.ctx.helpOpen) this.ctx.helpOpen = false;
            else if (this.ctx.exportOpen) this.ctx.exportOpen = false;
            else if (this.ctx.sidePanel) this.ctx.sidePanel = "";
            else if (this.editor.state.enabled) this.editor.setEnabled(false);
        };
        window.addEventListener("keydown", this._onKeyDown);
        // A mouse click leaves the focus on no button of the page, so that Space holds the display instead of pressing that button again
        // (the keyboard keeps its focus: event.detail is 0 for a click made with Enter or Space)
        window.addEventListener("click", (e)=>{
            if (!e.detail || !e.target || !e.target.closest) return;
            const button = e.target.closest("button, summary");
            if (button && button === document.activeElement && button.blur) button.blur();
        });
        initTeleplot(this.TP);
        this.editor = initDashboardEditor(this.TP);
        initTouchTips(this.editor); // A finger held on something shows its tooltip (there is no hover)
        setInterval(()=>this.editor.refresh(), 100); // Edit chrome follows the views as they appear, resize or move
        // Display new telemetries automatically, and show the dashboard that gets created for them
        this.TP.dashboards.enableAutoDashboard("Live", (dashboard)=>{
            if (!this.ctx.activeDashboard) this.ctx.activeDashboard = dashboard;
        });
        // A dashboard that a device describes (DASH lines, labels that are paths) is displayed when it shows up, unless the user is
        // looking at a dashboard of their own or editing
        this.TP.dashboards.onReceivedDashboardHooks.push((dashboard)=>{
            const active = this.ctx.activeDashboard;
            if (!active || (active.isAuto && !this.editor.state.enabled)) this.ctx.activeDashboard = dashboard;
        });
        // Files dropped on the page go to the Export panel, which says what each holds before opening it (see panel-export.js)
        this._onFileDragOver = (event)=>{ if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); };
        this._onFileDrop = (event)=>{
            if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
            event.preventDefault();
            this.ctx.droppedFiles = Vue.markRaw(Array.from(event.dataTransfer.files));
            this.ctx.exportOpen = true;
        };
        window.addEventListener("dragover", this._onFileDragOver);
        window.addEventListener("drop", this._onFileDrop);
        console.log("Teleplot loaded:", this.TP);
        Vue.provide("TP", this.TP);
        Vue.provide("ctx", this.ctx);
        Vue.provide("editor", this.editor);

        // Create default connection
        const server = defaultServer();
        this.TP.connection.addConnectionTeleplotServer(server.address, server.port);
        startSourcesMonitor(this.TP); // The Sources panel shows the last minute of the data rate, even when it is opened later
    }
});

// Load components
// v-value: the value of a field that comes from the application (used with @change, in place of ":value").
// Panels redraw several times per second (timers, live data), and a plain ":value" then writes the stored value back over what is being
// typed. v-value leaves the field alone from the first key typed until the entry is confirmed (change) or left (blur); then the field
// shows what the application holds again (the entry as it was taken: clamped, rounded, refused...).
// Every text or number field bound to application state must use it.
app.directive("value", {
    mounted(el, binding) {
        const show = () => { const text = String(el.__appValue ?? ""); if (!el.__editing && el.value !== text) el.value = text; };
        el.__appValue = binding.value;
        el.__editing = false;
        show();
        const done = () => { el.__editing = false; setTimeout(show, 400); }; // (redraws show it sooner; this is for a panel that would not redraw)
        el.addEventListener("input", () => { el.__editing = true; });
        el.addEventListener("change", done);
        el.addEventListener("blur", done);
    },
    updated(el, binding) {
        el.__appValue = binding.value;
        const text = String(binding.value ?? "");
        if (!el.__editing && el.value !== text) el.value = text;
    }
});

initComponent_top_menu(app);
initComponent_welcome(app);
initComponent_panel_help(app);
initComponent_panel_sources(app);
initComponent_panel_export(app);
initComponent_panel_telemetries(app);
initComponent_panel_edit(app);
initComponent_dashboard(app);

app.mount("#app")

// Copy a text. navigator.clipboard only exists on secure pages (https or localhost): a phone that opens the page of a computer at its
// address on the network (http://192.168.x.x) has the older way only, a selected field and the copy command.
function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => {});
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0; font-size: 16px;"; // (16 px: Safari on iPhone does not zoom on it)
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    try { document.execCommand("copy"); } catch (e) { /* (nothing more to try) */ }
    field.remove();
}

// The Teleplot server the page connects to at first: the one it came from (the server gives the page and its WebSocket on the same
// port), so that a phone or another computer that opens http://192.168.x.x:8080 reaches that server and not itself. A page opened as a
// file has no server of its own: the server of this machine, on its default port.
function defaultServer() {
    const page = window.location;
    if (page.protocol != "http:" && page.protocol != "https:" || !page.hostname) return { address: "127.0.0.1", port: 8080 };
    return { address: page.hostname, port: Number(page.port) || (page.protocol == "https:" ? 443 : 80) };
}

// What scrolls the dashboard. With a finger, the page itself: Safari on iPhone (and phones' browsers) hide their bars only when the
// page scrolls, not an element in it; the docks then stay in place by being sticky (style.css, "pointer: coarse"). With a mouse, the
// workspace scrolls by itself between the docks, as it always did. Decided once, at load (the media query of style.css is the same).
function pageScrolls() {
    if (pageScrolls.value === undefined) pageScrolls.value = window.matchMedia("(pointer: coarse)").matches;
    return pageScrolls.value;
}
function dashboardScroller() { return pageScrolls() ? document.scrollingElement : document.querySelector(".workspace"); }
// Where its scroll events come (the page's come to the window) and where its visible part starts
function scrollEventsOf(scroller) { return scroller === document.scrollingElement ? window : scroller; }
function scrollerTop(scroller) { return scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top; }
