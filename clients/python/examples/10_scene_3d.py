# 10. A 3D scene: a body that turns, an arm placed in the frame of the body (it follows the body without being computed here), and
# a point in space with its trail. Frame of the scene: x forward, y to the left, z up. Positions in your own units.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
body = tp.telemetry("body")
body.shape(Teleplot.Cube).size(0.6, 0.4, 0.2).color("#3498db")
tp.telemetry("arm").shape(Teleplot.Cylinder).size(0.05, 0.05, 0.5).color("orange").frame("body")  # relative to the body
tp.telemetry("arm").position(0.2, 0, 0.35)

t = 0.0
while True:
    body.position(math.cos(t), math.sin(t), 0.1).quaternion(math.cos(t / 2), 0, 0, math.sin(t / 2))  # turning around z
    tp.update("drone", Teleplot.Number3D(1.5 * math.cos(t * 2), 1.5 * math.sin(t * 2), 1 + 0.3 * math.sin(t * 3)))
    t += 0.025
    time.sleep(0.05)
