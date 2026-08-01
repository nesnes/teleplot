class ViewLayout extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.type = "teleplot-layout";

        this.views = TELEPLOT.Vue.reactive({});
        this.layout.type =    "row";   // "row" or "column",
        this.layout.justify = "start"; // "start", "center", "end", "space-between", "space-around"
        this.layout.align =   "start"; // "start", "center", "end", "stretch"
        this.layout.gap = 1;
        
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    views : self.views,
                    options : self.options,
                    layout : self.layout
                }
            },
            template: ViewLayout.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);
    }

    update(){
        if (!super.__before_update()) return;
    }

    addView(view) {
        this.views[view.id] = view;
    }

    static vueHTML = `
        <div class="teleplot-js-view-layout-container"
            :style=" {
                'flex-direction': layout.type,
                'justify-content': layout.justify,
                'align-items': layout.align,
                'flex': '' + layout.width + ' ' + layout.width + ' 1em',
                'gap': layout.gap + 'em'
            }"
        >
            <template v-for="(view, viewId) in views" :key="viewId">
                <div :id="view.divId"
                :style="{ 
                    'container-type': 'inline-size',
                    'flex': '' + view.layout.width + ' ' + view.layout.width + ' 1em',
                    'width': '100%',
                    'min-width': '10em'
                }"
                ></div>
            </template>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-view-layout-container {
                display: flex;
                flex-wrap: wrap;
            }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewLayout.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewLayout = ViewLayout;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-telemetry-card {
                backdrop-filter: blur(10px);
                border-radius: 3px;
                box-shadow: 0px 0px 3px 0px #85858580;
                box-sizing: border-box;
                font-size: 1em;
                text-wrap-style: balance;
            }
        }
    `;
    document.head.appendChild(elem);
}