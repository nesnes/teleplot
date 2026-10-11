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
                exportOpen: false, // The Export and import panel, on the right too: it takes the place of Help (one of the two at a time)
                topPanel: "",
                showHelp: true,
                sampleRunning: false,
                bandVisible: false, // The band above the dashboard (room for the top menu) is scrolled into view
                activeDashboard: null,
                droppedFiles: null // Files dropped on the page, waiting for the Export panel to take them
            }),
            editor: null,
            shownPanel: "", // The side panel on display: it stays until the dock has finished closing
            shownHelp: false, // Same for the Help panel
            shownExport: false // And for the Export and import panel
        }
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
        }
    },
    watch: {
        // Editing keeps the menu: show the band so that it does not hide the data
        "editor.state.enabled"(enabled){
            if (enabled && this._workspace) this._workspace.scrollTo({ top: 0, behavior: "smooth" });
        },
        "ctx.sidePanel"(name){
            clearTimeout(this._dockTimer);
            if (name) this.shownPanel = name;
            else this._dockTimer = setTimeout(()=>{ if (!this.ctx.sidePanel) this.shownPanel = ""; }, 400); // Longer than the dock transition (style.css)
        },
        "ctx.exportOpen"(open){
            clearTimeout(this._exportTimer);
            if (open) { this.shownExport = true; this.ctx.helpOpen = false; }
            else this._exportTimer = setTimeout(()=>{ if (!this.ctx.exportOpen) this.shownExport = false; }, 400);
        },
        "ctx.helpOpen"(open){
            clearTimeout(this._helpTimer);
            if (open) { this.shownHelp = true; this.ctx.exportOpen = false; }
            else this._helpTimer = setTimeout(()=>{ if (!this.ctx.helpOpen) this.shownHelp = false; }, 400);
        },
        // The editor works on the displayed dashboard
        "ctx.activeDashboard"(dashboard){
            this.editor.setRoot(dashboard ? dashboard.getView() : undefined);
            if (!dashboard) this.editor.setEnabled(false);
        }
    },
    mounted() {
        // The workspace starts scrolled past the band of room for the top menu (style.css): full stage for the data. Scrolling up reveals the band.
        const ws = this._workspace = document.querySelector(".workspace");
        const band = ()=> parseFloat(getComputedStyle(ws).getPropertyValue("--tm-h")) * parseFloat(getComputedStyle(document.documentElement).fontSize);
        ws.scrollTop = band();
        ws.addEventListener("scroll", ()=>{
            this.ctx.bandVisible = ws.scrollTop < band() - 1;
            this.editor.refresh(); // The edit chrome follows the scroll
            // Never rest half way through the band: settle on one side
            clearTimeout(this._settleTimer);
            this._settleTimer = setTimeout(()=>{
                const top = ws.scrollTop, b = band();
                if (top > 0 && top < b - 1) ws.scrollTo({ top: top < b / 2 ? 0 : b, behavior: "smooth" });
            }, 140);
        }, { passive: true });
    },
    created() {
        // Escape closes the open popup, then goes back to live (drops the zoom), then closes the Help, then the side panel, then leaves the edit mode
        this._onKeyDown = (e)=>{
            if (e.key != "Escape") return;
            const t = e.target;
            if (t && (t.tagName == "INPUT" || t.tagName == "TEXTAREA" || t.isContentEditable)) { if (t.blur) t.blur(); return; }
            if (t && t.blur && t.closest && t.closest(".tm")) t.blur();
            if (this.ctx.topPanel) this.ctx.topPanel = "";
            else if (this.TP.view.isZoomed()) { this.TP.view.backToLive(); this.TP.state.isPaused = false; }
            else if (this.ctx.helpOpen) this.ctx.helpOpen = false;
            else if (this.ctx.exportOpen) this.ctx.exportOpen = false;
            else if (this.ctx.sidePanel) this.ctx.sidePanel = "";
            else if (this.editor.state.enabled) this.editor.setEnabled(false);
        };
        window.addEventListener("keydown", this._onKeyDown);
        initTeleplot(this.TP);
        this.editor = initDashboardEditor(this.TP);
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
        this.TP.connection.addConnectionTeleplotServer("127.0.0.1", 8080);
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


