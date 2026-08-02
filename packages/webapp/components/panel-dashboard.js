function initComponent_panel_dashboard_view(vue) {
    let name = "panel-dashboard-view";

    vueHTML = `
        <div v-if="view" class="panel-dashboard-view glass-material" >
            <div class="panel-dashboard-view-header"
            @click.stop="expanded=!expanded;"
            @mouseover.stop="highlightInDashboard(true)"
            @mouseleave.stop="highlightInDashboard(false)">
                <template v-if="isLayout()">
                    <i v-if="!expanded" class="icofont-plus-square"></i>
                    <i v-else class="icofont-minus-square"></i>
                </template>
                <template v-else>
                    <i v-if="view.type === 'teleplot-chart'" class="icofont-chart-line"></i>
                    <i v-if="view.type === 'teleplot-current-value'" class="icofont-listing-number"></i>
                </template>
                <span class="panel-dashboard-view-name">{{isLayout() ? view.layout.type : view.type}}</span>
            </div>
            
            <template v-if="isLayout()" v-for="subview in view.views" :key="subview.id">
                <panel-dashboard-view v-show="expanded" :view="subview"/>
            </template>
        </div>
    `;

    vueCSS = `
        .panel-dashboard-view {
            display: flex;
            flex-direction: column;
            padding-left: 0.5em;
            cursor: pointer;
        }
        .panel-dashboard-view-header {
            display: flex;
            flex-direction: row;
            align-items: center;
        }
        .panel-dashboard-view-name {
            margin-left: 0.5em;
        }
        .dashboard-layout {
            .teleplot-js-style {
                background-color: none;
            }
            .teleplot-js-view-highlight {
                background-color: var(--color-bg-dark);
            }
        }
    `;
    // Add css to head
    { let elem = document.createElement('style'); elem.textContent = vueCSS; document.head.appendChild(elem); }

    return vue.component(name, {
        name: name,
        props: ["view"],
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                expanded: true
            }
        },
        methods: {
            isLayout() { return this.view.type === "teleplot-layout"; },
            highlightInDashboard(highlight) { 
                let element = document.getElementById(this.view.divId);
                if (element == null) { return; }
                if (highlight) {
                    element.classList.add("teleplot-js-view-highlight");
                } else {
                    element.classList.remove("teleplot-js-view-highlight");
                }
            }

        },
        template: vueHTML,
    });
}

function initComponent_panel_dashboard(vue) {
    initComponent_panel_dashboard_view(vue);

    let name = "panel-dashboard";

    vueHTML = `
        <div class="dashboard-layout">
            <panel-dashboard-view v-if="ctx.activeDashboard && ctx.activeDashboard.view" :view="ctx.activeDashboard.view"/>
        </div>
    `;

    vueCSS = `
        .dashboard-layout {
            display: flex;
            flex-direction: column;
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
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                sampleDataInterval: false
            }
        },
        methods: {
        },
        template: vueHTML,
    });
}