// Handle default theme
if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    document.documentElement.dataset["theme"] = "dark"
}

var app = Vue.createApp({
    data() {
        return {
            TP: Vue.reactive({}),
            ctx: Vue.reactive({
                sidePanel: "",
                topPanel: "",
                showHelp: true,
                sampleRunning: false,
                bandVisible: false, // The band above the dashboard (room for the top menu) is scrolled into view
                activeDashboard: null
            }),
            editor: null,
            shownPanel: "" // The side panel on display: it stays until the dock has finished closing
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
        // Escape closes the open panel (top panel first, then side panel)
        this._onKeyDown = (e)=>{
            if (e.key != "Escape") return;
            const t = e.target;
            if (t && (t.tagName == "INPUT" || t.tagName == "TEXTAREA" || t.isContentEditable)) { if (t.blur) t.blur(); return; }
            if (t && t.blur && t.closest && t.closest(".tm")) t.blur();
            if (this.ctx.topPanel) this.ctx.topPanel = "";
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
        console.log("Teleplot loaded:", this.TP);
        Vue.provide("TP", this.TP);
        Vue.provide("ctx", this.ctx);
        Vue.provide("editor", this.editor);

        // Create default connection
        this.TP.connection.addConnectionTeleplotServer("127.0.0.1", 8080);
    }
});

// Load components
initComponent_top_menu(app);
initComponent_welcome(app);
initComponent_panel_help(app);
initComponent_panel_sources(app);
initComponent_panel_telemetries(app);
initComponent_panel_edit(app);
initComponent_dashboard(app);

app.mount("#app")


