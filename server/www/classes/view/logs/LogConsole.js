var logConsoleInstance = null; 
var lastLogHoveredTimestamp = 0; // the most recent timestamp at wich a log was hovered
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

    static reboot()
    {
        LogConsole.getInstance().logsUpdated(0,0);
    }   
    
    getHyperListConfig()
    {
        let mstartIdx = this.startIdx;

        function onMouseLeaveLog(el) 
        {
            if (el != null && el != undefined)
                el.classList.remove('log-vue-selected');

            logCursor.remove();
        };

        return {
            height : this.containerHeight,
            itemHeight: this.itemHeight,
            total: (this.endIdx - this.startIdx),
            
            generate(rowIdx) {
                let el = document.createElement('div')
                let currIdx = rowIdx + mstartIdx;
                let currLog = app.logs[currIdx];

                if (currLog == undefined) return;

                el.innerHTML = currLog.text;


                el.addEventListener("mouseover", function () {
                    
                    lastLogHoveredTimestamp = new Date().getTime();

                    el.classList.add('log-vue-selected');
                    logCursor.pub(currLog);


                    // normaly, we should not have to do that ( with setTimeout... ) and the call to mouseLeaveLog() from mouseleave event listener should be enough
                    // however, in some cases, mousleave event is not triggered, so we are also doing that to make sure onMouseleaveLog() is called everytime

                    let maxDuration = 150; // this is the maximal duration possible between 2 mouseover events
                    let maxTimeoutImprecision = 100; // we consider that this is the maximum imprecision the setTimeout function should have 

                    setTimeout(()=>{
                        let currentTime = new Date().getTime();
                      
                        
                        // if the last log hovered timestamp exeeds the max duration betwee, 2 mouseover events,
                        // it means that the cursor has left the log
                        if ((currentTime - lastLogHoveredTimestamp) >= maxDuration) 
                        {
                            onMouseLeaveLog(el);
                        }
                    }, maxTimeoutImprecision + maxDuration)
                    
                });

                el.addEventListener("mouseleave", function () {
                    onMouseLeaveLog(el);
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