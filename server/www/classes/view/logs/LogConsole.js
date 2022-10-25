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
        this.itemHeight = 20; // has to be the same size as .vrow height in style.css
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

                el.innerHTML = currLog.text;

                // el.addEventListener('click', event => {
                //     // button.innerHTML = `Nombre de clics : ${event.detail}`;
                //     console.log("here")
                //   });
                // el.addEventListener("click", function () {
                //     el.classList.add('log-vue-selected');
                //     logCursor.pub(currLog);
                //     console.log(here);
                // });

                el.addEventListener("mouseenter", function () {
                    
                    el.classList.add('log-vue-selected');
                    // logCursor.pub(currLog); this doesnt work yet as we are not using uPlot.iife_v1.min.js ... 
                });

                el.addEventListener("mouseleave", function () {
                    
                    el.classList.remove('log-vue-selected');
                    // logCursor.remove(); this doesnt work yet as we are not using uPlot.iife_v1.min.js ... 
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
                this.container.scrollTop = app.logs.length * this.itemHeight;// this is always greater than the div height, so it will scroll to the end
            }
        }
    }

}