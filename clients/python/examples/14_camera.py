# 14. A camera: its pictures, its lens (intrinsics, distortion) and where it is. The page draws the scene over its pictures as the
# lens sees it (a box in the scene), and drawings made in the pixels of the picture (a detection).
import math
import time
from teleplot import Teleplot, TeleplotImage

tp = Teleplot.instance()
width, height = 160, 120
camera = tp.telemetry("camera")
camera.intrinsics(width, height, 140, 140, width / 2, height / 2).distortion(-0.1, 0.01, 0, 0, 0)
camera.position(-2, 0, 0.5)  # looking along its x axis: toward the box
tp.telemetry("box").shape(Teleplot.Cube).size(0.5).position(0, 0, 0.25).color("orange")
detection = tp.telemetry("detection").pixelsOf("camera").shape(Teleplot.Rect).color("red")

i = 0
while True:
    gray = bytes((p % width + p // width + i) % 64 + 64 for p in range(width * height))
    TeleplotImage.send(camera, TeleplotImage.Pixels(gray, width, height, TeleplotImage.Gray8), TeleplotImage.Png())
    detection.position(80 + 30 * math.sin(i * 0.1), 60).size(40, 30)  # a box in pixels (u to the right, v down)
    i += 1
    time.sleep(0.1)
