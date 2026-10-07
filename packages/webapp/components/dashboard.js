function initComponent_dashboard(vue) {
    let name = "dashboard";

    const vueHTML = `
        <div v-if="dashboard && dashboard.view" class="dashboard-layout">
            <div :id="dashboard.view.divId" class="dashboard-view">
            </div>
        </div>
    `;

    const vueCSS = `
        .dashboard-layout {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        .dashboard-layout > .dashboard-view { flex: 1 1 auto; min-height: 0; }
        /* Room under the dashboard, always there (the layout does not jump): the drop zone of a telemetry drag lives in it (dashboard-editor.js) */
        .dashboard-layout::after { content: ""; flex: none; height: 84px; }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    return vue.component(name, {
        name: name,
        props: ["dashboard"],
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
            }
        },
        template: vueHTML,
    });
}