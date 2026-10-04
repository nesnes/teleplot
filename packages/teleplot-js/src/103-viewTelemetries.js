class ViewTelemetries extends Views {
    constructor(divId="", group="default"){
        super(divId, group);
        this.name = "telemetry";
        if (this.constructor === ViewTelemetries)
        {
            throw new Error("ViewTelemetries is an abstract class, it should only be inherited but never instanciated !");
        }

        // View options
        this.options._telemetry = {};
        this.setOption("displayNumberDecimals", 3);

        this.telemetryIdOrNameList = [];
        this.dragContext =  TELEPLOT.Vue.reactive({
            isActive: false,
            counter: 0
        });
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

    onDragEnter(event, view) {
        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        if(!isTelemetry) return;
        view.dragContext.counter++;
        view.dragContext.isActive = true;
    }
    onDragLeave(event, view) {
        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        if(!isTelemetry) return;
        view.dragContext.counter--;
        view.dragContext.isActive = view.dragContext.counter > 0;
    }
    onDragDrop(event, view) {
        view.dragContext.isActive = false;
        view.dragContext.counter = 0;

        let isTelemetry = event.dataTransfer.types.includes("text/x-teleplot-drag-type-telemetry")
        let hasId = event.dataTransfer.types.includes("text/x-teleplot-drag-id")
        if(!(isTelemetry && hasId)) return;

        // One telemetry ("drag-id"), or several (a group: "drag-ids", comma separated ids)
        let ids = [Number(event.dataTransfer.getData("text/x-teleplot-drag-id"))];
        if(event.dataTransfer.types.includes("text/x-teleplot-drag-ids")) {
            ids = event.dataTransfer.getData("text/x-teleplot-drag-ids").split(",").map(Number);
        }
        for(let id of ids) {
            let telemToDrop = TELEPLOT.datastore.getTelemetry(id);
            if(telemToDrop === undefined) continue;
            let alreadyThere = view.telemetryIdOrNameList.some((telemIdOrName) => {
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                return telem !== undefined && telem.id == telemToDrop.id;
            });
            if(!alreadyThere) view.telemetryIdOrNameList.push(telemToDrop.id);
        }
    }

    static dragDropHtml = `
        @dragover.prevent
        @dragenter.stop.prevent="onDragEnter($event, self)"
        @dragleave="onDragLeave($event, self)"
        @drop.prevent="onDragDrop($event, self)"
        :class="{'teleplot-js-telemetry-card-drag-over': dragContext.isActive}"
    `;
    
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

            .teleplot-js-telemetry-card-drag-over {
                box-shadow: 0px 0px 10px 0px #007eff94;
            }
        }
    `;
    document.head.appendChild(elem);
}