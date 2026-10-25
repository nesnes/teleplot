# 17. Times and rates. A sample is dated when it is sent; at() gives the time it was measured instead (a sensor read earlier).
# maxRate() keeps at most that many samples per second of a fast value: the rest are not sent.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("fast").maxRate(20)

while True:
    measured_at = Teleplot.now()
    reading = math.sin(time.time())    # measured now...
    time.sleep(0.03)                   # ...sent later
    tp.telemetry("reading").at(measured_at).update(reading)
    for i in range(100):
        tp.update("fast", math.sin(time.time() * 10))  # called 100 times, sent at most 20 times per second
        time.sleep(0.0005)
