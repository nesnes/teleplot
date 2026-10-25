// 1. A first value. Start the Teleplot server, open the page: a chart appears by itself.
// Build: c++ -std=c++17 -pthread 01_first_value.cpp -o first_value (Windows: also ws2_32)
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();  // 127.0.0.1:47269
    for (double t = 0;; t += 0.05) {
        tp.update("wave", std::sin(t));   // packed and sent every 20 ms
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
