# 12. Drawings on a map: a path (a line through points), an arrow and a text. They are flat shapes: the page shows them in 2D.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("path").shape(Teleplot.Line).lineWidth(0.03).color("gray")
tp.telemetry("path").points([(0, 0), (1, 0.5), (2, 0.25), (3, 1)])
tp.telemetry("goal").shape(Teleplot.Text).position(3, 1.2).text("goal").textSize(0.2)
tp.telemetry("wind").shape(Teleplot.Arrow).color("teal")

while True:
    t = time.time()
    tp.telemetry("wind").position(0, 1.5).vector(0.6 * math.cos(t), 0.6 * math.sin(t))  # an arrow that turns
    time.sleep(0.1)
