class Color {
    constructor(r, g, b, a=1.0) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    
    toStrRGB() {
        return `rgba(${this.r},${this.g},${this.b},${this.a})`;
    }
}

TELEPLOT.colors = {};
TELEPLOT.colors.Color = Color;
TELEPLOT.colors.palette = [
    new Color(231,  76,  60, 1.0), //red
    new Color( 52, 152, 219, 1.0), //blue
    new Color( 46, 204, 113, 1.0), //green
    new Color(155,  89, 182, 1.0), //violet
    new Color(241, 196,  15, 1.0), //yellow
    new Color( 26, 188, 156, 1.0), //turquoise
    new Color(230, 126,  34, 1.0), //orange
    new Color( 52,  73,  94, 1.0), //blueish grey
    new Color(127, 140, 141, 1.0), //gray
    new Color(192,  57,  43, 1.0), //dark red
    new Color( 41, 128, 185, 1.0), //darkblue
    new Color( 39, 174,  96, 1.0), //darkgreen
    new Color(142,  68, 173, 1.0), // darkviolet
    new Color(211,  84,   0, 1.0), //darkorange
    new Color( 44,  62,  80, 1.0), //blueish darkgrey
    new Color(  0,   0,   0, 1.0), //black
];

TELEPLOT.colors.getColor = function(index) {
    if (index == undefined)
        return new Color(44, 62, 80, 1.0);
    else
        return TELEPLOT.colors.palette[index % TELEPLOT.colors.palette.length];
}