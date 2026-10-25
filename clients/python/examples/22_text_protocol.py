# 22. The text protocol: the same calls, written as lines (a terminal, a pipe, a .teleplot.txt file). Here on the screen:
#     python3 22_text_protocol.py | nc -u 127.0.0.1 47269      also sends them to the Teleplot server
import math
import sys
import time
from teleplot import Teleplot

tp = Teleplot(protocol=Teleplot.TEXT_PROTOCOL, output=lambda data: (sys.stdout.buffer.write(data), sys.stdout.flush()))
tp.telemetry("wave").unit("V").range(-1, 1)

while True:
    tp.update("wave", math.sin(time.time()))
    time.sleep(0.2)
