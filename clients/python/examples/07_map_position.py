# 7. A position on a map: two numbers (x, y) make a point, drawn with its trail.
# GPS coordinates need more digits than a float32 holds: precise() sends them exactly (float64).
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("gps").precise()

t = 0.0
while True:
    tp.update("gps", Teleplot.Number2D(2.294481 + 0.0005 * math.cos(t), 48.858370 + 0.0003 * math.sin(t)))  # or a tuple (x, y)
    t += 0.02
    time.sleep(0.1)
