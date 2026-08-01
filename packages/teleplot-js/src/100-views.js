class Views{
    constructor(divId="", group="default"){
        if (this.constructor === Views)
        {
            throw new Error("Views is an abstract class, it should only be inherited but never instanciated !");
        }
        this.id = "view-"+crypto.randomUUID();
        this.initialized = false;
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
        element.classList.add("teleplot-js-style");
        
        this.vue = TELEPLOT.Vue.createApp({
            data() {
                return {}
            }
        });
    }

    __before_update(){
        // Check init
        if (!this.initialized) {
            let element = document.getElementById(this.divId);
            if(element !== null) {
                this.init();
                this.initialized = true;
            }
            return false;
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
    
}

TELEPLOT.view = {
    views: [],
    groups: {}
};

TELEPLOT.view.addView = function(view){
    TELEPLOT.view.views.push(view);
}

TELEPLOT.view.updateViews = function(){
    for(let view of TELEPLOT.view.views) {
        view.update();
    }
}