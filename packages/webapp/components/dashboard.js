function initComponent_dashboard(vue) {
    let name = "dashboard";

    vueHTML = `
        <div v-if="dashboard && dashboard.view" class="dashboard-layout">
            <div :id="dashboard.view.divId" class="dashboard-view">
            </div>
        </div>
    `;

    vueCSS = `
        .dashboard-layout {
            position: relative;
            width: 100%;
            height: 100%;
        }
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