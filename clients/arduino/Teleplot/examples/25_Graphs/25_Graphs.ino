// 25. Graphs: a state machine (its states, its transitions, where it is) and a behavior tree (its nodes, then each tick with the
// result of each node). The page draws them in a graph view, and their stacks on a timeline. See doc/graph.md.
#include <Teleplot.h>

Teleplot tp(Serial);
// Lists are static arrays (kept as pointers). States inside "mission" are drawn in a box; a transition has the event that makes it happen
const char* const STATES[] = { "idle", "mission/goto", "mission/grasp", "error" };
const char* const TRANSITIONS[] = { "idle>mission=start", "mission/goto>mission/grasp=arrived", "mission/grasp>idle=done", "mission>error=fault", "error>idle=reset" };
// The behavior tree: a path per node, its kind after #
const char* const NODES[] = { "root#fallback", "root/patrol#sequence", "root/patrol/battery_ok#condition", "root/patrol/goto#action", "root/dock#action" };
const char* const WALK[] = { "idle", "mission/goto", "mission/grasp" };
int tick = 0;

void setup() {
  Serial.begin(115200);
  tp.telemetry("mode").stack().enumValues(STATES).edges(TRANSITIONS);
  tp.telemetry("bt").stack().enumValues(NODES);
}

void loop() {
  if (tick % 15 == 0) {
    tp.stack("mode", random(10) == 0 ? "error" : WALK[tick / 15 % 3]);  // a new state every 1.5 s
  }
  bool low = random(6) == 0;  // a tick: the battery check fails now and then, so the fallback docks
  tp.update("bt", low ? "root/patrol/battery_ok=failure,root/patrol=failure,root/dock" : "root/patrol/battery_ok=success,root/patrol/goto");
  tick++;
  delay(100);
}
