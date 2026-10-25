# 13. A picture: pixels (a camera, OpenCV or ROS give them the same way) encoded on a thread of Teleplot, then sent.
# PNG works with nothing installed; TeleplotImage.Jpeg() (the default) needs Pillow or OpenCV. A NumPy array is taken as it is.
import time
from teleplot import Teleplot, TeleplotImage

tp = Teleplot.instance()
width, height = 160, 120

shift = 0
while True:
    pixels = bytes(v for y in range(height) for x in range(width) for v in ((x + shift) * 2 % 256, y * 2 % 256, 128))
    TeleplotImage.send(tp.telemetry("camera"), TeleplotImage.Pixels(pixels, width, height, TeleplotImage.RGB8), TeleplotImage.Png())
    shift += 4
    time.sleep(0.1)  # send() returns at once: it only copies the pixels
