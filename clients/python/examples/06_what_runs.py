# 6. What runs: each function names its own level, the page draws them on a timeline ("loop", "loop/read", "loop/compute"...).
# A function does not need to know who called it.
import random
import time
from teleplot import Teleplot

tp = Teleplot.instance()


@Teleplot.Stack(tp, "task", "read")  # a whole function
def read_sensors():
    time.sleep(0.005)


def compute():
    with Teleplot.Stack(tp, "task", "compute"):  # a block
        time.sleep(random.uniform(0.005, 0.02))  # takes more or less time


while True:
    with Teleplot.Stack(tp, "task", "loop"):
        read_sensors()
        compute()
    time.sleep(0.02)
