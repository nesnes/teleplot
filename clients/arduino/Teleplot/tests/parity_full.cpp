// shared.inc with the C++ client for computers: a binary file (argument: its path)
#include "../../../cpp/Teleplot.h"
#include "shared.inc"

int main(int argc, char** argv) {
    Teleplot tp(Teleplot::Options().file(argc > 1 ? argv[1] : "full.teleplot").flushInterval(std::chrono::milliseconds(0)));
    sharedScenario(tp);
    return 0;
}
