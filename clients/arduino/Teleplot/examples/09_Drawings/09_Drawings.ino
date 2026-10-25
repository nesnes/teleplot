// 9. Drawings on a map: a path (a line through points), a zone (a polygon), a spot (a circle), an arrow and a text. They are flat
// shapes: the page shows them in 2D.
#include <Teleplot.h>

Teleplot tp(Serial);
Teleplot::Number2D path[] = { Teleplot::Number2D(0, 0), Teleplot::Number2D(1, 0.5), Teleplot::Number2D(2, 0.25), Teleplot::Number2D(3, 1) };
Teleplot::Number2D zone[] = { Teleplot::Number2D(1, -1), Teleplot::Number2D(3, -1), Teleplot::Number2D(2.5, -0.2) };

void setup() {
  Serial.begin(115200);
  tp.telemetry("path").shape(Teleplot::Line).lineWidth(0.03).color("gray");
  tp.telemetry("path").points(path, 4);
  tp.telemetry("zone").shape(Teleplot::Polygon).color("rgba(46, 204, 113, 0.3)");
  tp.telemetry("zone").points(zone, 3);
  tp.telemetry("spot").shape(Teleplot::Circle).size(0.4).color("orange");
  tp.telemetry("spot").position(0, 1);
  tp.telemetry("goal").shape(Teleplot::Text).position(3, 1.2).text("goal").textSize(0.2);
  tp.telemetry("wind").shape(Teleplot::Arrow).color("teal");
}

void loop() {
  float t = millis() / 1000.0;
  tp.telemetry("wind").position(0, 1.5).vector(0.6 * cos(t), 0.6 * sin(t));  // an arrow that turns
  delay(100);
}
