// 11. How shapes look: a sphere in a color of numbers, a cube you see through, a mesh from an STL file, a picture on a rectangle.
// Files are urls the page can read: here the ones the Teleplot page serves (media/).
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("ball").shape(Teleplot::Sphere).size(0.5).position(0, 0, 0.25);
  tp.telemetry("glass").shape(Teleplot::Cube).size(1, 1, 1).position(0, 0, 0.5).color("lightblue").opacity(0.3);
  tp.telemetry("pawn").stl("media/pawn.stl").size(0.02).position(1.5, 0, 0).color("gold");
  tp.telemetry("sign").shape(Teleplot::Rect).size(2, 1.5).position(-1.5, 0, 0).texture("media/floor-plan.png");
}

void loop() {
  uint8_t red = 127 + 127 * sin(millis() / 1000.0);
  tp.telemetry("ball").color(Teleplot::Rgb(red, 80, 200));  // a color that changes
  delay(50);
}
