# 21. Where the time comes from: by default the date of the computer. A simulation (or a log being replayed, or ROS time) gives its
# own clock: every sample is dated by it (seconds, a datetime or a Teleplot.Time).
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
simulated = 0.0  # seconds of simulation, here 10 times faster than real time
tp.clock(lambda: simulated)

while True:
    simulated += 0.5
    tp.update("wave", math.sin(simulated))
    time.sleep(0.05)
