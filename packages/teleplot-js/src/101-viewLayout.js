class ViewLayout extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.type = "teleplot-layout";

        this.name = "layout";
        this.views = TELEPLOT.Vue.reactive([]);
        this.layout.type =    "row";   // "row" or "column",
        this.layout.justify = "start"; // "start", "center", "end", "space-between", "space-around"
        this.layout.align =   "start"; // "start", "center", "end", "stretch"
        this.layout.gap = 1;
        this.layout.height = 0;        // Minimum height step (4 × height em), 0 = the content decides
        this.layout.appearance = "inherit"; // How the views inside look: "card" (default at the top), "flat" (no card, hairlines, no gap) or "inherit". Applies to everything inside.
        this.layout.accent = "inherit";     // Top color of the views inside: "on", "off" or "inherit" (on at the top)

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
            computed: {
                appearanceStyle() { return ViewLayout.appearanceStyle(this.layout); }
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

    addView(view, index=-1) {
        if (index==-1) index = this.views.length;
        TELEPLOT.view.addView(view);
        this.views.splice(index, 0, view);
    }

    getViewFromId(viewId) {
        return this.views.find((v)=> v.id === viewId);
    }

    removeView(viewId) {
        let viewIdx = this.views.findIndex((v)=> v.id === viewId);
        if(viewIdx < 0) return;
        this.views.splice(viewIdx , 1);
    }

    // CSS variables that give the views inside a layout their look (they inherit down the page: a layout inside another one can choose its own).
    // Shared with ViewStack. See 104-theme.js for what they do.
    static appearanceStyle(layout) {
        let style = {};
        if(layout.appearance === "flat") {
            Object.assign(style, { "--teleplot-card-bg": "var(--teleplot-surface)", "--teleplot-card-radius": "0", "--teleplot-card-bw": "0px",
                "--teleplot-card-shadow": "0 0 0 0.5px var(--teleplot-line)", "--teleplot-flat-gap": "0" });
        }
        else if(layout.appearance === "card") {
            Object.assign(style, { "--teleplot-card-bg": "var(--teleplot-surface)", "--teleplot-card-radius": "8px", "--teleplot-card-bw": "1px",
                "--teleplot-card-shadow": "0 0 0 0 transparent", "--teleplot-flat-gap": "initial" });
        }
        if(layout.accent === "on") style["--teleplot-accent-w"] = "2px";
        else if(layout.accent === "off") style["--teleplot-accent-w"] = "0px";
        return style;
    }

    clone() {
        let copy = this.__copyStateTo(new this.constructor("", this.group));
        for(let child of this.views) copy.addView(child.clone());
        return copy;
    }

    static vueHTML = `
        <div class="teleplot-js-view-layout-container"
            :style="[appearanceStyle, {
                'flex-direction': layout.type,
                'justify-content': layout.justify,
                'align-items': layout.align,
                'flex': '' + layout.width + ' ' + layout.width + ' 1em',
                'gap': 'var(--teleplot-flat-gap, ' + layout.gap + 'em)',
                'min-height': layout.height > 0 ? (layout.height * 4) + 'em' : undefined
            }]"
        >
            <template v-for="view of views" :key="view.id">
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
