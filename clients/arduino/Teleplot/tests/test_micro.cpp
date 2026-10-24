// The microcontroller library alone: what it writes, what it reads from the page (doc/telecmd.md), its limits. Built on a computer
// with tests/arduino/Arduino.h (./test.sh); what it writes is also read back by the library of the page in parity.test.js.
#define TELEPLOT_MAX_TELEMETRIES 4
#include "arduino/Arduino.h"
#include "../src/Teleplot.h"
#include <stdio.h>
#include <stdlib.h>
#include <string>

TestStream Serial;
static uint32_t fakeMicros = 0, fakeMillis = 0;
uint32_t micros() { return fakeMicros; }
uint32_t millis() { return fakeMillis; }

static int failures = 0;
#define CHECK(what, cond) do { if (cond) { printf("ok   %s\n", what); } else { printf("FAIL %s (%s)\n%s\n", what, #cond, Serial.written.substr(0, 600).c_str()); failures++; } } while (0)
static bool has(std::string const& text, std::string const& part) { return text.find(part) != std::string::npos; }
static int count(std::string const& text, std::string const& part) { int n = 0; for (size_t at = text.find(part); at != std::string::npos; at = text.find(part, at + 1)) { n++; } return n; }

static float kp = 0.5f;
static bool motors = false;
static char mode[12] = "auto";
static int counter = 3;
static Teleplot::Pose2D cmdVel;
static const char* const MODES[] = { "auto", "manual" };
static int runs = 0;
static Teleplot::Result oddOnly(int const& v) { return v % 2 ? Teleplot::ok() : Teleplot::error("odd only"); }
static Teleplot::Result goTo(Teleplot::Args const& args) {
    runs++;
    Teleplot::Number2D t = args.xy("target");
    return t.x == 1.5 && t.y == 2 && args.number("speed", 0.25) == 0.25 && !args.has("speed") ? Teleplot::ok("arrived") : Teleplot::error("bad arguments");
}
static Teleplot::Result say(Teleplot::Args const& args) { return Teleplot::ok(args.text("words")); }

int main() {
    // Lines on a serial port start with ">"; times are micros() since boot, in ms with three decimals, also after it wraps
    {
        Serial.written.clear();
        Teleplot tp(Serial);
        fakeMicros = 52341207;
        tp.update("speed", 0.5);
        CHECK("serial: a sample line after \">\", time since boot in ms", Serial.written == ">speed:52341.207:0.5\n");
        fakeMicros = 4000000000u;
        tp.update("speed", 1);
        fakeMicros = 1000;
        tp.update("speed", 2);
        CHECK("micros() wraps after 71 min: the time keeps going", has(Serial.written, ">speed:4294968.296:2\n"));
        tp.dashboard("DASH|A/B:chart:speed\nDASH|A/C:log:x");
        CHECK("dashboard lines, each after \">\"", has(Serial.written, ">DASH|A/B:chart:speed\n>DASH|A/C:log:x\n"));
    }

    // Numbers written the shortest way, without printf
    {
        Serial.written.clear();
        Teleplot tp(Serial, false);
        tp.clock([] { return Teleplot::ns(0); });
        double values[] = { 0, -0.5, 1e-7, 123456789, 1e20, 0.1, 12.6, 3.14159265, -273.15, NAN };
        for (double v : values) { tp.update("n", v); }
        CHECK("numbers: 0 -0.5 1e-7 123456789 1e20 0.1 12.6 3.14159265 -273.15 nan (9 digits: any float32 exactly)",
            Serial.written == "n:0.000:0\nn:0.000:-0.5\nn:0.000:1e-7\nn:0.000:123456789\nn:0.000:1e20\nn:0.000:0.1\nn:0.000:12.6\nn:0.000:3.14159265\nn:0.000:-273.15\nn:0.000:nan\n");
        Serial.written.clear();
        tp.telemetry("gps").precise();
        tp.update("gps", 48.85837009);
        CHECK("precise(): 15 digits", Serial.written == "gps:0.000:48.85837009\n");
        Serial.written.clear();
        tp.update("t", "a\nb § c");
        CHECK("a text stays on one line, without the § of a unit", Serial.written == "t:0.000:a b ? c|t\n");
    }

    // Commands read from the serial port: settings (clamped, refused, echoed) and calls (run once, answered twice)
    {
        Serial.written.clear();
        Serial.input.clear();
        Serial.at = 0;
        fakeMillis = 10000;
        Teleplot tp(Serial);
        tp.clock([] { return Teleplot::ms(10000); });
        tp.param("kp", &kp).range(0, 10).step(0.5).unit("1/s");
        tp.param("motors", &motors);
        tp.param("mode", &mode).choices(MODES);
        tp.param("counter", &counter).onChange(oddOnly);
        tp.param("cmd_vel", &cmdVel).axes(Teleplot::X | Teleplot::Yaw).rate(20).hold(200);
        tp.action("goto", goTo).title("Go to").confirm().arg(Teleplot::Arg("target", Teleplot::Arg::XY)).arg(Teleplot::Arg("speed").optional().defaultValue(0.25));
        tp.action("say", say).arg(Teleplot::Arg("words", Teleplot::Arg::Text));
        tp.poll();
        CHECK("declarations", has(Serial.written, ">ATTR|kp|write=number|min=0|max=10|step=0.5|unit=1/s\n")
            && has(Serial.written, ">ATTR|mode|write=text|choices=auto,manual\n")
            && has(Serial.written, ">ATTR|cmd_vel|write=pose2d|rate=20|hold=200|axes=x,yaw\n")
            && has(Serial.written, ">ATTR|goto|action|title=Go to|confirm\n")
            && has(Serial.written, ">ATTR|goto|arg=speed|type=number|optional|default=0.25\n"));
        CHECK("settings published", has(Serial.written, ">kp:10000.000:0.5\n") && has(Serial.written, ">mode:10000.000:auto|t\n") && has(Serial.written, ">cmd_vel:0:0:0:10000.000|xyz\n"));
        Serial.written.clear();
        Serial.input = "kp:12.3\nmotors:1\nmode:sport\ncounter:4\ncmd_vel:1.5:0:0.25\n!goto#21:target=1.5,2\n!goto#21:target=1.5,2\n!goto#22\n!say#3:words=a%3Ab c\n!nope#4\n";
        tp.poll();
        CHECK("a number is clamped to its range", kp == 10.0f);
        CHECK("a bool is applied", motors);
        CHECK("a text outside the choices is refused", strcmp(mode, "auto") == 0 && has(Serial.written, ">ACK|mode:err:one of the choices\n"));
        CHECK("onChange refuses before applying", counter == 3 && has(Serial.written, ">ACK|counter:err:odd only\n"));
        CHECK("a pose2d", cmdVel.x == 1.5 && cmdVel.yaw == 0.25);
        CHECK("the echo is sent at once", has(Serial.written, ">kp:10000.000:10\n"));
        CHECK("a call runs once, answered run, ok, then ok again", runs == 1 && count(Serial.written, ">ACK|goto#21:run\n") == 1 && count(Serial.written, ">ACK|goto#21:ok:arrived\n") == 2);
        CHECK("a missing argument is refused", has(Serial.written, ">ACK|goto#22:err:missing target\n"));
        CHECK("a text argument is unescaped", has(Serial.written, ">ACK|say#3:ok:a:b c\n"));
        CHECK("an unknown action", has(Serial.written, ">ACK|nope#4:err:unknown action\n"));
        fakeMillis = 10500;
        Serial.written.clear();
        tp.poll();
        CHECK("hold: nobody drives cmd_vel any more, back to rest", cmdVel.x == 0 && has(Serial.written, ">cmd_vel:0:0:0:"));
        Serial.input = std::string(300, 'x') + "\nkp:2\n";
        Serial.at = 0;
        tp.poll();
        CHECK("a line too long is ignored, the next one is read", kp == 2.0f && tp.stats().dropped == 1);
    }

    // Descriptions: sent before the first sample, again every 5 s with what was sent once; the table has a size
    {
        Serial.written.clear();
        fakeMillis = 20000;
        Teleplot tp(Serial, false);
        tp.clock([] { return Teleplot::ns(1000000); });
        tp.telemetry("battery").unit("V").range(10.5, 12.5).label("power").threshold("low", Teleplot::Below, 11);
        tp.update("battery", 12);
        CHECK("described before its first sample, label on its lines", Serial.written == "ATTR|battery|unit=V|min=10.5|max=12.5\nTH|battery:1.000:low<11\nbattery,power:1.000:12\n");
        tp.telemetry("box").shape(Teleplot::Cube).size(1, 2, 3);
        tp.telemetry("a").unit("x");
        tp.telemetry("b").unit("y");
        tp.telemetry("c").unit("z");
        CHECK("a fifth described telemetry does not fit (TELEPLOT_MAX_TELEMETRIES 4): counted", tp.stats().tooBig == 1);
        Serial.written.clear();
        fakeMillis = 26000;
        tp.poll();
        CHECK("every 5 s: descriptions, thresholds and what was sent once, with its own time", has(Serial.written, "ATTR|battery|unit=V|min=10.5|max=12.5\n")
            && has(Serial.written, "TH|battery:1.000:low<11\n") && has(Serial.written, "3D|box:1.000:SC:1:2:3\n") && has(Serial.written, "3D|box:1.000:S:\"cube\"\n"));
        Teleplot rated(Serial, false);
        rated.telemetry("rated").maxRate(10);
        Serial.written.clear();
        for (uint32_t i = 0; i < 1000; ++i) { fakeMicros = i * 1000; rated.update("rated", 1); }
        CHECK("maxRate(10): one sample per 100 ms", count(Serial.written, "rated:") == 10);
    }

    // sendStats(): rates and totals as lines, with their descriptions, without a table slot
    {
        Serial.written.clear();
        fakeMillis = 40000;
        Teleplot tp(Serial, false);
        tp.clock([] { return Teleplot::ns(0); });
        tp.sendStats(Teleplot::ms(1000));
        for (int i = 0; i < 10; ++i) { tp.update("v", i); }
        fakeMillis = 41000;
        tp.update("v", 10);
        CHECK("sendStats: samples and bytes per second, with label, and their descriptions", has(Serial.written, "teleplot.samples,teleplot sent:0.000:10\n")
            && has(Serial.written, "ATTR|teleplot.samples|unit=/s|desc=Samples sent per second\n") && has(Serial.written, "teleplot.tooBig,teleplot problems:0.000:0\n"));
        tp.sendStats(Teleplot::ms(0));
        Serial.written.clear();
        fakeMillis = 50000;
        tp.update("v", 1);
        CHECK("sendStats(0): no more", !has(Serial.written, "teleplot."));
    }

    // UDP: lines in packets, sent when full, after 20 ms or on flush(); what comes back is read
    {
        TestUdp udp;
        fakeMillis = 30000;
        Teleplot tp(udp, "192.168.1.10", 47269);
        for (int i = 0; i < 100; ++i) { tp.update("v", i); }
        CHECK("lines go in packets of about 1200 bytes, no \">\"", udp.packets.size() == 1 && udp.host == "192.168.1.10" && udp.port == 47269 && udp.packets[0].rfind("v:", 0) == 0);
        fakeMillis = 30030;
        tp.update("v", 1);
        size_t before = udp.packets.size();
        tp.flush();
        CHECK("flush() sends the packet in progress", udp.packets.size() == before + 1);
    }

    // Another output (an SD file), and disable()
    {
        Serial.written.clear();
        TestStream file;
        Teleplot tp(Serial);
        tp.addOutput(file);
        tp.clock([] { return Teleplot::ns(0); });
        tp.update("x", 1);
        CHECK("addOutput(): the same lines, without \">\"", Serial.written == ">x:0.000:1\n" && file.written == "x:0.000:1\n");
        tp.disable();
        tp.update("x", 2);
        CHECK("disable(): nothing", Serial.written == ">x:0.000:1\n");
    }

    printf(failures ? "%d failed\n" : "microcontroller library ok\n", failures);
    return failures ? 1 : 0;
}
