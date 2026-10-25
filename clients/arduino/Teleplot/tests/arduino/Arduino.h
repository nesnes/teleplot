// The little of the Arduino core that Teleplot.h uses, to build and test it on a computer (tests/test.sh). Not for boards.
#ifndef TELEPLOT_TEST_ARDUINO_H
#define TELEPLOT_TEST_ARDUINO_H
#include <stddef.h>
#include <stdint.h>
#include <time.h>  // (time(), as the ESP32 core gives it to sketches)
#include <string>
#include <vector>

// As the AVR core does (the library must live with them, see src/Teleplot.h)
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))

class Print {
public:
    virtual ~Print() {}
    virtual size_t write(uint8_t c) = 0;
    virtual size_t write(const uint8_t* p, size_t n) { size_t done = 0; for (size_t i = 0; i < n; ++i) { done += write(p[i]); } return done; }
};
class Stream : public Print {
public:
    virtual int available() = 0;
    virtual int read() = 0;
};

// What is written, kept; what is to be read, given by the test
class TestStream : public Stream {
public:
    std::string written, input;
    size_t at = 0;
    void begin(long) {}
    size_t write(uint8_t c) override { written += static_cast<char>(c); return 1; }
    int available() override { return static_cast<int>(input.size() - at); }
    int read() override { return at < input.size() ? static_cast<unsigned char>(input[at++]) : -1; }
};
extern TestStream Serial;

// A UDP socket as WiFiUDP has it: lines go in packets
class TestUdp : public TestStream {
public:
    std::string packet, host;
    std::vector<std::string> packets;
    uint16_t port = 0;
    int beginPacket(const char* h, uint16_t p) { host = h; port = p; packet.clear(); return 1; }
    size_t write(uint8_t c) override { packet += static_cast<char>(c); return 1; }
    int endPacket() { packets.push_back(packet); packet.clear(); return 1; }
    int parsePacket() { return available(); }
};

uint32_t micros();
uint32_t millis();
#endif
