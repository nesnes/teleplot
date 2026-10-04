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
            this.init();
            return isInitialized();
        }
        
        return true;
    }

    setOption(name, value) {
        this.options[name] = value;
    }

    getOption(name) {
        return this.options[name];
    }

    setSize(width, height) { // No units, relative to other views in a layout, used as flex-grow attributes
        this.layout.width = width;
        this.layout.height = height;
    }
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-view {
            
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