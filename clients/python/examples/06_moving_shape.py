# 6. A shape that moves: described once (its kind, size and color), then only its position and heading are sent.
# The page shows it on a map (2D view). Angles are in radians: Teleplot.deg() converts degrees.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
robot = tp.telemetry("robot")
robot.shape(Teleplot.Rect).size(0.4, 0.3).color("#2ecc71")

while True:
    t = time.time() * 0.3
    robot.position(2 * math.cos(t), 2 * math.sin(t)).yaw(t + Teleplot.deg(90))  # one chain: both at the same time
    time.sleep(0.05)
