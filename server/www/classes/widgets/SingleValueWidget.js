class SingleValueWidget extends DataWidget{
    constructor(widgetMode_) {
        super();
        this.type = "singleValue";
        this.options = {
            serie_name : "untitled", // type : String, the name of the serie (useful to display the serie name in the component)
            singlevalue : 0,// type : Number, the value of the widget ( so the average, the max or the min ... according to widgetMode )
            number_precision : 5,
            widgetMode : widgetMode_// type : String, what our widget singlevalue is going to be ( either "average", "max", "min" or "last")
        }
        this.currentLastIndex = -1;// type : Number, the value of the last index at which singleValue was calculated
        this.valueSum = 0;
        this.forceUpdate = true;

        updateWidgetSize_(this);
    }

    setSerie(serie)
    {
        serie.options.stroke = ColorPalette.getColor(0).toString(); // we take the first color of the ColorPalette, so 0
        serie.options.fill = ColorPalette.getColor(0, 0.1).toString();

        if (this.series.length != 0)
            throw new Error("SingleValueWidget should contain only one serie");
        this.series.push(serie);
        this.options.serie_name = serie.name;
    }

    destroy(){
        if (this.series.length == 1)
            this.series[0].destroy();
    }

    getSerieMaxIdxAccordingToCursor(serie)
    {
        /*if (cursorXValueOnWidget != undefined)
        {
            return getClosestSerieIdx(serie, cursorXValueOnWidget);
        }*/
        
        return serie.data[0].length -1;
    }

    update(){  
        this.series[0].update();
        this.updateWidgetValue()
    } 

    toogleValuePrecision()
    {
        if (this.options.number_precision != 5) this.options.number_precision = 5;
        else this.options.number_precision = 12;
    }

    updateWidgetValue()
    {
        let valuesMaxIdx = this.getSerieMaxIdxAccordingToCursor(this.series[0]);

        switch (this.options.widgetMode)
        {
            case 'average' :
                
                this.valueSum += getArraySum(this.series[0].data[1], this.currentLastIndex+1, valuesMaxIdx);

                this.options.singlevalue = this.valueSum / (valuesMaxIdx+1);
                this.currentLastIndex = valuesMaxIdx;
                break;
                
            case 'max':
                let maxOnNewElements = getMaxOnArray(this.series[0].data[1],this.currentLastIndex+1, valuesMaxIdx, false);
                
                if (this.options.singlevalue == undefined || maxOnNewElements>this.options.singlevalue)
                    this.options.singlevalue = maxOnNewElements;

                this.currentLastIndex = valuesMaxIdx;
                break;
            case 'min' :
        
                let minOnNewElements = getMinOnArray(this.series[0].data[1],this.currentLastIndex+1, valuesMaxIdx, false);
                
                if (this.options.singlevalue == undefined || minOnNewElements<this.options.singlevalue)
                    this.options.singlevalue = minOnNewElements;

                this.currentLastIndex = valuesMaxIdx;
                break;
                
            case 'last' :
                
                this.options.singlevalue = this.series[0].data[1][valuesMaxIdx];
                break;
                
        }
    }

}

function updateWidgetContentSize()
{
    let child = document.getElementById("single_value_el_id");
    let parent = document.getElementById("cointaider_single_val_el");
    
    let new_fontSize = 36;

    let maxHeight = parent.offsetHeight;
    let maxWidth = parent.offsetWidth;
    let textHeight;
    let textWidth;
    do {
        child.style.fontSize = new_fontSize + "px";
        textHeight = child.offsetHeight;
        textWidth = child.offsetWidth;
        new_fontSize -= 1;
    } while ((textHeight > maxHeight || textWidth > maxWidth) && new_fontSize > 3);

}
