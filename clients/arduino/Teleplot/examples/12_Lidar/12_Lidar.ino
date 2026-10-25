// 12. A point cloud (a lidar scan): all the points of a scan are one sample, in the frame of the sensor, each with its intensity.
// The sensor is placed in the scene like a shape; the page draws each scan where the sensor was.
#include <Teleplot.h>

Teleplot tp(Serial);
const int COUNT = 36;
Teleplot::Number3D scan[COUNT];
float intensities[COUNT];

void setup() {
  Serial.begin(115200);
  tp.telemetry("lidar").position(0, 0, 0.2);  // where the sensor is
}

void loop() {
  float t = millis() / 1000.0;
  for (int i = 0; i < COUNT; i++) {
    float angle = i * 2 * PI / COUNT;
    float distance = 2 + 0.5 * sin(angle * 3 + t);  // a wall that moves
    scan[i] = Teleplot::Number3D(distance * cos(angle), distance * sin(angle), 0);
    intensities[i] = 1 / distance;
  }
  tp.telemetry("lidar").cloud(scan, COUNT, intensities);
  delay(200);
}
