// 25. Graphs: a state machine (its states, its transitions, where it is) and a behavior tree (its nodes, then each tick with the
// result of each node). The page draws them in a graph view, and their stacks on a timeline. See doc/graph.md.
#include "../Teleplot.h"
#include <random>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    // The state machine: states inside "mission" are drawn in a box; each transition with the event that makes it happen
    tp.telemetry("mode").stack()
        .enumValues({ "idle", "mission/goto", "mission/grasp", "error" })
        .edges({ "idle>mission=start", "mission/goto>mission/grasp=arrived", "mission/grasp>idle=done", "mission>error=fault", "error>idle=reset" });
    // The behavior tree: a path per node, its kind after #
    tp.telemetry("bt").stack()
        .enumValues({ "root#fallback", "root/patrol#sequence", "root/patrol/battery_ok#condition", "root/patrol/goto#action", "root/dock#action" });
    const char* states[] = { "idle", "mission/goto", "mission/grasp" };
    std::mt19937 random;
    for (int i = 0;; ++i) {
        if (i % 15 == 0) tp.stack("mode", random() % 10 == 0 ? "error" : states[i / 15 % 3]);  // a new state every 1.5 s
        bool low = random() % 6 == 0;  // a tick: the battery check fails now and then, so the fallback docks
        tp.update("bt", low ? "root/patrol/battery_ok=failure,root/patrol=failure,root/dock" : "root/patrol/battery_ok=success,root/patrol/goto");
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
