// 17. A button in the page: an action with an argument, which asks before it runs (confirm). Switch CMD on, then press "Blink".
// The function runs in poll(); what it returns is shown in the page.
#include "../Teleplot.h"
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.action("blink", [&](Teleplot::Args const& args) {
        int times = static_cast<int>(args.number("times", 3));
        for (int i = 0; i < times; ++i) { tp.log("events", "blink " + std::to_string(i + 1)); }
        return Teleplot::ok("blinked " + std::to_string(times) + " times");
    }).title("Blink").confirm().arg(Teleplot::Arg("times").optional().defaultValue(3).range(1, 10));
    for (;;) {
        tp.poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
