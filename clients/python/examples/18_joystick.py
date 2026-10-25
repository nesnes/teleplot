# 18. A joystick: a setting the page sends continuously while it is held (rate), and that goes back to rest by itself when nothing
# came for "hold" ms (a lost connection stops the robot). Switch CMD on in the page; the view is a joystick.
# axes: what it moves (here forward speed and turn, no sideways).
import time
from teleplot import Teleplot

tp = Teleplot.instance()
drive = tp.param("drive", Teleplot.Pose2D(0, 0, 0)).axes(Teleplot.X | Teleplot.Yaw).range(-1, 1).rate(20).hold(300)

while True:
    tp.poll()  # applies what came, and the rest value after 300 ms without anything
    tp.update("speed", drive.value.x)
    tp.update("turn", drive.value.yaw)
    time.sleep(0.01)
