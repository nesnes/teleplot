// 18. A joystick: a setting the page sends continuously while it is held (rate), and that goes back to rest by itself when
// nothing came for "hold" ms (a lost connection stops the robot). Switch CMD on in the page; the view is a joystick.
// axes: what it moves (here forward speed and turn, no sideways).
#include <Teleplot.h>

Teleplot tp(Serial);
Teleplot::Pose2D drive;  // x: forward speed, yaw: turn speed (y unused)

void setup() {
  Serial.begin(115200);
  tp.param("drive", &drive).axes(Teleplot::X | Teleplot::Yaw).range(-1, 1).rate(20).hold(300);
}

void loop() {
  tp.poll();                          // applies what came, and the rest value after 300 ms without anything
  tp.update("speed", drive.x);        // what a motor would get
  tp.update("turn", drive.yaw);
  delay(10);
}
