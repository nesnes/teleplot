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
            })
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
            this.ctx.sidePanel = "dashboard";
            this.ctx.topPanel = "";
        },
        newDashboard(){
            this.ctx.activeDashboard = this.TP.dashboards.createDashboard();
            this.ctx.sidePanel = "dashboard";
            this.ctx.topPanel = "";
        },
        setTopPanel(name){
            if (this.ctx.topPanel == name) { this.ctx.topPanel = ""; }
            else { this.ctx.topPanel = name; }
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
        };
        window.addEventListener("keydown", this._onKeyDown);
        initTeleplot(this.TP);
        // Display new telemetries automatically, and show the dashboard that gets created for them
        this.TP.dashboards.enableAutoDashboard("Live", (dashboard)=>{
            if (!this.ctx.activeDashboard) this.ctx.activeDashboard = dashboard;
        });
        console.log("Teleplot loaded:", this.TP);
        Vue.provide("TP", this.TP);
        Vue.provide("ctx", this.ctx);

        // Create default connection
        this.TP.connection.addConnectionTeleplotServer("127.0.0.1", 8080);
    }
});

// Load components
initComponent_panel_help(app);
initComponent_panel_sources(app);
initComponent_panel_telemetries(app);
initComponent_panel_dashboard(app);
initComponent_dashboard(app);

app.mount("#app")


