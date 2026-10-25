# 3. Values that belong together: the same label puts them in the same chart.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("motor.left").unit("rpm").label("motors")
tp.telemetry("motor.right").unit("rpm").label("motors")

while True:
    t = time.time()
    tp.update("motor.left", 100 + 20 * math.sin(t))
    tp.update("motor.right", 100 + 20 * math.cos(t))
    time.sleep(0.05)
