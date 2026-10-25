# 24. How the client is doing, in the page: what it sends per second, what waits, what went wrong, as telemetries of their own.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.sendStats(Teleplot.ms(1000))  # teleplot.packets, .bytes, .samples, .queued, and the problems, every second

t = 0.0
while True:
    for i in range(50):
        tp.update("wave.%d" % (i % 5), math.sin(t + i))
    t += 0.05
    time.sleep(0.05)
