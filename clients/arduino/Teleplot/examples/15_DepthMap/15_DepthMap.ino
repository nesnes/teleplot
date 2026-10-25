// 15. A depth map: a picture of distances (16-bit numbers, here in millimeters), sent as they are (Raw: 8 bytes of header, then the
// numbers). The page shows it in colors, the distance under the pointer, and places it in 3D with the lens of its camera.
// A ToF sensor of 8 x 8 zones (VL53L5CX) gives such a picture; here one made up (136 bytes of RAM: an Uno has 2 KB).
#include <Teleplot.h>

Teleplot tp(Serial);
const int WIDTH = 8, HEIGHT = 8;
uint16_t picture[4 + WIDTH * HEIGHT];  // {width} {height} {format 0 = gray16, then 3 bytes at 0} then the numbers (little-endian)

void setup() {
  Serial.begin(115200);
  tp.telemetry("depth").depthMap(0.001).intrinsics(WIDTH, HEIGHT, 10, 10, WIDTH / 2.0, HEIGHT / 2.0);  // a pixel is worth 1 mm
  picture[0] = WIDTH;
  picture[1] = HEIGHT;
  picture[2] = 0;
  picture[3] = 0;
}

void loop() {
  float t = millis() / 1000.0;
  for (int y = 0; y < HEIGHT; y++) {
    for (int x = 0; x < WIDTH; x++) {
      picture[4 + y * WIDTH + x] = 1500 + 500 * sin(x * 0.8 + t) * cos(y * 0.8);  // 0 would be "no data"
    }
  }
  tp.telemetry("depth").image(Teleplot::Raw, picture, sizeof(picture));  // (AVR and ESP32 are little-endian)
  delay(200);
}
