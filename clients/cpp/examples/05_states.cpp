// 5. A state: a text whose latest value matters ("idle", "moving"...). The page shows it as a value, and over time on a timeline.
// Sending the same text again continues the state; an empty text means "nothing" (a hole on the timeline).
#include "../Teleplot.h"
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    const char* states[] = { "idle", "moving", "charging", "" };
    for (int i = 0;; ++i) {
        tp.update("mode", states[i / 30 % 4]);  // a new state every 3 s
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
