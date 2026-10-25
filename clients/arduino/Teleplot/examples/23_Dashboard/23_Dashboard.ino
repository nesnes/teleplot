// 23. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
// A label that is a path does it for one value ("Robot/State"). Sent once at start; the page shows that dashboard.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.dashboard("DASH|Robot:row\n"
               "DASH|Robot/Motion:chart:speed,accel|w=2\n"
               "DASH|Robot/State:values:battery,mode");
  tp.telemetry("temperature").label("Robot/State");  // the same view, by its path
}

void loop() {
  float t = millis() / 1000.0;
  tp.update("speed", sin(t));
  tp.update("accel", cos(t));
  tp.update("battery", 12.3);
  tp.update("mode", "running");
  tp.update("temperature", 21.5);
  delay(50);
}
