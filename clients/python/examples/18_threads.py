# 18. Threads: a thread of Teleplot sends (no system call in the loops), a fast loop that never waits for Teleplot (nonBlocking),
# and the stacks of each thread on their own lane of the same timeline.
import math
import threading
import time
from teleplot import Teleplot

tp = Teleplot(sendFrom=Teleplot.Thread)
current = tp.telemetry("motor.current").unit("A").nonBlocking()  # when Teleplot is busy, this sample is dropped (counted)


def control():
    Teleplot.threadName("control")
    while True:
        with Teleplot.Stack(tp, "task", "control"):
            current.update(2 + math.sin(time.time() * 5))
        time.sleep(0.002)


threading.Thread(target=control, daemon=True).start()
while True:
    with Teleplot.Stack(tp, "task", "plan"):  # the main thread: the lane "task"; the other one: "task.control"
        time.sleep(0.05)
    time.sleep(0.05)
