# 4. Logs: lines to read one after the other, shown in a log view and as marks on the charts.
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.log("events", "started")

presses = 0
while True:
    presses += 1
    tp.update("presses", presses)
    if presses % 20 == 0:
        tp.log("events", "twenty more")
    time.sleep(0.1)
