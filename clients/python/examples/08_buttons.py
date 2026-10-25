# 8. A button in the page: an action, with an argument. Switch CMD on in the page, then press "Say".
# The function runs in poll(); what it returns is shown in the page.
import time
from teleplot import Teleplot

tp = Teleplot.instance()


@tp.action("say").title("Say").arg(Teleplot.Arg("times").optional().defaultValue(3).range(1, 10))
def say(args):
    times = int(args.number("times", 3))
    for i in range(times):
        tp.log("events", "hello %d" % (i + 1))
    return Teleplot.ok("said %d times" % times)


while True:
    tp.poll()
    time.sleep(0.02)
