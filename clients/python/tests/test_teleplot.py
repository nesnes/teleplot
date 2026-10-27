# The Python client alone (no dependency): commands from the page in both protocols, through a real UDP socket as the Teleplot server
# would write them, refusals, bound settings, limits, threads, times. What it sends is checked by the library of the page in
# parity.test.js and image.test.js. Usage: python3 tests/test_teleplot.py
import datetime
import math
import os
import socket
import struct
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from teleplot import Teleplot, TeleplotImage, TeleplotError  # noqa: E402

failures = 0


def check(what, condition):
    global failures
    print(("ok   " if condition else "FAIL ") + what)
    if not condition:
        failures += 1


def fnv16(name):
    h = 2166136261
    for b in name.encode():
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return ((h >> 16) ^ (h & 0xFFFF)) & 0xFFFF


class Server:
    """A fake Teleplot server: receives what the client sends, writes back as the server would (to the address packets come from)"""

    def __init__(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.bind(("127.0.0.1", 0))
        self.socket.settimeout(0.2)
        self.port = self.socket.getsockname()[1]
        self.client = None
        self.received = []

    def drain(self):
        while True:
            try:
                data, self.client = self.socket.recvfrom(65536)
                self.received.append(data)
            except socket.timeout:
                return self.received

    def write(self, data):
        self.socket.sendto(data, self.client)

    def lines(self):
        return [l for d in self.received for l in d.decode(errors="replace").split("\n")]

    def answers(self, status=None):  # binary CALL_ANSWER sections of the packets received
        out = []
        for d in self.received:
            if len(d) > 9 and d[0] == 0x10 and d[4] == 42:
                telem, call, st = struct.unpack_from("<HHB", d, 5)
                text = d[10:d.index(b"\0", 10)].decode()
                if status is None or st == status:
                    out.append((telem, call, st, text))
        return out


def packet(*sections, client=7):
    return struct.pack("<BBH", 0x10, 1, client) + b"".join(sections) + b"\0\0"


def number_section(name, *values):
    kind = 20 + len(values) - 1
    return struct.pack("<BHQBI", kind, fnv16(name), 0, 1, 0) + struct.pack("<%df" % len(values), *values)


def text_section(name, text):
    return struct.pack("<BHQBI", 23, fnv16(name), 0, 1, 0) + text.encode() + b"\0"


def call_section(name, call_id, *args):
    return struct.pack("<BHHB", 41, fnv16(name), call_id, len(args)) + b"".join(args)


class Controller:
    ki = 0.25


# ------------------------------------------------------------------------------------------------ binary commands
server = Server()
tp = Teleplot(udp=("127.0.0.1", server.port), clientId=7, flushInterval=0)
kp = tp.param("kp", 0.4).range(0, 10).step(0.01)
motors = tp.param("motors", False)
count = tp.param("count", 3).onChange(lambda v: Teleplot.ok() if v % 2 else Teleplot.error("odd only"))
mode = tp.param("mode", "auto").enumValues(["auto", "manual#by hand"])
pose = tp.param("pose", Teleplot.Pose2D(1, 2, 0)).range(-5, 5)
controller = Controller()
tp.param("ki", controller, "ki").range(0, 1)
config = {"speed": 0.5}
tp.param("speed", config, "speed").range(0, 2)
runs = []


def goto(args):
    runs.append((args.xy("target"), args.number("speed", 0.3)))
    return Teleplot.ok("arrived")


tp.action("goto", goto).title("Go to").arg(Teleplot.Arg("target", Teleplot.Arg.XY)).arg(Teleplot.Arg("speed").optional())
later = []


@tp.action("scan")
def scan(args):
    later.append(args.call())
    return Teleplot.running()


tp.poll()
server.drain()
check("declarations and values are sent", len(server.received) > 0)
server.received.clear()
server.write(packet(number_section("kp", 12.3), number_section("motors", 1.0), number_section("count", 4.0), text_section("mode", "sport"),
                    number_section("pose", 30.0, 2.5, 7.0), number_section("ki", 0.75), number_section("speed", 5.0)))
time.sleep(0.05)
tp.poll()
server.drain()
check("a number is clamped to its range", kp.value == 10.0)
check("a bool is applied", motors.value is True)
check("onChange refuses before applying, said to the page", count.value == 3 and any(a[3] == "odd only" for a in server.answers(1)))
check("a text outside the choices is refused", mode.value == "auto" and any(a[3].startswith("one of") for a in server.answers(1)))
check("a pose2d: x, y clamped, yaw not", tuple(pose.value) == (5.0, 2.5, 7.0))
check("bound to an attribute: written there", controller.ki == 0.75)
check("bound to a key of a dict: written there", config["speed"] == 2.0)
controller.ki = 0.125
check("bound: .value reads the object", tp._params[fnv16("ki")].value == 0.125)

server.received.clear()
call = call_section("goto", 21, struct.pack("<Bdd", 0, 1.5, 2.0))
server.write(packet(call))
server.write(packet(call))
server.write(packet(call_section("goto", 22)))
server.write(packet(call_section("scan", 5)))
time.sleep(0.05)
tp.poll()
server.drain()
check("a call sent twice runs once", runs == [(Teleplot.Number2D(1.5, 2.0), 0.3)])
check("it is answered run, ok, then ok again", [a[2] for a in server.answers() if a[1] == 21] == [2, 0, 0])
check("a call without a required argument is refused", any(a[1] == 22 and a[2] == 1 and a[3] == "missing target" for a in server.answers()))
check("running(): only run is answered", [a[2] for a in server.answers() if a[1] == 5] == [2])
tp.answer(later[0], Teleplot.ok("done"))
server.drain()
check("answer() finishes it", any(a[1] == 5 and a[2] == 0 and a[3] == "done" for a in server.answers()))
tp.close()

# ------------------------------------------------------------------------------------------------ text commands
server = Server()
tt = Teleplot(udp=("127.0.0.1", server.port), protocol=Teleplot.TEXT_PROTOCOL, flushInterval=0)
gain = tt.param("gain", 0.5).range(0, 1).step(0.1)
words = tt.param("words", "hi")
heard = []
tt.action("say", lambda args: heard.append(args.text("what")) or Teleplot.ok(args.text("what"))).arg(Teleplot.Arg("what", Teleplot.Arg.Text))
tt.poll()
server.drain()
lines = server.lines()
check("text: declarations", "ATTR|gain|write=number|min=0|max=1|step=0.1" in lines and "ATTR|say|arg=what|type=text" in lines)
server.received.clear()
for line in ["gain:0.73", "words:a%3Ab", "!say#3:what=x%3Ay", "!say#3:what=x%3Ay", "!nope#4"]:
    server.write(line.encode())
time.sleep(0.05)
tt.poll()
server.drain()
lines = server.lines()
check("text: a setting clamped and rounded to its step", abs(gain.value - 0.7) < 1e-9)
check("text: a text setting unescaped", words.value == "a:b")
check("text: a call runs once, answered run, ok, ok", heard == ["x:y"] and lines.count("ACK|say#3:ok:x:y") == 2 and lines.count("ACK|say#3:run") == 1)
check("text: an unknown action", "ACK|nope#4:err:unknown action" in lines)
tt.close()

# ------------------------------------------------------------------------------------------------ the rest
out = []
tp = Teleplot(output=out.append, flushInterval=0)
try:
    tp.telemetry("a").position(1, 2).at(Teleplot.ms(1))
    check("at() in the middle of a chain raises", False)
except TeleplotError as e:
    check("at() in the middle of a chain raises, saying why", "first call of a chain" in str(e))
try:
    Teleplot(nope=1)
    check("an unknown option raises", False)
except TeleplotError:
    check("an unknown option raises", True)
tp.update("long", "x" * 5000)
tp.telemetry("verbose").desc("d" * 5000).update(1)
tp.flush()
check("too big: cut and counted, sent in a few packets", tp.stats().tooBig >= 1 and len(out) < 6)

small = []
s = Teleplot(output=small.append, flushInterval=0, maxQueuedBytes=4000)
for i in range(2000):
    s.update("v", i)
check("beyond maxQueuedBytes, the oldest samples are dropped and counted", s.stats().dropped > 1000)
s.flush()
check("what is left is sent", 1 <= len(small) < 10)

threaded = []
t = Teleplot(output=threaded.append, sendFrom=Teleplot.Thread, flushInterval=Teleplot.ms(2))
t.update("v", 1)
for _ in range(200):
    if threaded:
        break
    time.sleep(0.005)
check("sendFrom=Thread: sent without flush()", len(threaded) >= 1)
t.close()

lines = []
st = Teleplot(protocol=Teleplot.TEXT_PROTOCOL, output=lambda d: lines.append(d.decode()), flushInterval=0)
st.clock(lambda: 1000.5)
with Teleplot.Stack(st, "task", "main"):
    pass


def worker():
    Teleplot.threadName("worker")
    with Teleplot.Stack(st, "task", "work"):
        pass


th = threading.Thread(target=worker)
th.start()
th.join()
st.telemetry("solo").oneThread()
th = threading.Thread(target=lambda: Teleplot.Stack(st, "solo", "a").__enter__())
th.start()
th.join()
with Teleplot.Stack(st, "solo", "b"):
    pass
st.flush()
text = "".join(lines)
check("stacks: the main thread keeps the name, a worker its own telemetry with the label", "task,task:1000500.000:main|stack" in text and "task.worker,task:1000500.000:work|stack" in text)
check("oneThread(): another thread is counted and dropped", st.stats().wrongThread == 1)

lines.clear()
st.clock(lambda: Teleplot.ms(2000))
st.log("plain")
st.log("events", "a")
st.log("events", "b", datetime.datetime(2001, 2, 3, tzinfo=datetime.timezone.utc))
st.log("c", 12.25)
st.flush()
text = "".join(lines)
check("log(): text, name and text, a datetime, a time in seconds", "log:2000.000:plain|log" in text and "events:2000.000:a|log" in text
      and "events:981158400000.000:b|log" in text and "log:12250.000:c|log" in text)

lines.clear()
st.sendStats(Teleplot.ms(1))
time.sleep(0.01)
st.update("x", 1)
st.flush()
text = "".join(lines)
check("sendStats(): rates and totals as telemetries, with their labels", "teleplot.samples,teleplot sent:" in text and "teleplot.tooBig,teleplot problems:" in text)
st.sendStats(0)
st.disable()
lines.clear()
st.update("x", 2)
st.flush()
check("disable(): nothing", lines == [])
st.close()

check("Teleplot.instance(): one, named after the program", Teleplot.instance() is Teleplot.instance() and Teleplot.instance().options()["name"] == "test_teleplot")
check("times: ms, us, ns, now", Teleplot.ms(1.5).ns == 1500000 and Teleplot.us(2).ns == 2000 and abs(Teleplot.now().ns - time.time_ns()) < 1e9)
check("Teleplot.deg", abs(Teleplot.deg(180) - math.pi) < 1e-12)

# Pictures without NumPy / Pillow: what needs them says so
picture = TeleplotImage.encode(TeleplotImage.Pixels(bytes(12), 2, 2, TeleplotImage.RGB8))
try:
    import PIL  # noqa: F401
    has_jpeg = True
except ImportError:
    try:
        import cv2  # noqa: F401
        has_jpeg = True
    except ImportError:
        has_jpeg = False
check("JPEG: encoded with Pillow / OpenCV, or refused saying it needs one", bool(picture) if has_jpeg else (not picture and "Pillow" in picture.error))
check("Gray16 in a JPEG: refused, with why", "Png() or Raw()" in TeleplotImage.encode(TeleplotImage.Pixels(bytes(8), 2, 2, TeleplotImage.Gray16)).error)
check("typeOf: PNG, JPEG, other", TeleplotImage.typeOf(b"\x89PNG\r\n\x1a\n") == Teleplot.Png and TeleplotImage.typeOf(b"\xff\xd8\xff\xe0") == Teleplot.Jpeg and TeleplotImage.typeOf(b"GIF89a") is None)

# With NumPy: arrays as pixels, shrink, and the same pixels as without it
try:
    import numpy as np
except ImportError:
    np = None
if np is None:
    print("     (NumPy not installed: its checks are skipped)")
else:
    import teleplot as module
    gray = np.array([[0, 2, 10, 20], [4, 6, 30, 40], [99, 99, 99, 99]], np.uint8)
    small = TeleplotImage.shrink(TeleplotImage.Pixels(gray), 2)
    check("shrink: 4x3 by 2 is 2x1, averages (rounded), as the C++ client", (small.width, small.height) == (2, 1) and bytes(small.data) == bytes([3, 25]))
    depth = np.array([[1000, 3000], [5000, 7001]], np.uint16)
    d = TeleplotImage.shrink(TeleplotImage.Pixels(depth), 2)
    check("shrink: Gray16 stays 16 bits", d.format == TeleplotImage.Gray16 and np.frombuffer(d.data, np.uint16)[0] == 4000)
    check("a NumPy array gives its size and format", TeleplotImage.Pixels(np.zeros((3, 5, 3), np.uint8)).width == 5 and TeleplotImage.Pixels(np.zeros((3, 5), np.float32)).format == TeleplotImage.Float32)
    yuyv = TeleplotImage.Pixels(bytes((i * 37) % 256 for i in range(16 * 4 * 2)), 16, 4, TeleplotImage.YUYV)
    with_numpy = TeleplotImage._rgb(yuyv, TeleplotImage._rows(yuyv))
    module._np, saved = None, module._np
    without = TeleplotImage._rgb(yuyv, TeleplotImage._rows(yuyv))
    module._np = saved
    check("YUYV: the same RGB with and without NumPy", with_numpy == without)
    view = np.arange(10 * 8 * 3, dtype=np.uint8).reshape(10, 8, 3)[2:8, 1:6]  # a part of a bigger array: not contiguous
    png = TeleplotImage.encode(TeleplotImage.Pixels(view), TeleplotImage.Png())
    check("a part of an array (not contiguous) is encoded", bool(png))

# ------------------------------------------------------------------------------------------------ pixel values
sent = []
tq = Teleplot(output=sent.append, flushInterval=0)
tq.telemetry("depth").depthMap(0.001)
tq.telemetry("heat").pixelValues(0.5, math.nan)
tq.close()
sent = b"".join(sent)
check("binary: a depth map is flagged 0, other values 1 (as in C++)",
      bytes([16]) + struct.pack("<ddB", 0.001, 0, 0) in sent and bytes([16]) + struct.pack("<ddB", 0.5, math.nan, 1) in sent)

print("%d failed" % failures if failures else "python client ok")
sys.exit(1 if failures else 0)
