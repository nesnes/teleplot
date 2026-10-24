// 2. Describe a value once: its unit, the range it is expected in, a description and a limit.
// With both ends of its range, the page shows it as a gauge; past the limit it says "low".
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("battery")
    .unit("V")
    .range(10.5, 12.6)
    .desc("Main battery")
    .threshold("low", Teleplot::Below, 11.0, "orange");
}

void loop() {
  float battery = 12.6 - (millis() / 1000 % 60) * 0.03;  // goes down for a minute, then starts again
  tp.update("battery", battery);
  delay(100);
}
