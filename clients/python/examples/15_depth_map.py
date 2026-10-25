# 15. A depth map: a picture of distances (16-bit numbers, here in millimeters), sent as they are (Raw). The page shows it in colors,
# the distance under the pointer, and places it in 3D with the lens of its camera.
import array
import math
import time
from teleplot import Teleplot, TeleplotImage

tp = Teleplot.instance()
width, height = 80, 60
depth = tp.telemetry("depth")
depth.depthMap(0.001).intrinsics(width, height, 70, 70, width / 2, height / 2)  # a pixel is worth 1 mm; 0 is "no data"

t = 0.0
while True:
    millimeters = array.array("H", (int(1500 + 500 * math.sin(x * 0.1 + t) * math.cos(y * 0.1)) for y in range(height) for x in range(width)))
    TeleplotImage.send(depth, TeleplotImage.Pixels(millimeters.tobytes(), width, height, TeleplotImage.Gray16), TeleplotImage.Raw())
    t += 0.1
    time.sleep(0.1)
