// Handle default theme
if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    document.documentElement.dataset["theme"] = "dark"
}

var app = Vue.createApp({
    data() {
        return {
            TP: Vue.reactive({}),
            sidePanel: ""
        }
    },
    created() {
        initTeleplot(this.TP)
        console.log("Teleplot loaded:", this.TP);
        setTimeout(()=>{
            this.TP.connection.addConnectionTeleplotServer("127.0.0.1", 8080);
        }, 1000)
    }
});
app.mount("#app")


