# 5. A state: a text whose latest value matters ("idle", "moving"...). The page shows it as a value, and over time on a timeline.
# Sending the same text again continues the state; an empty text means "nothing" (a hole on the timeline).
import time
from teleplot import Teleplot

tp = Teleplot.instance()
STATES = ["idle", "moving", "charging", ""]

i = 0
while True:
    tp.update("mode", STATES[i // 30 % 4])  # a new state every 3 s
    i += 1
    time.sleep(0.1)
