var widgetCount = 0; // counts the number of DataWidgets instanciated, it is useful for its ids

/*
if the resize button of a certain widget is clicked 
then, widgetBeingResized will contain a reference to this particular widget
otherwise, it is equal to null
*/
var widgetBeingResized = null;

window.addEventListener('mouseup', widgetOnMouseUp, false);
window.addEventListener('mousemove', widgetOnMouseMove, false)

class DataWidget{
    constructor() {
        if (this.constructor === DataWidget)
        {
            throw new Error("DataWidget is an abstract class, it should only be inherited and never instanciated !");
        }
        
        // usefull to identify a chart ( we can send multiples shapes to be displayed in the same chart by precising their chart label )
        this.label = undefined;

        this.options = {
            width: undefined,
            height: undefined,
        }

        this.series = []; // DataSerie
        this.id = "widget-chart-" + widgetCount;
        widgetCount ++;
        this.gridPos = {h:6, w:6, x:0, y:0};
        // the X and y coordonates of the cursor when the user drags the resize button : 
        this.initialCursorXPos = undefined;
        this.initialCursorYPos = undefined;
        // the height and width of the dataWidget just before the user resizes it :
        this.initialHeight = undefined;
        this.initialWidth = undefined;
        this.isResized = false;
    }

    isUsingSource(name){
        for(let s of this.series)
            if(s.sourceNames.includes(name)) return true;
        return false;
    }

    _getSourceList(){
        let sourceList = {};
        for(let s of this.series)
            for(let n of s.sourceNames)
                sourceList[n] = app.telemetries[n];
        return sourceList;
    }

    updateStats(){
        for(let s of this.series)
            s.updateStats();
    }
}

function onMouseDownOnResizeButton_(event, widget)
{
    widget.initialCursorXPos = event.pageX;
    widget.initialCursorYPos = event.pageY;
    widget.initialHeight = widget.gridPos.h;
    widget.initialWidth = widget.gridPos.w;
    widgetBeingResized = widget;
    widget.isResized = true;
}

function widgetOnMouseUp()
{
    if(widgetBeingResized)
    {
        widgetBeingResized.isResized = false;
        updateWidgetSize_(widgetBeingResized);
        widgetBeingResized = null;
    }
}

function widgetOnMouseMove(event)
{
    if (widgetBeingResized)
    {
        // the div element containing our widgets
        var widgetContainerDiv = document.getElementById("widget-container-div");

        let minWidgetWidth = Math.round(widgetContainerDiv.clientWidth/12);
        let minWidgetHeight = 50;

        let heightExtension = (event.pageY - widgetBeingResized.initialCursorYPos);
        let widthExtension = (event.pageX - widgetBeingResized.initialCursorXPos);

        widgetBeingResized.gridPos.h = widgetBeingResized.initialHeight + Math.round(heightExtension/minWidgetHeight);
        widgetBeingResized.gridPos.w = widgetBeingResized.initialWidth + Math.round(widthExtension/minWidgetWidth);

    }
}

function updateWidgetSize_(widget){
    const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
    widget.gridPos.w = clamp(widget.gridPos.w, 2, 12);
    widget.gridPos.h = clamp(widget.gridPos.h, 2, 20);
    widget.options.height = (widget.gridPos.h-1)*50;
    widget.forceUpdate = true;
    triggerChartResize();
}

var chartResizeTimeout = null;
function triggerChartResize(){
    if(chartResizeTimeout) clearTimeout(chartResizeTimeout);
    chartResizeTimeout = setTimeout(()=>{
        window.dispatchEvent(new Event('resize'));
    }, 100);
}