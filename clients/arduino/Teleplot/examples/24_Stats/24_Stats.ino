// 24. How the library is doing, in the page: what it sends per second, what did not fit in its tables, what was dropped, as
// telemetries of their own (teleplot.samples, teleplot.bytes, teleplot.tooBig, teleplot.dropped).
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.sendStats(Teleplot::ms(1000));  // every second
}

void loop() {
  float t = millis() / 1000.0;
  tp.update("wave.0", sin(t));
  tp.update("wave.1", sin(t + 1));
  tp.update("wave.2", sin(t + 2));
  delay(20);
}
