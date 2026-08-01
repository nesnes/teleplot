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
                showHelp: true
            })
        }
    },
    created() {
        initTeleplot(this.TP);
        this.TP.datastore.onNewTelemetryHooks.push((telem)=>{
            console.log("On new telem", telem, this);
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
initComponent_dashboard(app);

app.mount("#app")


