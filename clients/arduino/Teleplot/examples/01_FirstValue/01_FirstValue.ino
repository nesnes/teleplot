// 1. A first value. Upload, then in the Teleplot page: Sources, "Add a source", Serial port, 115200 bauds.
// A chart appears by itself.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
}

void loop() {
  float wave = sin(millis() / 1000.0);
  tp.update("wave", wave);   // sends ">wave:<time>:<value>"
  delay(50);
}
