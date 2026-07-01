class Views{
    constructor(divId, group="default"){
        if (this.constructor === Views)
        {
            throw new Error("Vues is an abstract class, it should only be inherited and never instanciated !");
        }
        this.divId = divId;
        this.group = group;
        // Create group if needed
        if (TELEPLOT.view.groups[this.group] === undefined) {
            TELEPLOT.view.groups[this.group] = {
                cursorActive: false,
                cursorTimestamp: -1,
                timestampFrom: -1,
                timestampTo: -1
            }
        }

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

    update(){

    }

    setOption(name, value, telemetryNameOrId) {
        // View-wide option
        if (telemetryNameOrId === null || telemetryNameOrId === undefined || telemetryNameOrId == "") {
            this.options[name] = value;
            return;
        }
        // Telemetry-specific option
        let telem = TELEPLOT.datastore.getTelemetry(telemetryNameOrId);
        if(telem === undefined) return false;
        if(this.options._telemetry[telem.id] == undefined) { this.options._telemetry[telem.id] = {}; }
        this.options._telemetry[telem.id][name] = value;
    }

    getOption(name, telemetryNameOrId=undefined) {
        // Check for telemetry-specific option
        if (telemetryNameOrId !== null && telemetryNameOrId !== undefined) {
            let telem = TELEPLOT.datastore.getTelemetry(telemetryNameOrId);
            if( telem !== undefined 
             && this.options._telemetry[telem.id] !== undefined
             && this.options._telemetry[telem.id][name] !== undefined)
            { 
                return this.options._telemetry[telem.id][name];
            }
        }
        // Fallback to view-wide options
        return this.options[name];
    }
    
}

TELEPLOT.view = {
    views: [],
    groups: {}
};

TELEPLOT.view.addView = function(view){
    TELEPLOT.view.views.push(view);
    view.init();
}

TELEPLOT.view.updateViews = function(){
    for(let view of TELEPLOT.view.views) {
        view.update();
    }
}

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
                font-size: 16px;
                text-wrap-style: balance;
            }
        }
    `;
    document.head.appendChild(elem);
}