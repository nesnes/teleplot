# 33. NumPy arrays as pixels (needs NumPy): an array gives its width, height and format; a part of it (a view) is taken as it is;
# shrink() makes it smaller. OpenCV gives BGR: say it.
import sys
import time
try:
    import numpy as np
except ImportError:
    sys.exit("this example needs NumPy")
from teleplot import Teleplot, TeleplotImage

tp = Teleplot.instance()
y, x = np.mgrid[0:240, 0:320]

i = 0
while True:
    frame = np.dstack([(x + i) % 256, y % 256, np.full_like(x, 200)]).astype(np.uint8)  # 240 x 320 x 3, as OpenCV would give BGR
    TeleplotImage.send(tp.telemetry("frame"), TeleplotImage.Pixels(frame, format=TeleplotImage.BGR8), TeleplotImage.Png())
    TeleplotImage.send(tp.telemetry("corner"), TeleplotImage.Pixels(frame[40:120, 40:140], format=TeleplotImage.BGR8), TeleplotImage.Png())
    TeleplotImage.send(tp.telemetry("small"), TeleplotImage.shrink(TeleplotImage.Pixels(frame, format=TeleplotImage.BGR8), 4), TeleplotImage.Png())
    i += 8
    time.sleep(0.1)
