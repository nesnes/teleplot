// 21. Where the time comes from (ESP32): by default times count from the boot and the page dates them when they arrive. With a clock that
// gives the date (NTP here, or an RTC), samples carry their own date: needed for a file read later (see 22_Recording).
#include <WiFi.h>
#include <sys/time.h>
#include <Teleplot.h>

Teleplot tp(Serial);

Teleplot::Time dateNow() {
  struct timeval now;
  gettimeofday(&now, nullptr);
  return Teleplot::us(now.tv_sec * 1e6 + now.tv_usec);  // since 1970
}

void setup() {
  Serial.begin(115200);
  WiFi.begin("my-network", "my-password");
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
  }
  configTime(0, 0, "pool.ntp.org");
  while (time(nullptr) < 1700000000) {  // wait for the date
    delay(200);
  }
  tp.clock(dateNow);
}

void loop() {
  tp.update("wave", sin(millis() / 1000.0));
  delay(50);
}
