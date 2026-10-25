// 21. Where the time comes from: by default the date of the computer. A simulation (or a log being replayed, or ROS time) gives its
// own clock: every sample is dated by it.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    double simulated = 0;  // seconds of simulation, here 10 times faster than real time
    tp.clock([&] { return Teleplot::Time(std::chrono::duration<double>(simulated)); });
    for (;;) {
        simulated += 0.5;
        tp.update("wave", std::sin(simulated));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
