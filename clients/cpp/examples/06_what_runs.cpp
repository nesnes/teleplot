// 6. What runs: each function names its own level, the page draws them on a timeline ("loop", "loop/read", "loop/compute"...).
// A function does not need to know who called it.
#include "../Teleplot.h"
#include <random>
#include <thread>

Teleplot& tp = Teleplot::instance();

void readSensors() {
    Teleplot::Stack level(tp, "task", "read");
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
}

void compute() {
    Teleplot::Stack level(tp, "task", "compute");
    static std::mt19937 random;
    std::this_thread::sleep_for(std::chrono::milliseconds(5 + random() % 15));  // takes more or less time
}

int main() {
    for (;;) {
        {
            Teleplot::Stack level(tp, "task", "loop");
            readSensors();
            compute();
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
