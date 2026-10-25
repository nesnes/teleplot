// 6. What runs: each function names its own level, the page draws them on a timeline ("loop", "loop/read", "loop/compute"...).
// A function does not need to know who called it.
#include <Teleplot.h>

Teleplot tp(Serial);

void readSensors() {
  Teleplot::Stack level(tp, "task", "read");
  delay(5);
}

void compute() {
  Teleplot::Stack level(tp, "task", "compute");
  delay(random(5, 20));  // takes more or less time
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  Teleplot::Stack level(tp, "task", "loop");
  readSensors();
  compute();
  delay(20);
}
