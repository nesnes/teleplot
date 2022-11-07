class SingleValueWidget extends DataWidget{
    constructor(containsTextFormat=false) {
        super();

        this.type = "single_value_number";
        this.singlevalue = [0]; // type : array of Number, the value of the widget ( so the average, the max or the min ... according to widgetMode )
        // should contain two numbers if represents a xy serie, one otherwise.
        this.precision_mode = 0; // either 0 (default), 1 (good) or 2 (very good)
        
        if (containsTextFormat)
            this.type = "single_value_text"
        
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
        if (currentSerie == undefined || currentSerie.values[0] == undefined)
            return;

        this.singlevalue.length = 0;


        if (this.type == "single_value_text")
        {
            this.singlevalue.push(currentSerie.values[0])
        }
        else if (currentSerie.type=="xy" && currentSerie.values[1] != undefined)
        {
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[0]))
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[1]))
        }
        else if (currentSerie.type=="number")
        {
            this.singlevalue.push(this.trimNumberAccordingToPrecision(currentSerie.values[0]))
        }
    }

    update(){  
        let currentSerie = this.series[0];
        currentSerie.update();

        this.updateSingleValue(currentSerie);
        
    } 


    changeValuePrecision()
    {
        this.precision_mode = (this.precision_mode + 1) % 3;
    }

}
