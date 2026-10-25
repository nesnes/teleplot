# 14. A picture: pixels made here (a camera, OpenCV or ROS give them the same way) encoded on a thread, then sent.
# PNG works without anything installed; TeleplotImage.Jpeg() needs Pillow or OpenCV. A NumPy array is taken as it is.
import time
from teleplot import Teleplot, TeleplotImage

tp = Teleplot.instance()
width, height = 64, 48

while True:
    shift = int(time.time() * 20)
    pixels = bytes(v for y in range(height) for x in range(width) for v in ((x + shift) * 4 % 256, y * 5, 128))
    TeleplotImage.send(tp.telemetry("camera"), TeleplotImage.Pixels(pixels, width, height, TeleplotImage.RGB8), TeleplotImage.Png())
    time.sleep(0.1)  # the call returns at once: it only copies the pixels
