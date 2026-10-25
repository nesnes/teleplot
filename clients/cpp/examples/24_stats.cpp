// 24. How the client is doing, in the page: what it sends per second, what waits, what went wrong, as telemetries of their own.
#include "../Teleplot.h"
#include <cmath>
#include <string>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.sendStats(Teleplot::ms(1000));  // teleplot.packets, .bytes, .samples, .queued, and the problems, every second
    for (double t = 0;; t += 0.05) {
        for (int i = 0; i < 50; ++i) { tp.update("wave." + std::to_string(i % 5), std::sin(t + i)); }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
