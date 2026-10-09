class ViewLayout extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.type = "teleplot-layout";

        this.name = "layout";
        this.views = TELEPLOT.Vue.reactive([]);
        this.layout.type =    "row";   // "row", "column" or "grid" (see below)
        this.layout.justify = "start"; // "start", "center", "end", "space-between", "space-around"
        this.layout.align =   "start"; // "start", "center", "end", "stretch"
        this.layout.gap = 1;
        this.layout.height = 0;        // Minimum height step (4 × height em), 0 = the content decides
        this.layout.appearance = "inherit"; // How the views inside look: "card" (default at the top), "flat" (no card, hairlines, no gap) or "inherit". Applies to everything inside.
        this.layout.accent = "inherit";     // Top color of the views inside: "on", "off" or "inherit" (on at the top)

        // "grid": the views flow line after line on columns of equal width, as many as fit in the width of the layout (they follow its size).
        // The width of a view is then the number of columns it takes (never more than there are); heights stay minimum heights, a line is as tall
        // as its tallest view.
        this.layout.columnWidth = 16;  // Grid: minimum width of a column, in em
        this.grid = TELEPLOT.Vue.reactive({ columns: 4 }); // Grid: columns that fit right now (measured on the page, not a setting)
    }

    // Number of grid columns for a width: as many columns of columnWidth as fit, by pairs (1, 2, 4, 6...) so that views two columns wide,
    // the usual size of a chart, always fill the lines.
    static gridColumns(width, columnWidth, gap = 0) {
        if (!(columnWidth > 0) || !(width > 0)) return 1;
        let count = Math.floor((width + gap) / (columnWidth + gap));
        return count < 2 ? 1 : count - count % 2;
    }

    // Style of the container and of the wrapper of each child, for a layout (its "layout" object) showing "columns" grid columns
    static containerStyle(layout, columns = 1) {
        let style = {
            'align-items': layout.align,
            'flex': '' + layout.width + ' ' + layout.width + ' 1em',
            'gap': 'var(--teleplot-flat-gap, ' + layout.gap + 'em)',
            'min-height': layout.height > 0 ? (layout.height * 4) + 'em' : undefined
        };
        if (layout.type === "grid") Object.assign(style, { 'display': 'grid', 'grid-template-columns': 'repeat(' + columns + ', minmax(0, 1fr))' });
        else Object.assign(style, { 'flex-direction': layout.type, 'justify-content': layout.justify });
        return style;
    }

    static childStyle(layout, childLayout, columns = 1) {
        if (layout.type === "grid") {
            let span = Math.max(1, Math.min(columns, Math.round(childLayout.width) || 1));
            return { 'container-type': 'inline-size', 'grid-column': 'span ' + span, 'min-width': '0' };
        }
        return { 'container-type': 'inline-size', 'flex': '' + childLayout.width + ' ' + childLayout.width + ' 1em', 'width': '100%', 'min-width': '10em' };
    }

    // Grid: count the columns again from the size of the element
    __measureGrid(element) {
        if (typeof getComputedStyle !== "function" || !element.clientWidth) return; // Not displayed (hidden tab of a stack...): keep the last count
        let em = parseFloat(getComputedStyle(element).fontSize) || 16;
        let columns = ViewLayout.gridColumns(element.clientWidth / em, this.layout.columnWidth, this.layout.gap);
        if (columns !== this.grid.columns) this.grid.columns = columns;
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
                    layout : self.layout,
                    grid : self.grid
                }
            },
            computed: {
                appearanceStyle() { return ViewLayout.appearanceStyle(this.layout); },
                containerStyle() { return ViewLayout.containerStyle(this.layout, this.grid.columns); }
            },
            methods: {
                childStyle(view) { return ViewLayout.childStyle(this.layout, view.layout, this.grid.columns); }
            },
            template: ViewLayout.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);

        // The grid follows the width of the element (window resized, panel opened...) and its own settings
        this.__measureGrid(element);
        if (typeof ResizeObserver === "function") {
            this.__resizeObserver = new ResizeObserver(() => this.__measureGrid(element));
            this.__resizeObserver.observe(element);
        }
        this.__stopGridWatch = TELEPLOT.Vue.watch(() => [this.layout.columnWidth, this.layout.gap], () => this.__measureGrid(element));
    }

    dispose() {
        if (this.__resizeObserver) { this.__resizeObserver.disconnect(); this.__resizeObserver = undefined; }
        if (this.__stopGridWatch) { this.__stopGridWatch(); this.__stopGridWatch = undefined; }
        super.dispose();
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
        <div class="teleplot-js-view-layout-container" :style="[appearanceStyle, containerStyle]">
            <template v-for="view of views" :key="view.id">
                <div :id="view.divId" :style="childStyle(view)"></div>
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
