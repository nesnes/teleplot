// Handle default theme
if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    document.documentElement.dataset["theme"] = "dark"
}

var app = Vue.createApp({
    data() {
        return {
            TP: Vue.reactive({}),
            ctx: Vue.reactive({
                showMenu: false,
                sidePanel: "",
                topPanel: "",
                showHelp: true,
                activeDashboard: null
            }),
            editor: null
        }
    },
    methods: {
        toggleSidePanel(name){
            this.ctx.sidePanel = (this.ctx.sidePanel == name) ? "" : name;
            this.ctx.showMenu = false;
        },
        // Dashboards in the order they are listed: the auto one first, then the others by creation
        dashboardList(){
            const all = Object.values(this.TP.dashboards.dashboards);
            return all.filter(d=>d.isAuto).concat(all.filter(d=>!d.isAuto));
        },
        dashboardSummary(dashboard){
            const s = dashboard.getStats();
            const telemetries = s.telemetryCount + (s.telemetryCount == 1 ? " telemetry" : " telemetries");
            if (dashboard.isAuto) return "auto · " + telemetries;
            return s.viewCount + (s.viewCount == 1 ? " view" : " views") + " · " + telemetries;
        },
        selectDashboard(dashboard){
            this.ctx.activeDashboard = dashboard;
            this.ctx.topPanel = "";
        },
        editDashboard(dashboard){
            this.ctx.activeDashboard = dashboard;
            this.ctx.topPanel = "";
            this.editor.setRoot(dashboard.getView());
            this.editor.setEnabled(true);
        },
        newDashboard(){
            this.editDashboard(this.TP.dashboards.createDashboard());
        },
        toggleEdit(){
            if (!this.ctx.activeDashboard) return;
            this.editor.setRoot(this.ctx.activeDashboard.getView());
            this.editor.setEnabled(!this.editor.state.enabled);
        },
        setTopPanel(name){
            if (this.ctx.topPanel == name) { this.ctx.topPanel = ""; }
            else { this.ctx.topPanel = name; }
        }
    },
    watch: {
        // The editor works on the displayed dashboard
        "ctx.activeDashboard"(dashboard){
            this.editor.setRoot(dashboard ? dashboard.getView() : undefined);
            if (!dashboard) this.editor.setEnabled(false);
        }
    },
    created() {
        // Escape closes the open panel (top panel first, then side panel)
        this._onKeyDown = (e)=>{
            if (e.key != "Escape") return;
            const t = e.target;
            if (t && (t.tagName == "INPUT" || t.tagName == "TEXTAREA" || t.isContentEditable)) { if (t.blur) t.blur(); return; }
            if (t && t.blur && t.classList && t.classList.contains("top-menu-item")) t.blur();
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
initComponent_panel_help(app);
initComponent_panel_sources(app);
initComponent_panel_telemetries(app);
initComponent_panel_edit(app);
initComponent_dashboard(app);

app.mount("#app")


