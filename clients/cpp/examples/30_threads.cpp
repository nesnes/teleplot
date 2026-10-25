// 30. Threads: a thread of Teleplot sends (no system call in the loops), a fast loop that never waits for Teleplot (nonBlocking),
// the stacks of each thread on their own lane of the same timeline, and where the threads of Teleplot run.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot tp(Teleplot::Options().sendFrom(Teleplot::Thread).threadPriority(Teleplot::Low));  // under the program's own threads
    auto current = tp.telemetry("motor.current").unit("A").nonBlocking();  // when Teleplot is busy, this sample is dropped (counted)
    std::thread control([&] {
        Teleplot::threadName("control");
        for (double t = 0;; t += 0.002) {
            { Teleplot::Stack level(tp, "task", "control"); current.update(2 + std::sin(t * 5)); }
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
    });
    control.detach();
    for (;;) {
        { Teleplot::Stack level(tp, "task", "plan"); std::this_thread::sleep_for(std::chrono::milliseconds(50)); }  // lane "task"; the other: "task.control"
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
