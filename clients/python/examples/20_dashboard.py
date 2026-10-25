# 20. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
# Sent once at start; the page shows that dashboard instead of arranging the values by itself.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.dashboard("DASH|Robot:row\n"
             "DASH|Robot/Motion:chart:speed,accel|w=2\n"
             "DASH|Robot/State:values:battery,mode")

while True:
    t = time.time()
    tp.update("speed", math.sin(t))
    tp.update("accel", math.cos(t))
    tp.update("battery", 12.3)
    tp.update("mode", "running")
    time.sleep(0.05)
