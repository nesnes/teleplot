let robotSample = null; // Created on first use (kept out of Vue data: no reactivity needed)

function initComponent_panel_help(vue) {
    let name = "panel-help";

    const vueHTML = `
        <div class="help-layout">
            <span style="color:var(--color-text-muted);">Ridiculously-simple telemetry viewer.</span>
            <span>Send data to UDP port 47269: it shows up here automatically.</span>
            
            <button v-if="!sampleRunning" @click="startSampleData()">Preview sample data</button>
            <button v-else @click="stopSampleData()">Stop sample data</button>
        </div>
    `;

    const vueCSS = `
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
                sampleRunning: !!(robotSample && robotSample.running)
            }
        },
        methods: {
            startSampleData() { // See sample-robot.js
                if (!robotSample) robotSample = createRobotSample(this.TP);
                robotSample.start();
                this.sampleRunning = true;
                this.ctx.activeDashboard = robotSample.dashboard;
            },
            stopSampleData() {
                robotSample.stop();
                this.sampleRunning = false;
            }
        },
        template: vueHTML,
    });
}