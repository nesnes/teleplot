class ViewStack extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.type = "teleplot-stack";

        this.name = "stack";
        this.views = TELEPLOT.Vue.reactive([]);
        this.layout.type =    "stack";
        this.layout.selected = undefined;
        this.layout.height = 0; // Minimum height step (4 × height em), 0 = the content decides
        this.layout.appearance = "inherit"; // Look of the views inside, see ViewLayout
        this.layout.accent = "inherit";
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    views : self.views,
                    options : self.options,
                    layout : self.layout
                }
            },
            computed: {
                appearanceStyle() { return TELEPLOT.view.ViewLayout.appearanceStyle(this.layout); }
            },
            template: ViewStack.vueHTML,
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
        
        // Select a view to display
        let isSelected = this.layout.selected != undefined;
        let isAvailable = this.views.find((v) => v.id == this.layout.selected);
        if (!isSelected || !isAvailable) {
            this.layout.selected = undefined;
            if (this.views.length) {
                this.layout.selected = this.views.at(0).id; // select first item by default
            }
        }
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

    selectView(viewId) {
        let isAvailable = this.views.find((v) => v.id == viewId);
        if(isAvailable) this.layout.selected = viewId;
    }

    clone() {
        let copy = this.__copyStateTo(new this.constructor("", this.group));
        copy.layout.selected = undefined;
        for(let child of this.views) copy.addView(child.clone());
        return copy;
    }

    static vueHTML = `
        <div class="teleplot-js-view-stack-container"
            :style="[appearanceStyle, {
                'flex': '' + layout.width + ' ' + layout.width + ' 1em',
                'min-height': layout.height > 0 ? (layout.height * 4) + 'em' : undefined
            }]"
        >
            <div class="teleplot-js-view-stack-header">
                <template v-for="view of views" :key="view.id">
                    <div class="teleplot-js-view-stack-header-item"
                      :class="{'teleplot-js-view-stack-header-item-selected': view.id == layout.selected}"
                      @click="self.selectView(view.id)">
                        {{view.options && view.options.title ? view.options.title : view.name}}
                    </div>
                </template>
            </div>
            <template v-for="view of views" :key="view.id">
                <div v-if="view.id == layout.selected"  :id="view.divId"
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
            .teleplot-js-view-stack-container {
                display: flex;
                flex-direction: column;
                flex-wrap: wrap;
            }
            .teleplot-js-view-stack-header {
                display: flex;
                flex-direction: row;
            }
            .teleplot-js-view-stack-header { gap: 0.3em; padding-left: 0.5em; }
            .teleplot-js-view-stack-header-item {
                box-sizing: border-box;
                padding: 0.25em 0.8em;
                border: 1px solid var(--teleplot-line);
                border-bottom: 0;
                border-radius: 6px 6px 0 0;
                background: color-mix(in srgb, var(--teleplot-muted) 12%, transparent);
                color: var(--teleplot-muted);
                font-size: 0.9em;
                cursor: pointer;
            }
            .teleplot-js-view-stack-header-item:hover { color: var(--teleplot-text); }
            .teleplot-js-view-stack-header-item-selected {
                background: var(--teleplot-surface);
                color: var(--teleplot-text);
                font-weight: 600;
                box-shadow: inset 0 2px 0 0 var(--teleplot-primary);
            }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewStack.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewStack = ViewStack;
