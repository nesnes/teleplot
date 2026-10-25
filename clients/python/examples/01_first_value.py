# 1. A first value. Start the Teleplot server, open the page: a chart appears by itself.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()  # 127.0.0.1:47269

t = 0.0
while True:
    tp.update("wave", math.sin(t))  # packed and sent every 20 ms
    t += 0.05
    time.sleep(0.05)
