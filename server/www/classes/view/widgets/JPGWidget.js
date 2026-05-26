class JPGWidget extends DataWidget{
    constructor(containsTextFormat=false) {
        super();
        this.type = "JPG";
        this.image = null;        
    }

    addSerie(serie)
    {
        serie.options.stroke = ColorPalette.getColor(0).toString(); // we take the first color of the ColorPalette, so 0
        serie.options.fill = ColorPalette.getColor(0, 0.1).toString();

        if (this.series.length != 0)
            throw new Error("JPGWidget should contain only one serie");
        this.series.push(serie);
    }

    destroy(){
        if (this.series.length == 1)
            this.series[0].destroy();
    }

    update(){  
        let currentSerie = this.series[0];
        if (currentSerie == undefined) return;
        if (currentSerie.values == undefined) return;
        currentSerie.update();
        this.image = currentSerie.values[1];
    } 

}
