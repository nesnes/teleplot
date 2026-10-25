// 31. An action that takes long: the handler answers "running" at once (poll() goes on), and the program says when it is done.
#include "../Teleplot.h"
#include <optional>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    std::optional<Teleplot::Call> scanning;
    int progress = 0;
    tp.action("scan", [&](Teleplot::Args const& args) {
        scanning = args.call();
        progress = 0;
        return Teleplot::running();  // the page shows it running
    }).title("Scan");
    for (;;) {
        tp.poll();
        if (scanning && ++progress == 100) {  // two seconds later
            tp.answer(*scanning, Teleplot::ok("12 objects found"));
            scanning.reset();
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
