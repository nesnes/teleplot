// Runs an example on a computer (EXAMPLE: the path of its .ino): setup(), then loop() for 6 simulated seconds. What it writes goes
// to <prefix>.serial.txt, <prefix>.udp.txt (its UDP packets) and <prefix>.sd.txt (its SD file), for examples.test.js to read with
// the library of the page. TELEPLOT_TEST_UDP: the example has a WiFiUDP named udp.
#include "arduino/Arduino.h"
#include "arduino/ArduinoFunctions.h"
#include "arduino/SD.h"
#include "arduino/WiFi.h"
#include <stdio.h>
#include <string>

TestStream Serial;
WiFiClass WiFi;
File sdFile;
SDClass SD;
uint64_t simulatedMicros = 1000;
uint32_t micros() { return static_cast<uint32_t>(simulatedMicros); }
uint32_t millis() { return static_cast<uint32_t>(simulatedMicros / 1000); }

#include EXAMPLE

static void save(std::string const& path, std::string const& text) { FILE* out = fopen(path.c_str(), "wb"); fwrite(text.data(), 1, text.size(), out); fclose(out); }

int main(int argc, char** argv) {
    if (argc < 2) { return 1; }
    std::string prefix = argv[1];
    setup();
    while (simulatedMicros < 6000000ULL) { uint64_t before = simulatedMicros; loop(); if (simulatedMicros == before) { simulatedMicros += 1000; } }
    save(prefix + ".serial.txt", Serial.written);
    save(prefix + ".sd.txt", sdFile.written);
    std::string packets;
#ifdef TELEPLOT_TEST_UDP
    if (!udp.packet.empty()) { udp.endPacket(); }
    for (auto const& packet : udp.packets) { packets += packet; }
#endif
    save(prefix + ".udp.txt", packets);
    return 0;
}
