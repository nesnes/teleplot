// 8. A shape that moves: described once (its kind, size and color), then only its position and heading are sent.
// The page shows it on a map (2D view). Angles are in radians: Teleplot::deg() converts degrees.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("robot").shape(Teleplot::Rect).size(0.4, 0.3).color("#2ecc71");
}

void loop() {
  float t = millis() / 1000.0;
  float x = 2 * cos(t * 0.3), y = 2 * sin(t * 0.3);
  tp.telemetry("robot").position(x, y).yaw(t * 0.3 + Teleplot::deg(90));  // one chain: both at the same time
  delay(50);
}
