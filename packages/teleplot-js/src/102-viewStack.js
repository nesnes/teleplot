class ViewStack extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.type = "teleplot-stack";

        this.name = "stack";
        this.views = TELEPLOT.Vue.reactive([]);
        this.layout.type =    "stack";
        this.layout.selected = undefined;
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

    static vueHTML = `
        <div class="teleplot-js-view-stack-container"
            :style=" {
                'flex': '' + layout.width + ' ' + layout.width + ' 1em'
            }"
        >
            <div class="teleplot-js-view-stack-header">
                <template v-for="view of views" :key="view.id">
                    <div class="teleplot-js-view-stack-header-item"
                      :class="{'teleplot-js-view-stack-header-item-selected': view.id == layout.selected}"
                      @click="self.selectView(view.id)">
                        {{view.name}}
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
            .teleplot-js-view-stack-header-item {
                backdrop-filter: blur(10px);
                border-radius: 4px 4px 0px 0px;
                box-shadow: 0px 0px 3px 0px #85858580;
                box-sizing: border-box;
                margin-left: 0.5em;
                padding: 0.2em 0.5em;
                background: #7f7f7f7f;
                cursor: pointer;
            }
            .teleplot-js-view-stack-header-item-selected {
                background: unset;
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
