// 16. A setting the page can change: switch CMD on in the page, then edit "gain" in its view.
// poll() reads what the page wrote, applies it to the variable (within the range, by steps) and sends it back.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    float gain = 1;
    tp.param("gain", &gain).range(0, 5).step(0.1).desc("How big the wave is");
    for (double t = 0;; t += 0.02) {
        tp.poll();
        tp.update("wave", gain * std::sin(t));
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
