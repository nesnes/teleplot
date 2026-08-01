function initComponent_panel_telemetries(vue) {
    let name = "panel-telemetries";

    vueHTML = `
        <div class="telemetries-layout">

            <div v-for="client in {...TP.clients.clients, 'default':{'name':'', 'id':-1}}" :key="client.id">
                <span>{{client.name}}</span>
                <template v-for="telem in TP.datastore.telemetries" :key="telem.id" >
                    <div v-if="telem.clientId == client.id" class="telemetry-item glass-material">
                        <h3 v-if="telem.attributes[TP.protocol.TELEM_ATTR_NAME]">{{telem.attributes[TP.protocol.TELEM_ATTR_NAME]}}</h3>
                    </div>
                </template>
            </div>
        </div>
    `;

    vueCSS = `
        .telemetries-layout {
            display: flex;
            flex-direction: row;
            gap: 0.25rem;

            .telemetry-item {
                padding: unset;
                border-radius: 0.5rem;
                background: linear-gradient(45deg, 
                    rgba(var(--color-primary-rgb), 0.15),
                    rgba(var(--color-secondary-rgb), 0.15));

                h3 {
                    font-size: 1rem;
                    font-weight: normal;
                    margin: 0rem 0.5rem 0rem 0.5rem;
                }
            }

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
            }
        },
        template: vueHTML,
    });
}