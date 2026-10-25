# 7. A setting the page can change: switch CMD on in the page, then edit "gain" in its view.
# poll() reads what the page wrote, applies it (within the range, by steps) and sends it back.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
gain = tp.param("gain", 1.0).range(0, 5).step(0.1).desc("How big the wave is")

while True:
    tp.poll()
    tp.update("wave", gain.value * math.sin(time.time()))
    time.sleep(0.02)
