# 16. Rules of a setting: a text among choices, a check before applying (onChange: the page shows why it was refused), and a setting
# bound to an attribute of an object (the closest Python has to the pointer of C++).
import time
from teleplot import Teleplot

tp = Teleplot.instance()


class Controller:
    target = 10


controller = Controller()
mode = tp.param("mode", "manual").choices(["manual", "auto", "off"])


def check_target(value):
    if mode.value == "off":
        return Teleplot.error("mode is off")
    if value % 5:
        return Teleplot.error("by 5")
    return Teleplot.ok()


tp.param("target", controller, "target").range(0, 100).onChange(check_target)

while True:
    tp.poll()  # controller.target is what the page last set, if it was accepted
    time.sleep(0.02)
