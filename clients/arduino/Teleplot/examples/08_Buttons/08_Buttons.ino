// 8. A button in the page: an action, with an argument. Switch CMD on in the page, then press "Blink".
// The function runs in poll(); what it returns is shown in the page.
#include <Teleplot.h>

Teleplot tp(Serial);

Teleplot::Result blink(Teleplot::Args const& args) {
  int times = args.number("times", 3);
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(150);
    digitalWrite(LED_BUILTIN, LOW);
    delay(150);
  }
  return Teleplot::ok("done");
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  tp.action("blink", blink)
    .title("Blink")
    .arg(Teleplot::Arg("times").optional().defaultValue(3).range(1, 10));
}

void loop() {
  tp.poll();
  delay(10);
}
