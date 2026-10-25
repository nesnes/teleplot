# 17. A button in the page: an action with an argument, which asks before it runs (confirm). Switch CMD on, then press "Blink".
# The function runs in poll(); what it returns is shown in the page.
import time
from teleplot import Teleplot

tp = Teleplot.instance()


@tp.action("blink").title("Blink").confirm().arg(Teleplot.Arg("times").optional().defaultValue(3).range(1, 10))
def blink(args):
    times = int(args.number("times", 3))
    for i in range(times):
        tp.log("events", "blink %d" % (i + 1))
    return Teleplot.ok("blinked %d times" % times)


while True:
    tp.poll()
    time.sleep(0.02)
