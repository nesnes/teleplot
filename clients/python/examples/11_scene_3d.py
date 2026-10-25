# 11. A 3D scene: a body that turns, and an arm placed in the frame of the body: it follows the body without being computed here.
# Frame of the scene: x forward, y to the left, z up. Positions in your own units.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("body").shape(Teleplot.Cube).size(0.6, 0.4, 0.2).color("#3498db")
tp.telemetry("arm").shape(Teleplot.Cylinder).size(0.05, 0.05, 0.5).color("orange").frame("body")  # relative to the body
tp.telemetry("arm").position(0.2, 0, 0.35)

while True:
    t = time.time() * 0.5
    tp.telemetry("body").position(math.cos(t), math.sin(t), 0.1).yaw(t)
    time.sleep(0.05)
