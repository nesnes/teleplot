# 25. Graphs: a state machine (its states, its transitions, where it is) and a behavior tree (its nodes, then each tick with the
# result of each node). The page draws them in a graph view, and their stacks on a timeline. See doc/graph.md.
import random
import time
from teleplot import Teleplot

tp = Teleplot.instance()
# The state machine: states inside "mission" are drawn in a box; each transition with the event that makes it happen
tp.telemetry("mode").stack() \
    .enumValues(["idle", "mission/goto", "mission/grasp", "error"]) \
    .edges(["idle>mission=start", "mission/goto>mission/grasp=arrived", "mission/grasp>idle=done", "mission>error=fault", "error>idle=reset"])
# The behavior tree: a path per node, its kind after #
tp.telemetry("bt").stack().enumValues(["root#fallback", "root/patrol#sequence", "root/patrol/battery_ok#condition", "root/patrol/goto#action", "root/dock#action"])

states = ["idle", "mission/goto", "mission/grasp"]
tick = 0
while True:
    if tick % 15 == 0:  # a new state every 1.5 s
        tp.stack("mode", "error" if random.random() < 0.1 else states[tick // 15 % 3])
    low = random.random() < 1 / 6  # a tick: the battery check fails now and then, so the fallback docks
    tp.update("bt", "root/patrol/battery_ok=failure,root/patrol=failure,root/dock" if low else "root/patrol/battery_ok=success,root/patrol/goto")
    tick += 1
    time.sleep(0.1)
