// 3. Values that belong together: the same label puts them in the same chart.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("motor.left").unit("rpm").label("motors");
  tp.telemetry("motor.right").unit("rpm").label("motors");
}

void loop() {
  float t = millis() / 1000.0;
  tp.update("motor.left", 100 + 20 * sin(t));
  tp.update("motor.right", 100 + 20 * cos(t));
  delay(50);
}
