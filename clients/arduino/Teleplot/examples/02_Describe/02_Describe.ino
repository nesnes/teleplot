// 2. Describe a value once: its unit, the range it is expected in, a description and a limit.
// With both ends of its range, the page shows it as a gauge; past the limit it says "low".
// Two more: a value kept out of the Live dashboard (autoplot), and timeout(), which the text protocol cannot say: it does nothing here
// (the C++ and Python clients send it in binary).
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("battery")
    .unit("V")
    .range(10.5, 12.6)
    .desc("Main battery")
    .threshold("low", Teleplot::Below, 11.0, "orange");
  tp.telemetry("debug").autoplot(false);  // not charted by itself (it is in the Telemetries panel)
}

void loop() {
  float battery = 12.6 - (millis() / 1000 % 60) * 0.03;  // goes down for a minute, then starts again
  tp.update("battery", battery);
  tp.update("debug", millis() % 1000);
  delay(100);
}
