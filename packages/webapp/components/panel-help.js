function initComponent_panel_help(vue) {
    let name = "panel-help";

    vueHTML = `
        <div class="help-layout">
            <span style="color:var(--color-text-muted);">Ridiculously-simple telemetry viewer.</span>
            
            <button v-if="!sampleDataInterval" @click="startSampleData()">Preview sample data</button>
            <button v-else @click="stopSampleData()">Stop sample data</button>
        </div>
    `;

    vueCSS = `
        .help-layout {
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
            startSampleData() {
                let
                sampleDataInterval = setInterval(()=>{
                    // Update Telemetries
                    this.TP.datastore.getOrCreateTelemetry("sample.sin").addData(this.TP.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [Date.now()/1000], [[Math.sin(Date.now()/1000)*100]]);
                    this.TP.datastore.getOrCreateTelemetry("sample.cos").addData(this.TP.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [Date.now()/1000], [[Math.cos(Date.now()/1000)*100]]);
                    this.TP.datastore.getOrCreateTelemetry("sample.text").addData(this.TP.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [Date.now()/1000], [[`Hello world`]]);
                    
                    // Create Dashboard
                    let initialized = this.TP.dashboards.hasDashboard("SampleDashboard");
                    let dashboard = this.TP.dashboards.getOrCreateDashboard("SampleDashboard");

                    if (!initialized) {
                        let divId = ""
                        let view = undefined;

                        divId = dashboard.name + "main-layout";
                        let mainLayout = new this.TP.view.ViewLayout(divId, dashboard.getGroupName());
                        mainLayout.layout.type = "column";
                        this.TP.view.addView(mainLayout);
                        dashboard.setView(mainLayout);

                        // Top Layout
                        {
                            let topLayout = new this.TP.view.ViewLayout("", dashboard.getGroupName());
                            topLayout.layout.type = "row";
                            this.TP.view.addView(topLayout);
                            mainLayout.addView(topLayout);

                            divId = dashboard.name + "sample-view-chart-sin-cos-2";
                            view = new this.TP.view.ViewChart(divId, ["sample.sin", "sample.cos"], dashboard.getGroupName());
                            view.setSize(2, 4);
                            this.TP.view.addView(view);
                            topLayout.addView(view);

                            // Value Layout
                            {
                                divId = dashboard.name + "value-layout";
                                let valueLayout = new this.TP.view.ViewLayout(divId, dashboard.getGroupName());
                                valueLayout.setSize(4, 2);
                                this.TP.view.addView(valueLayout);
                                topLayout.addView(valueLayout);
                                
                                divId = dashboard.name + "sample-view-value-sin";
                                view = new this.TP.view.ViewCurrentValue(divId, ["sample.sin"], dashboard.getGroupName());
                                this.TP.view.addView(view);
                                valueLayout.addView(view);
                                
                                divId = dashboard.name + "sample-view-value-sin-2";
                                view = new this.TP.view.ViewCurrentValue(divId, ["sample.sin"], dashboard.getGroupName());
                                this.TP.view.addView(view);
                                valueLayout.addView(view);

                                divId = dashboard.name + "sample-view-value-sin-3";
                                view = new this.TP.view.ViewCurrentValue(divId, ["sample.sin"], dashboard.getGroupName());
                                this.TP.view.addView(view);
                                valueLayout.addView(view);

                                divId = dashboard.name + "sample-view-value-text-cos";
                                view = new this.TP.view.ViewCurrentValue(divId, ["sample.text", "sample.cos"], dashboard.getGroupName());
                                view.setSize(1, 2);
                                this.TP.view.addView(view);
                                valueLayout.addView(view);
                            }

                            divId = dashboard.name + "sample-view-chart-sin-cos-3";
                            view = new this.TP.view.ViewChart(divId, ["sample.sin", "sample.cos"], dashboard.getGroupName());
                            view.setSize(2, 4);
                            this.TP.view.addView(view);
                            topLayout.addView(view);
                        }
                        divId = dashboard.name + "sample-view-chart-sin-cos";
                        view = new this.TP.view.ViewChart(divId, ["sample.sin", "sample.cos"], dashboard.getGroupName());
                        this.TP.view.addView(view);
                        mainLayout.addView(view);
                        this.ctx.activeDashboard = dashboard;
                    }


                }, 50);
            },
            stopSampleData() {
                if (this.sampleDataInterval) {
                    clearInterval(this.sampleDataInterval)
                }
                this.sampleDataInterval = false;
            }
        },
        template: vueHTML,
    });
}