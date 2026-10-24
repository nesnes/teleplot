// 21. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
// Sent once at start; the page shows that dashboard instead of arranging the values by itself.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.dashboard("DASH|Robot:row\n"
               "DASH|Robot/Motion:chart:speed,accel|w=2\n"
               "DASH|Robot/State:values:battery,mode");
}

void loop() {
  float t = millis() / 1000.0;
  tp.update("speed", sin(t));
  tp.update("accel", cos(t));
  tp.update("battery", 12.3);
  tp.update("mode", "running");
  delay(50);
}
