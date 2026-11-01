# 26. Moments: periods of your application, a cycle, an operation, a phase. The page steps through them, replays them and exports them.
# "#42" numbers each occurrence, "/" nests, "=ok" ends a moment with its result.
import time
from teleplot import Teleplot

tp = Teleplot.instance()
tp.telemetry("cycle").moment()

pick = 0
while True:
    pick += 1
    path = "run 1/pick#%d" % pick
    tp.stack("cycle", path + "/approach")
    time.sleep(0.1)
    tp.stack("cycle", path + "/grip")
    time.sleep(0.1)
    tp.stack("cycle", path + ("=failed" if pick % 7 == 0 else "=ok"))
    time.sleep(0.05)
