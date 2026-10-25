# 1. A first value. Start the Teleplot server, open the page: a chart appears by itself.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()  # 127.0.0.1:47269

while True:
    tp.update("wave", math.sin(time.time()))  # packed and sent every 20 ms
    time.sleep(0.05)
