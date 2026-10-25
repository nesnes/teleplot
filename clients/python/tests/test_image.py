# TeleplotImage of the Python client: encodes the pixels of the C++ image test (clients/cpp/build/images/<format>.raw: the same input)
# into <folder>/py-*.png, and sends pictures on its thread into py-send.teleplot; image.test.js decodes them and compares them with
# the pixels the C++ test expects. Usage: python3 test_image.py <C++ images folder> <output folder>
import os
import sys
import time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from teleplot import Teleplot, TeleplotImage  # noqa: E402

source, out = sys.argv[1], sys.argv[2]
FORMATS = {"gray8": TeleplotImage.Gray8, "gray16": TeleplotImage.Gray16, "rgb8": TeleplotImage.RGB8, "bgr8": TeleplotImage.BGR8,
           "rgba8": TeleplotImage.RGBA8, "bgra8": TeleplotImage.BGRA8, "yuyv": TeleplotImage.YUYV}
for name, fmt in FORMATS.items():
    w, h = (38 if name == "yuyv" else 37), 23
    packed = open(os.path.join(source, name + ".raw"), "rb").read()
    line = len(packed) // h
    padded = b"".join(packed[y * line:(y + 1) * line] + b"\xee" * (200 - line) for y in range(h))
    for variant, pixels in (("", TeleplotImage.Pixels(packed, w, h, fmt)), ("-stride", TeleplotImage.Pixels(padded, w, h, fmt, 200))):
        picture = TeleplotImage.encode(pixels, TeleplotImage.Png())
        assert picture, picture.error
        open(os.path.join(out, "py-%s%s.png" % (name, variant)), "wb").write(picture.bytes)
    if name == "gray16":
        raw = TeleplotImage.encode(TeleplotImage.Pixels(packed, w, h, fmt), TeleplotImage.Raw())
        open(os.path.join(out, "py-gray16.rawpicture"), "wb").write(raw.bytes)

# send(): on its thread, dated when asked, the latest picture always sent
now = [1000000000]
with Teleplot(file=os.path.join(out, "py-send.teleplot"), flushInterval=0) as tp:
    tp.clock(lambda: Teleplot.ns(now[0]))
    for i in range(5):
        now[0] = 1000000000 + i * 1000000
        TeleplotImage.send(tp.telemetry("cam"), TeleplotImage.Pixels(bytes([i * 50]) * (64 * 48), 64, 48, TeleplotImage.Gray8), TeleplotImage.Png())
        time.sleep(0.02 if i < 2 else 0)
    for _ in range(400):
        s = TeleplotImage.stats(tp)
        if s.encoded + s.replaced >= 5:
            break
        time.sleep(0.005)
    print("     5 pictures sent on the thread: %d encoded, %d replaced" % (s.encoded, s.replaced))
print("python pictures written")
