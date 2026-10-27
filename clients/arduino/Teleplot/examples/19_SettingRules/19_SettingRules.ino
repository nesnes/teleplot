// 19. Rules of a setting: a text among choices (its enum), and a check before applying (onChange): the page shows why it was refused.
// The board only applies what it accepts, then sends back what it applied.
#include <Teleplot.h>

Teleplot tp(Serial);
char mode[12] = "manual";                                    // a text setting: a char array
const char* const MODES[] = { "manual", "auto#follows the line", "off" };  // a list: a static array (kept as a pointer); #: a caption
int target = 10;

// Called before applying: return Teleplot::error("why") to refuse (a plain function, or a lambda without capture)
Teleplot::Result checkTarget(int const& value) {
  if (strcmp(mode, "off") == 0) {
    return Teleplot::error("mode is off");
  }
  if (value % 5 != 0) {
    return Teleplot::error("by 5");
  }
  return Teleplot::ok();
}

void setup() {
  Serial.begin(115200);
  tp.param("mode", &mode).enumValues(MODES);
  tp.param("target", &target).range(0, 100).onChange(checkTarget);
}

void loop() {
  tp.poll();
  delay(10);
}
