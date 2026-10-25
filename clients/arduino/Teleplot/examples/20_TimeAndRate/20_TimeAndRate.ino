// 20. Times and rates. A sample is dated when it is sent; at() gives the time it was measured instead (a sensor read earlier).
// maxRate() keeps at most that many samples per second of a fast value: the rest are not sent (the loop needs not slow down).
#include <Teleplot.h>

Teleplot tp(Serial);

void setup() {
  Serial.begin(115200);
  tp.telemetry("fast").maxRate(20);
}

void loop() {
  Teleplot::Time measuredAt = Teleplot::now();  // the clock samples are dated with (since boot)
  float reading = analogRead(A0);                // measured now...
  delay(30);                                     // ...sent later
  tp.telemetry("reading").at(measuredAt).update(reading);

  for (int i = 0; i < 100; i++) {
    tp.update("fast", sin(micros() / 100000.0));  // called 100 times, sent at most 20 times per second
    delayMicroseconds(200);
  }
}
