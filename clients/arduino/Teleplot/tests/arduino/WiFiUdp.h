#pragma once
#include "Arduino.h"
// Packets kept as lines (run_example.cpp writes them out)
class WiFiUDP : public TestUdp { public: uint8_t begin(uint16_t) { return 1; } };
