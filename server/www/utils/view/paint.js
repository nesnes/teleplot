function rgba(r,g,b,a){
    return {r,g,b,a, toString: function(){ return `rgba(${this.r},${this.g},${this.b},${this.a})`}};
}

var ColorPalette = {
    colors: [
        rgba(231, 76, 60,1.0), //red
        rgba(52, 152, 219,1.0), //blue
        rgba(46, 204, 113,1.0), //green
        rgba(155, 89, 182,1.0), //violet
        rgba(241, 196, 15,1.0), //yellow
        rgba(26, 188, 156,1.0), //turquoise
        rgba(230, 126, 34,1.0), //orange
        rgba(52, 73, 94,1.0), //blueish grey
        rgba(127, 140, 141,1.0), //gray
        rgba(192, 57, 43,1.0), //dark red
        rgba(41, 128, 185,1.0), //darkblue
        rgba(39, 174, 96,1.0), //darkgreen
        rgba(142, 68, 173,1.0), // darkviolet
        rgba(211, 84, 0,1.0), //darkorange
        rgba(44, 62, 80,1.0), //blueish darkgrey
        rgba(0, 0, 0,1.0), //black
    ],
    getColor: function(index, alpha=1.0, strColor = undefined) {
        let color = undefined;
        
        if (index == undefined)
            color = Object.assign({},  rgba(44, 62, 80,1.0));
        else
            color = Object.assign({}, this.colors[index % this.colors.length]);

        color.a = alpha;
        return color;
    }
}


const drawXYPoints = (u, seriesIdx, idx0, idx1) => {
    
    const size = 5 * devicePixelRatio;
    uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
        let d = u.data[seriesIdx];
        u.ctx.fillStyle = series.stroke();
        let deg360 = 2 * Math.PI;
        
        let p = new Path2D();
        for (let i = Math.max(d[0].length - 2000, 0); i < d[0].length; i++) {
            let xVal = d[0][i];
            let yVal = d[1][i];
            if (xVal >= scaleX.min && xVal <= scaleX.max && yVal >= scaleY.min && yVal <= scaleY.max) {

                let cx = valToPosX(xVal, scaleX, xDim, xOff);
				let cy = valToPosY(yVal, scaleY, yDim, yOff);

				p.moveTo(cx + size/2, cy);
                arc(p, cx, cy, size/2, 0, deg360);

            }
        }
        u.ctx.fill(p);
    });
    return null;
};