// shared.inc with this library: text lines to a file (argument: its path)
#include "arduino/Arduino.h"
#include "../src/Teleplot.h"
#include <stdio.h>

TestStream Serial;
uint32_t micros() { return 0; }
uint32_t millis() { return 10000; }

class FilePrint : public Print {
public:
    FILE* f;
    explicit FilePrint(const char* path) : f(fopen(path, "wb")) {}
    ~FilePrint() { if (f) { fclose(f); } }
    size_t write(uint8_t c) override { return fputc(c, f) == EOF ? 0 : 1; }
};

#include "shared.inc"

// Arguments: the file of plain lines, then the file of lines as a serial port writes them (">" before telemetry)
int main(int argc, char** argv) {
    if (argc < 3) { return 1; }
    {
        FilePrint file(argv[1]);
        Teleplot tp(file);
        sharedScenario(tp);
    }
    clockNs = T0;
    Serial.written.clear();
    {
        Teleplot tp(Serial);
        sharedScenario(tp);
    }
    FilePrint serial(argv[2]);
    fwrite(Serial.written.data(), 1, Serial.written.size(), serial.f);
    return 0;
}
