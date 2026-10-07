class Views{
    constructor(divId="", group="default"){
        if (this.constructor === Views)
        {
            throw new Error("Views is an abstract class, it should only be inherited but never instanciated !");
        }
        this.name = "view";
        this.id = "view-"+crypto.randomUUID();
        this.divId = divId.length ? divId : this.id;
        this.group = group;
        this.type = "";
        // Create group if needed
        if (TELEPLOT.view.groups[this.group] === undefined) {
            TELEPLOT.view.groups[this.group] = {
                cursorActive: false,
                cursorTimestamp: -1,
                timestampFrom: -1,
                timestampTo: -1
            }
        }

        this.layout = TELEPLOT.Vue.reactive({
            width: 4,
            height: 4
        });

        // View options
        this.options = TELEPLOT.Vue.reactive({
            _telemetry:{},                  // Telemetry-specific options
            displayNumberDecimals: 3,       // Number of decimal for values when displayed
        });
    }
    
    init(){
        let element = document.getElementById(this.divId);
        if (element == null)
        {
            throw new Error(`Element with id '${this.divId}' not found`);
            return;
        }
        element.setAttribute("v-pre", ""); // Prevent an eventual higher-level Vue-js from parsing this element
                                           // Also used for initialization check
        element.classList.add("teleplot-js-style");
        element.classList.add("teleplot-js-view");
        
        this.vue = TELEPLOT.Vue.createApp({
            data() {
                return {}
            }
        });
    }

    __before_update(){
        // Check init
        let element = document.getElementById(this.divId);
        let isInitialized = () => {return element && element.hasAttribute("v-pre")};
        
        if(element && !isInitialized()) {
            this.dispose(); // The view moved to a new element (parent changed, stack tab switched): drop what was mounted on the old one
            this.init();
            return isInitialized();
        }
        if(element) this.__sync(element);
        
        return true;
    }

    // Unmounts the view from the page. It mounts again by itself (next update) when an element with its divId shows up.
    dispose() {
        if(this.vue) {
            try { this.vue.unmount(); } catch(e) { console.error("Teleplot view unmount failed:", this.id, e); }
            this.vue = undefined;
        }
    }

    // Brings what the view shows on its element up to date (called by every update): the "title" option, and for views that show telemetries
    // their top color and empty state. The elements are added next to what the view's own Vue app renders.
    __sync(element) {
        let title = (!Array.isArray(this.views) && this.options.title) ? String(this.options.title) : "";
        let label = Array.from(element.children).find((c) => c.classList.contains("teleplot-js-view-title"));
        if(!title) { if(label) label.remove(); }
        else {
            if(!label) {
                label = document.createElement("div");
                label.className = "teleplot-js-view-title";
                element.appendChild(label);
            }
            if(label.textContent !== title) label.textContent = title;
        }
        element.classList.toggle("teleplot-js-has-title", title !== "");
    }

    // Copy of the view with the same content, layout and options (not displayed until it is added to a layout). Overridden by each kind of view.
    clone() {
        throw new Error(`${this.constructor.name} cannot be cloned`);
    }

    __copyStateTo(copy) {
        copy.name = this.name;
        Object.assign(copy.layout, JSON.parse(JSON.stringify(this.layout)));
        Object.assign(copy.options, JSON.parse(JSON.stringify(this.options)));
        return copy;
    }

    setOption(name, value) {
        this.options[name] = value;
    }

    getOption(name) {
        return this.options[name];
    }

    setSize(width, height) { // No units, relative to other views in a layout, used as flex-grow attributes
        if(width !== undefined) this.layout.width = width;   // undefined: keep the current value
        if(height !== undefined) this.layout.height = height;
    }
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-view {
                position: relative;
            }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = Views.vueCSS;
    document.head.appendChild(elem);
}


TELEPLOT.view = {
    views: [],
    groups: {}
};

TELEPLOT.view.addView = function(view){
    if(TELEPLOT.view.getView(view.id) !== undefined) { return; }
    TELEPLOT.view.views.push(view);
}

TELEPLOT.view.getView = function(viewId){
    return TELEPLOT.view.views.find((v)=> v.id === viewId);
}

TELEPLOT.view.updateViews = function(){
    for(let view of TELEPLOT.view.views) {
        try { view.update(); }
        catch(e) { console.error("Teleplot view update failed:", view.id, e); } // A failing view must not prevent the others from updating
    }
}

// Forget a view and everything it contains (it stops being updated and is unmounted). Detaching it from its parent layout is up to the caller.
TELEPLOT.view.removeView = function(view){
    TELEPLOT.view.disposeView(view, true);
    let unregister = (v) => {
        let idx = TELEPLOT.view.views.indexOf(v);
        if(idx >= 0) TELEPLOT.view.views.splice(idx, 1);
        if(Array.isArray(v.views)) v.views.forEach(unregister);
    };
    unregister(view);
}

// Unmount a view (and its children): used when it gets another place on the page
TELEPLOT.view.disposeView = function(view, recursive=true){
    view.dispose();
    if(recursive && Array.isArray(view.views)) view.views.forEach((child) => TELEPLOT.view.disposeView(child, true));
}
