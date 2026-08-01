function initComponent_panel_sources(vue) {
    let name = "panel-sources";

    vueHTML = `
        <div class="sources-layout">
          <div v-for="conn in TP.connection.connections" :key="conn.id" class="source-item glass-material">
            <h3>{{conn.type}}</h3>
            <span>{{conn.name}}</span>
            <i v-if="!conn.connected" class="status-icon icofont-close" style="color:var(--color-danger);"></i>
          </div>
        </div>
    `;

    vueCSS = `
        .sources-layout {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            padding-left: 4.5rem;

            --line-width: 0.5rem;

            .source-item {
                position: relative;
                margin-top: 1rem;
                padding: 1rem;
                border-radius: 0.5rem;
                background: linear-gradient(45deg, 
                    rgba(var(--color-primary-rgb), 0.15),
                    rgba(var(--color-secondary-rgb), 0.15));
                &::before {
                    content: '';
                    position: absolute;
                    height: var(--line-width);
                    width: 3rem;
                    background-color: var(--color-primary);
                    top: calc(50% - var(--line-width) / 2);
                    left: -4rem;
                    border-radius: var(--line-width);
                }

                .status-icon {
                    position: absolute;
                    height: var(--line-width);
                    top: calc(50% - var(--line-width) * 4 / 2);
                    left: -3.5rem;
                    font-size: calc(var(--line-width) * 4);
                    text-shadow: 0px 0px 5px var(--color-bg-light);
                }

                h3 {
                    margin: 0rem;
                    font-weight: 500;
                    font-size: 1.3rem;
                }
                span {
                    color: var(--color-text-muted);
                    font-size: 1rem;
                }
            }
            
            &::after {
                content: '';
                position: absolute;
                width: var(--line-width);
                background-color: var(--color-primary);
                top: 0;
                bottom: 0;
                left: calc(0.5rem - var(--line-width) / 2);
                border-radius: var(--line-width);
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