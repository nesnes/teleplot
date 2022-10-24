var logConsoleInstance = null; 

var logIndexToHighlight = -1; // the index of the log to be highlited
// Log Console is of type singleton, it should never be instanciated with its own constructor but with getInstance()
class LogConsole
{
    constructor()
    {
        this.startIdx = 0; // where to start in app.logs
        this.endIdx = app.logs.length;

        this.container = document.getElementById("log-container-div");
        this.scroller = undefined;
        this.config = undefined;

        this.hyperlist = undefined;
        this.autoScrollToEnd = true;
        this.containerHeight = 500;// the height of the console log
        this.itemHeight = 20;
    }

    static getInstance()
    {
        if (logConsoleInstance == null)
            logConsoleInstance = new LogConsole();

        return logConsoleInstance
    }

    getHyperListConfig()
    {
        let mstartIdx = this.startIdx;

        return {
            height : this.containerHeight,
            itemHeight: this.itemHeight,
            total: (this.endIdx - this.startIdx),
          
            //   afterRender() {
            //     var height = parseFloat(scroller.style.height);
            //     range.value = (container.scrollTop / height) * 100
            //   },
          
            
            generate(rowIdx) {
                let el = document.createElement('div')
                let currIdx = rowIdx + mstartIdx;
                let currLog = app.logs[currIdx];

                el.innerHTML = "<span>" + currLog.text +"</span>";

                el.addEventListener("mouseenter", function () {
                    console.log("enter");
                    logCursor.pub(currLog);
                });
                el.addEventListener("mouseleave", function () {
                    console.log("leave");
                    // onLogClick(rowIdx);
                });

                if (logIndexToHighlight == currIdx)
                {
                    el.classList.add('log-vue-selected');
                }
                return el;
            }
            };
    }

    goToLog(logIdx)
    {
        this.autoScrollToEnd = false;

        logIdx = Math.max(logIdx, this.startIdx);
        logIdx = Math.min(logIdx, this.endIdx);

        logIndexToHighlight = logIdx;

        // we do -(containerHeight/2) as we want to let some space before the current log
        this.container.scrollTop = this.itemHeight * (logIdx) - (this.containerHeight/2);
    }

    untrackLog()
    {
        logIndexToHighlight = -1;
        this.autoScrollToEnd = true;
    }

    logsUpdated(startIdx, endIdx) {

        this.startIdx = startIdx;
        this.endIdx = endIdx
        // console.log("logs : "+ app.logs.length)

        if (this.hyperlist == undefined)
        {
            // let mscroller = document.createElement('div');
        
            this.hyperlist = HyperList.create(this.container, this.getHyperListConfig());

            // this.scroller = mscroller;

        }
        else
        {
            this.hyperlist.refresh(this.container, this.getHyperListConfig());
            
            if (this.autoScrollToEnd && !app.isViewPaused)
            {
                // this.logIndexToHighlighting = -1;
                this.container.scrollTop = app.logs.length * this.itemHeight;// this is always to be greater than the div height, so it will scroll to the end
            }
        }
    }

}