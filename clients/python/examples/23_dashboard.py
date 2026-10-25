# 23. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
# A label that is a path does it for one value ("Robot/State"). Sent once; the page shows that dashboard.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.dashboard("DASH|Robot:row\n"
             "DASH|Robot/Motion:chart:speed,accel|w=2\n"
             "DASH|Robot/State:values:battery,mode")
tp.telemetry("temperature").label("Robot/State")  # the same view, by its path

t = 0.0
while True:
    tp.update("speed", math.sin(t))
    tp.update("accel", math.cos(t))
    tp.update("battery", 12.3)
    tp.update("mode", "running")
    tp.update("temperature", 21.5)
    t += 0.05
    time.sleep(0.05)
