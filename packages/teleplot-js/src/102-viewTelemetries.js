class ViewTelemetries extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        if (this.constructor === ViewTelemetries)
        {
            throw new Error("ViewTelemetries is an abstract class, it should only be inherited but never instanciated !");
        }

        // View options
        this.options._telemetry = {};
        this.setOption("displayNumberDecimals", 3);
    }

    setOption(name, value, telemetryNameOrId) {
        // View-wide option
        if (telemetryNameOrId === null || telemetryNameOrId === undefined || telemetryNameOrId == "") {
            super.setOption(name, value);
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
        return super.getOption(name);
    }
    
}

TELEPLOT.view.ViewTelemetries = ViewTelemetries;

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
                min-height: calc( 1em * pow(2, var(--layout-height, 1)));
            }
        }
    `;
    document.head.appendChild(elem);
}