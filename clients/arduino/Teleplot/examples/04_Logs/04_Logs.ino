// 4. Logs: lines to read one after the other, shown in a log view and as marks on the charts.
#include <Teleplot.h>

Teleplot tp(Serial);
int presses = 0;

void setup() {
  Serial.begin(115200);
  tp.log("events", "started");
}

void loop() {
  presses++;
  tp.update("presses", presses);
  if (presses % 20 == 0) {
    tp.log("events", "twenty more");
  }
  delay(100);
}
