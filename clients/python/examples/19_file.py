# 19. Recording: what is sent also goes to a file, which the page opens (Export and import panel, or dropped on the page).
import math
import time
from teleplot import Teleplot

tp = Teleplot(udp=("127.0.0.1", 47269), file="run.teleplot")

while True:
    tp.update("temperature", 20 + math.sin(time.time() / 10))
    time.sleep(0.5)
