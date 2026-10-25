# 31. An action that takes long: the handler answers "running" at once (poll() goes on), and the program says when it is done.
import time
from teleplot import Teleplot

tp = Teleplot.instance()
scanning = None
progress = 0


@tp.action("scan").title("Scan")
def scan(args):
    global scanning, progress
    scanning, progress = args.call(), 0
    return Teleplot.running()  # the page shows it running


while True:
    tp.poll()
    if scanning is not None:
        progress += 1
        if progress == 100:  # two seconds later
            tp.answer(scanning, Teleplot.ok("12 objects found"))
            scanning = None
    time.sleep(0.02)
