function drawAllWords()
{
    requestAnimationFrame(drawAllWords);

    for (let i = 0; i<worlds.length; i++)
    {
        worlds[i].render();
        //console.log("drawingWorld : "+i)
    }
}

var worlds = [];// todo Remove worlds when closed

Vue.component('comp-3d', {
    name: 'comp-3d',
    props: {
        series: {type: Array, required: true},
        widget: {type: Object, required: true},
    },
    data() {
        return { world : undefined};
    },
    // watch : {
    //     series: {
    //         handler(series0, series1){

    //             if (series0.length != series1.length)
    //                 this.reDrawShapes();
    //             else
    //             {
    //                 for (let i = 0 ; i<series0.length; i++)
    //                 {
    //                     if (!series0[i].values[0].isSame(series1[i].values[0]))
    //                     {
    //                         this.reDrawShapes();
    //                         break;
    //                     }
    //                     //console.log("same");
    //                 }
    //             }
    //         },
    //         deep: true
    //     }

    // },
    mounted() {
        setTimeout(()=>{
            this.initializeWorld();
        }, 200);

    },
    methods: {
        initializeWorld()
        {
            let containerDiv = this.$refs.div_3d_container;
            this.world = new World(containerDiv);
            worlds.push(this.world);
            this.widget.worldId = this.world.id;

            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                let myShape = ((new Shape3D).initializeFromShape3D(currSerie.values[0]));
                //todo: working here...
                //let myShape = currSerie.values[0];

                if (myShape != undefined)
                    this.world.setObject(myShape);
            }

            this.setUpSeriesObserver();

            //console.log("init : worlds : "+worlds);
            drawAllWords();
        },

        setUpSeriesObserver()
        {
            for (let i = 0; i< this.series.length; i++)
            {
               this.series[i].onSerieChanged = this.reDrawShapes;
            }
            
        },
        reDrawShapes()
        {
            // console.log("redraw");

            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                let myShape = currSerie.values[0];
    
                if (myShape != undefined)
                    this.world.setObject(myShape);
            }
    
        },
    },
    template:'\
            <div ref="div_3d_container" class ="comp-3d-container">\
            </div>',
});