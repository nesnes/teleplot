// 26. Moments: periods of your application, a cycle, an operation, a phase. The page steps through them, replays them and exports them.
// "#42" numbers each occurrence, "/" nests, "=ok" ends a moment with its result.
#include "../Teleplot.h"
#include <string>
#include <thread>

Teleplot& tp = Teleplot::instance();

int main() {
    tp.telemetry("cycle").moment();
    for (int pick = 1;; pick++) {
        std::string path = "run 1/pick#" + std::to_string(pick);
        tp.stack("cycle", path + "/approach");
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        tp.stack("cycle", path + "/grip");
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        tp.stack("cycle", path + (pick % 7 == 0 ? "=failed" : "=ok"));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
