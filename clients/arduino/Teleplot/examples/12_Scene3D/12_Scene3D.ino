// 12. A 3D scene: a body that turns, and an arm placed in the frame of the body: it follows the body without being computed here.
// Frame of the scene: x forward, y to the left, z up. Positions in your own units.
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("body").shape(Teleplot::Cube).size(0.6, 0.4, 0.2).color("#3498db");
  tp.telemetry("arm").shape(Teleplot::Cylinder).size(0.05, 0.05, 0.5).color("orange")
    .frame("body");                       // its position is relative to the body
  tp.telemetry("arm").position(0.2, 0, 0.35);
}

void loop() {
  float t = millis() / 1000.0;
  tp.telemetry("body").position(cos(t * 0.5), sin(t * 0.5), 0.1).yaw(t * 0.5);
  delay(50);
}
