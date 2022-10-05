class Widget3D extends DataWidget{
    constructor() {
        super();
        this.type = "widget3D";
    }

    addSerie(serie)
    {
        this.series.push(serie);
    }

    destroy(){
        for(let s of this.series) s.destroy();
    }    

    update(){  
        for(let s of this.series) s.update();
    } 

}
