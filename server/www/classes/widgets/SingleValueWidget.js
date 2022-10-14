/* lot of text is commented out here, this is code that might be useful, if we support the average, min and max features for singleValueWidget*/

class SingleValueWidget extends DataWidget{
    constructor(containsTextFormat=false) {
        super();

        this.type = "single_value_number";
        this.singlevalue = [0]; // type : array of Number, the value of the widget ( so the average, the max or the min ... according to widgetMode )
        // should contain two numbers if represents a xy serie, one otherwise.
        this.precision_mode = 0; // either 0 (default), 1 (good) or 2 (very good)
        
        if (containsTextFormat)
            this.type = "single_value_text"
        
        //this.widgetMode = widgetMode_ ; // type : String, what our widget singlevalue is going to be ( either "average", "max", "min" or "last")
        
        //this.currentLastIndex = -1;// type : Number, the value of the last index at which singleValue was calculated
        //this.valueSum = 0;
        //this.forceUpdate = true;

        //updateWidgetSize_(this);
    }

    addSerie(serie)
    {
        serie.options.stroke = ColorPalette.getColor(0).toString(); // we take the first color of the ColorPalette, so 0
        serie.options.fill = ColorPalette.getColor(0, 0.1).toString();

        if (this.series.length != 0)
            throw new Error("SingleValueWidget should contain only one serie");
        this.series.push(serie);
    }

    destroy(){
        if (this.series.length == 1)
            this.series[0].destroy();
    }

    
    trimNumberAccordingToPrecision(nb)
    {
        
        let significant_digits = 21;
        switch (this.precision_mode)
        {
            case 0 : // default
                significant_digits = 3;
                break;
            case 1 : // good precision
                significant_digits = 7;
                break;
            case 2 : // maximal precision
                significant_digits = 21;
                break;
        }
        return nb.toPrecision(significant_digits);
    }

    // updates this.singleValue according to the last value of the serie,
    // and also write it in a string format ready to be displayed
    updateSingleValue(currentSerie)
    {
        // console.log(JSON.stringify(currentSerie));
        if (this.type == "single_value_text" || currentSerie == undefined || currentSerie.values[0] == undefined)
            return;

        
        if (currentSerie.type=="xy" && currentSerie.values[1] != undefined)
        {
            this.singlevalue = [];
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[0]))
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[1]))
        }
        else if (currentSerie.type=="number")
        {
            this.singlevalue = [];
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[0]))
        }
    }

    update(){  
        let currentSerie = this.series[0];
        currentSerie.update();

        this.updateSingleValue(currentSerie);
        
        //this.updateWidgetValue()
    } 


    changeValuePrecision()
    {
        this.precision_mode = (this.precision_mode + 1) % 3;
    }

    /*
    
    getSerieMaxIdxAccordingToCursor(serie)
    {
        // if (cursorXValueOnWidget != undefined)
        // {
        //     return getClosestSerieIdx(serie, cursorXValueOnWidget);
        // }
        
        return serie.data[0].length -1;
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
    }*/
}

/*
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
*/
