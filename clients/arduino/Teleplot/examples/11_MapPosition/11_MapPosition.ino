// 11. A position on a map: two numbers (x, y) make a point, drawn with its trail.
// GPS coordinates need more digits than a float holds: precise() sends 15 (on AVR boards a double is a float: it cannot help there).
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("gps").precise();
}

void loop() {
  double t = millis() / 1000.0;
  double longitude = 2.294481 + 0.0005 * cos(t * 0.2);
  double latitude = 48.858370 + 0.0003 * sin(t * 0.2);
  tp.update("gps", Teleplot::Number2D(longitude, latitude));
  delay(100);
}
