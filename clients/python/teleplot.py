"""
Teleplot client for Python: telemetry, pictures, and the settings and actions the page can use. One file, Python 3.9+, standard
library only (NumPy, Pillow or OpenCV are used for pictures when they are installed). The API of the C++ client, with its names:
doc/python-client-api.md. Source: https://github.com/nesnes/teleplot

    from teleplot import Teleplot
    tp = Teleplot.instance()                                   # 127.0.0.1:47269, sent every 20 ms
    tp.telemetry("battery").unit("V").range(10.5, 12.6)        # described once
    tp.update("battery", 12.4)
    tp.telemetry("robot").shape(Teleplot.Cube).size(0.4, 0.3, 0.2)
    tp.telemetry("robot").position(x, y).yaw(theta)            # one chain, one time

Protocols: binary (doc/binaryProtocol.md, the default) or text (doc/textProtocol.md, Teleplot.TEXT_PROTOCOL).
"""
import atexit
import base64
import collections
import datetime
import io
import math
import numbers
import os
import re
import socket
import struct
import sys
import threading
import time
import zlib

__all__ = ["Teleplot", "TeleplotImage", "TeleplotError"]


class TeleplotError(Exception):
    """A misuse of the API (what the C++ client refuses to compile)"""


# --------------------------------------------------------------------------------------------------------------- protocol
_MARKER, _VERSION = 0x10, 1
_PACKET_SIZE = 1432
_MAX_TEXT = 1380
_MAX_ATTR_TEXT = 900
_MAX_NAME = 300
_PART_BYTES = 1380
_CALL_ID_SETTING = 0xFFFF
_FILE_MAGIC = bytes([0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00])

(A_NAME, A_UNIT, A_COLOR, A_AUTOPLOT, A_TIMEOUT, A_SHAPE, A_LABEL, A_LOG, A_FRAME, A_RANGE, A_STACK, A_WRITE, A_CHOICES, A_ARGS,
 A_DESC, A_TITLE, A_PIXELS) = range(17)
S_CLIENT_NAME, S_DASHBOARD, S_ATTR = 1, 2, 10
(S_NUMBER, S_NUMBER_2D, S_NUMBER_3D, S_TEXT, S_IMAGE, S_POSITION, S_ROTATION, S_QUATERNION, S_COLOR_STR, S_COLOR_RGB, S_OPACITY,
 S_SIZE, S_TEXTURE, S_INTRINSICS, S_DISTORTION, S_CLOUD, S_FLOAT64, S_VECTOR, S_SHAPE_TEXT, S_LINE_WIDTH, S_THRESHOLD, S_CALL,
 S_CALL_ANSWER) = range(20, 43)
# Samples usually sent once: sent again with the descriptions (a page opened later gets them). Streams are not.
_LATCHED = set(range(S_POSITION, S_DISTORTION + 1)) | {S_VECTOR, S_SHAPE_TEXT, S_LINE_WIDTH, S_THRESHOLD}
_NUMERIC = {S_NUMBER, S_NUMBER_2D, S_NUMBER_3D, S_POSITION, S_ROTATION, S_QUATERNION, S_COLOR_RGB, S_OPACITY, S_SIZE, S_INTRINSICS,
            S_DISTORTION, S_VECTOR, S_LINE_WIDTH}
_SHAPE_NAMES = {0: "cube", 1: "sphere", 2: "cylinder", 3: "rect", 4: "circle", 5: "line", 6: "polygon", 7: "arrow", 8: "text", 10: "stl"}
_WRITE_TYPES = ["", "number", "bool", "text", "xy", "xyz", "pose2d"]


def _fnv16(text):
    h = 2166136261
    for b in text.encode():
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return ((h >> 16) ^ (h & 0xFFFF)) & 0xFFFF


def _cstr(text):
    return str(text).encode().split(b"\0")[0] + b"\0"


def _escape(text, special):
    return "".join("%%%02X" % ord(c) if c in special else c for c in str(text))


def _unescape(text):
    """"%3A" -> ":" (what the page escapes in what it writes)"""
    return re.sub(r"%([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), text)


def _number_text(v, precise=False):
    """A number for the text protocol: 9 significant digits (any float32 exactly), 17 when precise"""
    v = float(v)
    if math.isnan(v):
        return "nan"
    if math.isinf(v):
        return "inf" if v > 0 else "-inf"
    text = repr(v) if precise else format(v, ".9g")
    if text.endswith(".0"):
        text = text[:-2]
    return text.replace("e+", "e")


def _time_text(ns):
    ns = max(0, int(ns))
    return "%d.%03d" % (ns // 1000000, (ns // 1000) % 1000)


def _steady_ms():
    return time.monotonic_ns() // 1000000


# --------------------------------------------------------------------------------------------------------------- the client
class Teleplot:
    """A Teleplot client. Options (keyword arguments): see doc/python-client-api.md "Options"."""

    # ---------------------------------------------------------------- types
    Number2D = collections.namedtuple("Number2D", "x y")
    Number3D = collections.namedtuple("Number3D", "x y z")
    Pose2D = collections.namedtuple("Pose2D", "x y yaw")
    Rgb = collections.namedtuple("Rgb", "r g b")
    Stats = collections.namedtuple("Stats", "packets bytes samples dropped tooBig sendErrors wrongThread priorityRefused")

    class Time:
        """A time: nanoseconds (since 1970, or since what the clock counts from)"""
        __slots__ = ("ns",)

        def __init__(self, ns=0):
            self.ns = int(ns)

        def __eq__(self, other):
            return isinstance(other, Teleplot.Time) and other.ns == self.ns

        def __hash__(self):
            return hash(self.ns)

        def __repr__(self):
            return "Teleplot.Time(%d)" % self.ns

    class Result:
        """What a handler or onChange answers"""
        __slots__ = ("status", "text")

        def __init__(self, status=0, text=""):
            self.status, self.text = status, "" if text is None else str(text)

        def __repr__(self):
            return "Teleplot.Result(%s, %r)" % (["ok", "error", "running"][self.status], self.text)

    Call = collections.namedtuple("Call", "action id telemetry")

    # ---------------------------------------------------------------- constants (as in C++)
    Below, Above = 0, 1
    Cube, Sphere, Cylinder, Rect, Circle, Line, Polygon, Arrow, Text, Stl = 0, 1, 2, 3, 4, 5, 6, 7, 8, 10
    Jpeg, Png, Raw = 0, 1, 2
    X, Y, Yaw = 1, 2, 4
    Caller, Thread = 0, 1
    BelowCaller, Normal, Low, Realtime, PriorityValue = 0, 1, 2, 3, 4
    BINARY_PROTOCOL, TEXT_PROTOCOL = "binary", "text"

    class ThreadPriority:
        """The priority of the threads of Teleplot: BelowCaller (default), Normal, Low, realtime(p), value(v)"""

        def __init__(self, kind=0, number=0, roundRobin=False):
            self.kind, self.number, self.roundRobin = kind, number, roundRobin

        @staticmethod
        def belowCaller():
            return Teleplot.ThreadPriority(Teleplot.BelowCaller)

        @staticmethod
        def normal():
            return Teleplot.ThreadPriority(Teleplot.Normal)

        @staticmethod
        def low():
            return Teleplot.ThreadPriority(Teleplot.Low)

        @staticmethod
        def realtime(priority, roundRobin=False):
            return Teleplot.ThreadPriority(Teleplot.Realtime, priority, roundRobin)

        @staticmethod
        def value(number):
            return Teleplot.ThreadPriority(Teleplot.PriorityValue, number)

        def __eq__(self, other):
            other = Teleplot.ThreadPriority._of(other)
            return (self.kind, self.number, self.roundRobin) == (other.kind, other.number, other.roundRobin)

        @staticmethod
        def _of(v):
            return v if isinstance(v, Teleplot.ThreadPriority) else Teleplot.ThreadPriority(int(v))

    class ThreadAffinity:
        """The CPUs of the threads of Teleplot: automatic() (default), followCaller(), any(), cpus([2, 3])"""
        Automatic, FollowCaller, Any, Cpus = 0, 1, 2, 3

        def __init__(self, kind=0, cpus=()):
            self.kind, self.list = kind, list(cpus)

        @staticmethod
        def automatic():
            return Teleplot.ThreadAffinity(0)

        @staticmethod
        def followCaller():
            return Teleplot.ThreadAffinity(1)

        @staticmethod
        def any():
            return Teleplot.ThreadAffinity(2)

        @staticmethod
        def cpus(cpus):
            return Teleplot.ThreadAffinity(3, cpus)

        def __eq__(self, other):
            return isinstance(other, Teleplot.ThreadAffinity) and (self.kind, self.list) == (other.kind, other.list)

    # ---------------------------------------------------------------- static functions (as in C++)
    @staticmethod
    def ns(v):
        return Teleplot.Time(int(v))

    @staticmethod
    def us(v):
        return Teleplot.Time(round(v * 1000))

    @staticmethod
    def ms(v):
        return Teleplot.Time(round(v * 1000000))

    @staticmethod
    def now():
        return Teleplot.Time(time.time_ns())

    @staticmethod
    def deg(degrees):
        return degrees * math.pi / 180.0

    @staticmethod
    def ok(text=""):
        return Teleplot.Result(0, text)

    @staticmethod
    def error(why):
        return Teleplot.Result(1, why)

    @staticmethod
    def running():
        return Teleplot.Result(2, "")

    @staticmethod
    def threadName(name):
        """The name of the calling thread, for the telemetries of its stacks ("robot.task.control")"""
        threading.current_thread().name = str(name)
        _thread_names.name = str(name)

    _instance = None
    _instance_lock = threading.Lock()

    @staticmethod
    def instance():
        """The default client: 127.0.0.1:47269, sent at the end of the program too"""
        with Teleplot._instance_lock:
            if Teleplot._instance is None:
                Teleplot._instance = Teleplot()
                atexit.register(Teleplot._instance.close)
            return Teleplot._instance

    # ---------------------------------------------------------------- client
    _DEFAULTS = dict(udp=None, file=None, output=None, protocol="binary", name="", clientId=0, flushInterval=0.02, sendFrom=0,
                     describeInterval=5.0, publishInterval=0.2, maxQueuedBytes=1 << 20, nonBlocking=False, threadPriority=0,
                     threadAffinity=None)

    def __init__(self, **options):
        self._lock = threading.Lock()          # the queues (never held while user code runs or while sending)
        self._send_lock = threading.Lock()     # the outputs
        self._thread_lock = threading.Lock()   # thread settings
        self._entries, self._by_name, self._by_id = [], {}, {}
        self._params, self._actions = {}, {}
        self._dashboards = collections.deque()
        self._queued = 0
        self._rr = 0
        self._name_sent_ms = -10 ** 12
        self._published_ms = -10 ** 12
        self._described_ms = -10 ** 12
        self._last_flush_ms = 0
        self._clock = None
        self._enabled = os.environ.get("TELEPLOT_DISABLE", "") in ("", "0")
        self._stats = dict(packets=0, bytes=0, samples=0, dropped=0, tooBig=0, sendErrors=0, wrongThread=0, priorityRefused=0)
        self._stats_every, self._stats_at, self._stats_before = 0.0, 0, None
        self._sockets, self._files, self._functions = [], [], []
        self._thread, self._thread_stop, self._thread_wake = None, False, threading.Condition(self._thread_lock)
        self._thread_generation, self._reference = 0, None
        self._extensions = {}
        self._closed = False
        self._options = {}
        self.setOptions(**options)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def setOptions(self, **options):
        unknown = set(options) - set(Teleplot._DEFAULTS)
        if unknown:
            raise TeleplotError("unknown option(s): %s" % ", ".join(sorted(unknown)))
        self._stop_thread()
        with self._send_lock, self._lock:
            self._close_outputs()
            o = dict(Teleplot._DEFAULTS)
            o.update(options)
            o["flushInterval"] = _seconds(o["flushInterval"])
            o["describeInterval"] = _seconds(o["describeInterval"])
            o["publishInterval"] = _seconds(o["publishInterval"])
            if o["protocol"] not in (Teleplot.BINARY_PROTOCOL, Teleplot.TEXT_PROTOCOL):
                raise TeleplotError("protocol: Teleplot.BINARY_PROTOCOL or Teleplot.TEXT_PROTOCOL")
            if not o["name"]:
                program = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] not in ("", "-c") else ""
                o["name"] = os.path.splitext(program)[0] or "python"
            self._options = o
            self._text = o["protocol"] == Teleplot.TEXT_PROTOCOL
            self._client_id = o["clientId"] or _fnv16(o["name"])
            if self._client_id == 0xFFFF:
                self._client_id = 0xFFFE
            self._open_outputs()
            self._name_sent_ms = -10 ** 12
        with self._thread_lock:
            self._priority = Teleplot.ThreadPriority._of(o["threadPriority"])
            self._affinity = o["threadAffinity"] or Teleplot.ThreadAffinity.automatic()
            self._reference = _Scheduling.ofCurrentThread()
            self._thread_generation += 1
        if o["sendFrom"] == Teleplot.Thread:
            self._start_thread()

    def options(self):
        return dict(self._options)

    def close(self):
        """Sends what is queued, stops the threads, closes the outputs (also at the end of a with block)"""
        if self._closed:
            return
        extensions, self._extensions = self._extensions, {}
        for extension in extensions.values():
            extension.close()
        self._stop_thread()
        self.flush()
        with self._send_lock:
            self._close_outputs()
        self._closed = True

    def enable(self):
        self._enabled = True

    def disable(self):
        self._enabled = False

    def clock(self, fn):
        """Where "now" comes from (default: time.time_ns()): fn gives a Teleplot.Time, seconds since 1970 or a datetime"""
        self._clock = fn

    def currentTime(self):
        return Teleplot.Time(self._now_ns())

    def threadPriority(self, priority=None):
        if priority is None:
            with self._thread_lock:
                return self._priority
        with self._thread_lock:
            self._priority = Teleplot.ThreadPriority._of(priority)
            self._reference = _Scheduling.ofCurrentThread()
            self._thread_generation += 1
            self._thread_wake.notify_all()

    def threadAffinity(self, affinity=None):
        if affinity is None:
            with self._thread_lock:
                return self._affinity
        with self._thread_lock:
            self._affinity = affinity
            self._reference = _Scheduling.ofCurrentThread()
            self._thread_generation += 1
            self._thread_wake.notify_all()

    def telemetry(self, name):
        with self._lock:
            return Telemetry(self, self._find(name))

    def update(self, name, value, time=None):
        if self._enabled:
            self.telemetry(name)._chain(time).update(value)

    def log(self, *args):
        """log(text), log(name, text), log(name, text, time), log(text, time)"""
        if len(args) == 1 or (len(args) == 2 and not isinstance(args[1], str)):
            name, text, when = "log", args[0], args[1] if len(args) == 2 else None
        else:
            name, text, when = args[0], args[1], args[2] if len(args) > 2 else None
        if not self._enabled:
            return
        t = self.telemetry(name)
        with self._lock:
            entry = self._entries[t._index]
            if not entry.log:
                self._attr(entry, A_LOG, True)
        t._chain(when).update(str(text))

    def stack(self, name, path, time=None):
        """What runs, as a whole path ("loop/plan/search"; "" = nothing)"""
        index = self._stack_entry(name)
        if index is None:
            return
        with self._lock:
            self._entries[index].stack_path = str(path)
        Telemetry(self, index)._chain(time).update(str(path))

    def dashboard(self, lines):
        """Dashboard lines of the text protocol (DASH|Robot/Motion:chart:speed|w=2), several separated by line feeds"""
        if not self._enabled:
            return
        with self._lock:
            for line in str(lines).split("\n"):
                if not line:
                    continue
                if len(line.encode()) > _MAX_TEXT:
                    self._stats["tooBig"] += 1
                elif self._text:
                    self._line(line)
                else:
                    self._dashboards.append(line)
        self._after_sample(False)

    def param(self, name, initial, attribute=None):
        """A setting the page may write: param(name, initial) (its .value), or param(name, object, attribute) (bound)"""
        p = Param(self, name, initial, attribute)
        with self._lock:
            p._index = self._find(name)
            self._params[self._entries[p._index].id] = p
        p._declare()
        p._publish()
        return p

    def action(self, name, handler=None):
        """An action the page may call: handler(args) returns Teleplot.ok() / error("why") / running() / None. Without a handler,
        the Action is a decorator."""
        a = Action(self, name, handler)
        with self._lock:
            a._index = self._find(name)
            self._actions[self._entries[a._index].id] = a
        a._declare()
        return a

    def answer(self, call, result):
        """Finishes a call whose handler returned running()"""
        action = self._actions.get(call.telemetry)
        if action is not None:
            action._recent = [(i, result if i == call.id else r) for i, r in action._recent]
        self._answer(call.telemetry, call.action, call.id, result.status, result.text)

    def poll(self):
        """Reads what the page wrote (settings, calls), applies it, answers, publishes the settings, sends"""
        if not self._enabled:
            return
        received = []
        with self._send_lock:
            for s, _ in self._sockets:
                while True:
                    try:
                        received.append(s.recv(65536))
                    except (BlockingIOError, InterruptedError):
                        break
                    except OSError:
                        break
        for data in received:
            if data[:1] == bytes([_MARKER]):
                self.handlePacket(data)
            else:
                for line in data.decode(errors="replace").split("\n"):
                    self.handleLine(line)
        now = _steady_ms()
        publish_all = now - self._published_ms >= self._options["publishInterval"] * 1000
        for p in list(self._params.values()):
            if p._hold and p._written_ms and now - p._written_ms > p._hold:  # nobody drives it any more: back to rest
                p._rest()
                p._written_ms = 0
                p._publish()
            elif publish_all:
                p._publish()
        if publish_all:
            self._published_ms = now
        self.flush()

    def handlePacket(self, data):
        """A packet of the binary protocol written by the page (poll() reads them; public for other transports)"""
        if not self._enabled:
            return
        r = _Reader(bytes(data)[:-2] if len(data) >= 2 else b"")
        if r.u8() != _MARKER or r.u8() != _VERSION:
            return
        r.u16()
        while r.ok and r.at < len(r.data):
            section = r.u8()
            if section == S_CALL:
                if not self._binary_call(r):
                    return
                continue
            if section < S_NUMBER or section > S_TEXT:
                return
            telem_id, _, count = r.u16(), r.u64(), r.u8()
            numbers_, text = [], ""
            for _ in range(count):
                r.u32()
                if section == S_TEXT:
                    text = r.str()
                else:
                    numbers_ = [r.f32() for _ in range(section - S_NUMBER + 1)]
            if not r.ok or count == 0:
                return
            p = self._params.get(telem_id)
            if p is not None:
                p._written(numbers_, text, telem_id)

    def handleLine(self, line):
        """A line written by the page: "name:value" for a setting, "!name#id:arg=value" for a call"""
        if not self._enabled:
            return
        line = line.strip("\r\n ")
        if not line:
            return
        if line.startswith("!"):
            return self._text_call(line[1:])
        name, colon, value = line.partition(":")
        if not colon:
            return
        for p in list(self._params.values()):
            if p._name == name:
                parts = value.split(":")
                numbers_ = []
                try:
                    numbers_ = [float(v) for v in parts] if p._type != 3 else []
                except ValueError:
                    numbers_ = []
                return p._written(numbers_, _unescape(value), self._entries[p._index].id)

    def flush(self):
        """Sends what is queued now"""
        self._flush(False)

    def stats(self):
        with self._lock:
            return Teleplot.Stats(**self._stats)

    def sendStats(self, every):
        """The stats as telemetries every "every" (Teleplot.ms(1000); 0: no more, the default)"""
        with self._lock:
            self._stats_every = _seconds(every)
            self._stats_at = _steady_ms()
            self._stats_before = dict(self._stats)

    def statsInterval(self):
        return Teleplot.ms(self._stats_every * 1000)

    # ---------------------------------------------------------------- inside
    def _now_ns(self):
        if self._clock is not None:
            return _ns(self._clock())
        return time.time_ns()

    def _find(self, name):  # (lock held)
        name = str(name)[:_MAX_NAME]
        index = self._by_name.get(name)
        if index is not None:
            return index
        entry = _Entry(name)
        telem_id = _fnv16(name)
        while telem_id in self._by_id:  # (two names with the same id: the second takes the next free one)
            telem_id = (telem_id + 1) & 0xFFFF
        entry.id = telem_id
        self._entries.append(entry)
        index = len(self._entries) - 1
        self._by_name[name] = index
        self._by_id[telem_id] = index
        return index

    def _attr(self, entry, code, value):  # (lock held) a description: kept, sent before the next samples and again every 5 s
        if entry.attrs.get(code) == value:
            return
        entry.attrs[code] = value
        entry.dirty = True
        if code == A_LOG:
            entry.log = bool(value)
        if code == A_STACK:
            entry.stack = bool(value)

    def _lock_for(self, entry):
        non_blocking = entry.non_blocking if entry.non_blocking is not None else self._options["nonBlocking"]
        if non_blocking:
            if not self._lock.acquire(blocking=False):
                self._stats["dropped"] += 1
                return False
            return True
        self._lock.acquire()
        return True

    def _after_sample(self, non_blocking):
        if self._options["sendFrom"] != Teleplot.Caller or self._options["flushInterval"] <= 0:
            return
        if _steady_ms() - self._last_flush_ms < self._options["flushInterval"] * 1000 and self._queued < _PACKET_SIZE:
            return
        self._flush(non_blocking)

    # A sample (kind: a section type; values: what it holds) of an entry, at ns
    def _sample(self, index, kind, ns, values, latch_key=None):
        if not self._enabled:
            return
        entry = self._entries[index]
        if not self._lock_for(entry):
            return
        try:
            if kind >= S_POSITION and kind not in (S_INTRINSICS, S_DISTORTION, S_THRESHOLD, S_CLOUD, S_IMAGE):
                entry.is_shape = True
            if entry.max_rate > 0 and kind not in (S_THRESHOLD,):
                last = entry.last_kept.get(kind)
                if last is not None and 0 <= ns - last < 1e9 / entry.max_rate:
                    return
                entry.last_kept[kind] = ns
            self._stats["samples"] += 1
            if self._text:
                self._text_sample(entry, kind, ns, values)
            else:
                self._binary_sample(entry, kind, ns, values)
            if kind in _LATCHED or (kind == S_CLOUD and entry.shape_type in (5, 6)):
                entry.latched[(kind, latch_key)] = [ns, values, _steady_ms()]
        finally:
            self._lock.release()
        self._after_sample(entry.non_blocking if entry.non_blocking is not None else self._options["nonBlocking"])

    # ---------------------------------------------------------------- binary
    def _binary_sample(self, entry, kind, ns, values):  # (lock held) encoded now, queued
        if kind in _NUMERIC:
            if entry.precise:
                self._push(entry, (S_FLOAT64 << 8) | kind, ns, struct.pack("<%dd" % len(values), *values))
                return
            if kind == S_INTRINSICS:
                payload = struct.pack("<HH4f", int(max(0, min(65535, values[0]))), int(max(0, min(65535, values[1]))), *values[2:])
            elif kind in (S_COLOR_RGB, S_OPACITY):
                payload = bytes(int(max(0, min(255, v))) for v in values)
            else:
                payload = struct.pack("<%df" % len(values), *values)
            self._push(entry, kind, ns, payload)
        elif kind in (S_TEXT, S_COLOR_STR, S_SHAPE_TEXT):
            text = str(values[0]).encode()
            if len(text) > _MAX_TEXT:
                self._stats["tooBig"] += 1
                text = text[:_MAX_TEXT]
            self._push(entry, kind, ns, text.split(b"\0")[0] + b"\0")
        elif kind == S_TEXTURE:
            self._push(entry, kind, ns, bytes([values[0]]) + _cstr(values[1]))
        elif kind == S_THRESHOLD:
            operator, value, name, color = values
            self._push(entry, kind, ns, bytes([operator]) + struct.pack("<d", value) + _cstr(name) + _cstr(color))
        elif kind == S_IMAGE:
            image_type, data = values
            count = max(1, (len(data) + _PART_BYTES - 1) // _PART_BYTES)
            if count > 0xFFFF:
                self._stats["tooBig"] += 1
                return
            for part in range(count):
                chunk = data[part * _PART_BYTES:(part + 1) * _PART_BYTES]
                self._push(entry, kind, ns, struct.pack("<BHHH", image_type, part, count, len(chunk)) + bytes(chunk))
        elif kind == S_CLOUD:
            points, intensities, colors = values
            flags = (1 if intensities is not None else 0) | (2 if colors is not None else 0)
            point_bytes = 12 + (4 if intensities is not None else 0) + (3 if colors is not None else 0)
            per_part = (_PART_BYTES - 7) // point_bytes
            count = max(1, (len(points) + per_part - 1) // per_part)
            for part in range(count):
                chunk = bytearray(struct.pack("<BHHH", flags, part, count, len(points[part * per_part:(part + 1) * per_part])))
                for i in range(part * per_part, min(len(points), (part + 1) * per_part)):
                    chunk += struct.pack("<3f", *points[i])
                    if intensities is not None:
                        chunk += struct.pack("<f", intensities[i])
                    if colors is not None:
                        chunk += bytes(int(max(0, min(255, c))) for c in colors[i])
                self._push(entry, kind, ns, bytes(chunk))

    def _push(self, entry, key, ns, payload):  # (lock held)
        entry.queues.setdefault(key, collections.deque()).append((ns, payload))
        self._queued += len(payload) + 8
        while self._queued > self._options["maxQueuedBytes"]:  # the oldest samples of the biggest queue go first
            biggest = None
            for e in self._entries:
                for q in e.queues.values():
                    if q and (biggest is None or sum(len(p) for _, p in q) > sum(len(p) for _, p in biggest)):
                        biggest = q
            if biggest is None:
                self._queued = 0
                break
            _, dropped = biggest.popleft()
            self._queued -= len(dropped) + 8
            self._stats["dropped"] += 1

    def _attr_bytes(self, code, value):
        if code in (A_NAME, A_UNIT, A_COLOR, A_LABEL, A_DESC, A_TITLE):
            return _cstr(str(value)[:_MAX_ATTR_TEXT])
        if code in (A_AUTOPLOT, A_LOG, A_STACK):
            return bytes([1 if value else 0])
        if code == A_TIMEOUT:
            return struct.pack("<Q", max(0, int(value)))
        if code == A_SHAPE:
            shape_type, url = value
            return bytes([shape_type]) + (_cstr(url[:_MAX_ATTR_TEXT]) if shape_type == Teleplot.Stl else b"")
        if code == A_FRAME:
            return bytes([value[0]]) + _cstr(value[1])
        if code == A_RANGE:
            return struct.pack("<dd", *(math.nan if v is None else v for v in value))
        if code == A_WRITE:
            kind, write_type, flags, step, rate, hold, axes = value
            return struct.pack("<BBBdHHB", kind, write_type, flags, math.nan if step is None else step, rate, hold, axes)
        if code == A_CHOICES:
            return _cstr("\n".join(value)[:_MAX_ATTR_TEXT])
        if code == A_PIXELS:
            return struct.pack("<ddB", value[0], value[1], 1 if value[2] else 0)
        raise ValueError(code)

    def _build_packet(self):  # (lock held) the next packet: client name, dashboards, descriptions, samples. None: nothing
        p = bytearray(struct.pack("<BBH", _MARKER, _VERSION, self._client_id))
        start, limit = len(p), _PACKET_SIZE - 2
        now = _steady_ms()
        every = self._options["describeInterval"] * 1000
        if now - self._name_sent_ms >= every:
            p += bytes([S_CLIENT_NAME]) + _cstr(self._options["name"][:_MAX_NAME])
            self._name_sent_ms = now
        while self._dashboards and len(self._dashboards[0].encode()) + 2 <= limit - len(p):
            p += bytes([S_DASHBOARD]) + _cstr(self._dashboards.popleft())
        full = False
        waiting = set()
        for i, e in enumerate(self._entries):
            if full:
                break
            if not e.dirty and now - e.attrs_sent_ms < every:
                continue
            if e.attr_cursor == 0:  # name first; codes in order: the newer ones (11 and up) last
                e.items = [bytes([A_NAME]) + _cstr(e.name)]
                for code in sorted(e.attrs):
                    if code < A_ARGS and code not in (A_NAME,):
                        e.items.append(bytes([code]) + self._attr_bytes(code, e.attrs[code]))
                for arg in e.args:
                    e.items.append(bytes([A_ARGS]) + arg)
                for code in sorted(e.attrs):
                    if code > A_ARGS:
                        e.items.append(bytes([code]) + self._attr_bytes(code, e.attrs[code]))
                for (kind, _), (ns, values, sent_ms) in list(e.latched.items()):  # sent once and not since: again, its own time
                    key = (S_FLOAT64 << 8) | kind if e.precise and kind in _NUMERIC else kind
                    if now - sent_ms >= every and not e.queues.get(key):
                        self._binary_sample(e, kind, ns, values)
            while e.attr_cursor < len(e.items):
                if limit - len(p) < 4 + len(e.items[e.attr_cursor]):
                    if len(p) == start:
                        e.attr_cursor += 1  # (cannot fit even alone: skipped, never sent in a loop)
                        continue
                    full = True
                    break
                p += struct.pack("<BH", S_ATTR, e.id)
                count_at = len(p)
                p.append(0)
                count = 0
                while e.attr_cursor < len(e.items) and count < 255 and limit - len(p) >= len(e.items[e.attr_cursor]):
                    p += e.items[e.attr_cursor]
                    e.attr_cursor += 1
                    count += 1
                p[count_at] = count
            if e.attr_cursor >= len(e.items):
                e.attr_cursor, e.dirty, e.attrs_sent_ms = 0, False, now
            else:
                waiting.add(i)
        n = len(self._entries)
        for k in range(n):
            if full:
                break
            i = (self._rr + k) % n
            if i in waiting:
                continue
            e = self._entries[i]
            for key in sorted(e.queues):
                q = e.queues[key]
                if not q:
                    continue
                f64 = (key >> 8) == S_FLOAT64
                header = 12 + (1 if f64 else 0)
                reference, first = q[0]
                if limit - len(p) < header + 4 + len(first):
                    if len(p) == start:
                        q.popleft()
                        self._queued -= len(first) + 8
                        self._stats["tooBig"] += 1
                        continue
                    full = True
                    break
                p += struct.pack("<BHQ", S_FLOAT64 if f64 else key, e.id, max(0, reference))
                count_at = len(p)
                p.append(0)
                if f64:
                    p.append(key & 0xFF)
                count = 0
                while q and count < 255:
                    ns, payload = q[0]
                    diff = ns - reference
                    if diff < 0 or diff > 0xFFFFFFFF:  # (TIMEDIFF: an uint32 of ns; out of it, a section of its own)
                        break
                    if limit - len(p) < 4 + len(payload):
                        full = True
                        break
                    p += struct.pack("<I", diff) + payload
                    q.popleft()
                    self._queued -= len(payload) + 8
                    count += 1
                p[count_at] = count
                if full:
                    break
        self._rr += 1
        return bytes(p) if len(p) > start else None

    def _binary_call(self, r):
        telem_id, call_id, count = r.u16(), r.u16(), r.u8()
        action = self._actions.get(telem_id)
        values = {}
        for _ in range(count):
            at = r.u8()
            if action is None or at >= len(action._args):
                return False
            spec = action._args[at]
            if spec.type == Teleplot.Arg.Bool:
                values[spec.name] = r.u8() != 0
            elif spec.type == Teleplot.Arg.Text:
                values[spec.name] = r.str()
            elif spec.type == Teleplot.Arg.XY:
                values[spec.name] = [r.f64(), r.f64()]
            elif spec.type in (Teleplot.Arg.XYZ, Teleplot.Arg.Pose2D):
                values[spec.name] = [r.f64(), r.f64(), r.f64()]
            else:
                values[spec.name] = r.f64()
        if not r.ok:
            return False
        name = self._entries[self._by_id[telem_id]].name if telem_id in self._by_id else ""
        self._run_call(action, Teleplot.Call(name, call_id, telem_id), values)
        return True

    def _answer(self, telem_id, name, call_id, status, text):
        if self._text:
            head = "%s#%d" % (name, call_id) if call_id != _CALL_ID_SETTING else name
            word = ["ok", "err", "run"][status]
            line = "ACK|%s:%s" % (head, word) + (":" + _escape(text, "%\n\r") if text else "")
            with self._lock:
                self._line(line)
            self.flush()
            return
        packet = struct.pack("<BBHBHHB", _MARKER, _VERSION, self._client_id, S_CALL_ANSWER, telem_id, call_id, status) + _cstr(str(text)[:_MAX_TEXT])
        with self._send_lock:
            self._send(packet)

    # ---------------------------------------------------------------- text
    def _line(self, line):  # (lock held)
        data = (line + "\n").encode()
        self._text_queue.append(data)
        self._queued += len(data)
        while self._queued > self._options["maxQueuedBytes"] and self._text_queue:
            self._queued -= len(self._text_queue.popleft())
            self._stats["dropped"] += 1

    def _text_head(self, entry):
        label = entry.attrs.get(A_LABEL)
        return entry.name + ("," + label if label else "")

    def _text_flags(self, entry, kind):
        flags = [kind] if kind else []
        if entry.attrs.get(A_AUTOPLOT) is False:
            flags.append("np")
        return ("|" + ",".join(flags)) if flags else ""

    def _text_describe(self, entry):  # (lock held) ATTR| and the 3D| lines of a shape's type and frame
        entry.dirty = False
        a = entry.attrs
        keys = []
        for code, key in ((A_UNIT, "unit"), (A_DESC, "desc"), (A_COLOR, "color")):
            if a.get(code):
                keys.append("%s=%s" % (key, _escape(a[code], "%|,=:\n\r")))
        if a.get(A_RANGE):
            for side, key in zip(a[A_RANGE], ("min", "max")):
                if side is not None and not math.isnan(side):
                    keys.append("%s=%s" % (key, _number_text(side, True)))
        if a.get(A_PIXELS):
            scale, no_data, depth = a[A_PIXELS]
            keys += ["scale=%s" % _number_text(scale, True), "nodata=%s" % ("" if math.isnan(no_data) else _number_text(no_data, True)),
                     "depth=%d" % (1 if depth else 0)]
        if keys:
            self._line("ATTR|%s|%s" % (entry.name, "|".join(keys)))
        if A_SHAPE in a:
            shape_type, url = a[A_SHAPE]
            self._line("3D|%s:S:\"%s\"%s" % (entry.name, _SHAPE_NAMES.get(shape_type, "cube"), (":U:\"%s\"" % url) if shape_type == Teleplot.Stl else ""))
        if A_FRAME in a:
            frame_type, name = a[A_FRAME]
            self._line("3D|%s:%s:\"%s\"" % (entry.name, "FPX" if frame_type == 1 else "F", name))
        for code, value in ((A_WRITE, a.get(A_WRITE)),):
            if value is not None:
                self._line(self._text_write_line(entry, value))
        for line in entry.text_args:
            self._line(line)
        entry.attrs_sent_ms = _steady_ms()

    def _text_write_line(self, entry, write):
        kind, write_type, flags, step, rate, hold, axes = write
        a = entry.attrs
        if kind == 2:
            line = "ATTR|%s|action" % entry.name
            for code, key in ((A_TITLE, "title"), (A_DESC, "desc"), (A_COLOR, "color")):
                if a.get(code):
                    line += "|%s=%s" % (key, _escape(a[code], "%|,=:\n\r"))
            return line + ("|confirm" if flags & 1 else "") + ("|longpress" if flags & 2 else "")
        line = "ATTR|%s|write=%s" % (entry.name, _WRITE_TYPES[write_type])
        rng = a.get(A_RANGE) or (None, None)
        for side, key in zip(rng, ("min", "max")):
            if side is not None and not math.isnan(side):
                line += "|%s=%s" % (key, _number_text(side, True))
        if step is not None:
            line += "|step=%s" % _number_text(step, True)
        if rate:
            line += "|rate=%d" % rate
        if hold:
            line += "|hold=%d" % hold
        if axes:
            line += "|axes=" + ",".join(n for bit, n in ((1, "x"), (2, "y"), (4, "yaw")) if axes & bit)
        for code, key in ((A_UNIT, "unit"), (A_DESC, "desc")):
            if a.get(code):
                line += "|%s=%s" % (key, _escape(a[code], "%|,=:\n\r"))
        if a.get(A_CHOICES):
            line += "|choices=" + ",".join(_escape(c, "%|,=:\n\r") for c in a[A_CHOICES])
        return line

    def _text_sample(self, entry, kind, ns, values):  # (lock held) the line of a sample
        if entry.dirty:
            self._text_describe(entry)
        n = lambda v: _number_text(v, entry.precise)
        t = _time_text(ns)
        if kind == S_NUMBER:
            self._line("%s:%s:%s%s" % (self._text_head(entry), t, n(values[0]), self._text_flags(entry, None)))
        elif kind in (S_NUMBER_2D, S_NUMBER_3D):
            self._line("%s:%s:%s%s" % (self._text_head(entry), ":".join(n(v) for v in values), t, self._text_flags(entry, "xy" if kind == S_NUMBER_2D else "xyz")))
        elif kind == S_TEXT:
            text = str(values[0]).replace("\n", " ").replace("\r", " ").replace("§", "?")
            if len(text.encode()) > _MAX_TEXT:
                self._stats["tooBig"] += 1
                text = text.encode()[:_MAX_TEXT].decode(errors="ignore")
            self._line("%s:%s:%s%s" % (self._text_head(entry), t, text, self._text_flags(entry, "log" if entry.log else "stack" if entry.stack else "t")))
        elif kind == S_THRESHOLD:
            operator, value, name, color = values
            self._line("TH|%s:%s:%s%s%s%s" % (entry.name, t, _escape(name, "%:;|<>,"), ">" if operator == Teleplot.Above else "<",
                                               "" if math.isnan(value) else _number_text(value, True), ("," + _escape(color, "%:;|<>,")) if color else ""))
        elif kind == S_IMAGE:
            image_type, data = values
            prefix = {Teleplot.Jpeg: "JPG", Teleplot.Png: "PNG", Teleplot.Raw: "RAW"}[image_type]
            part = 768
            count = max(1, (len(data) + part - 1) // part)
            for i in range(count):
                self._line("%s|%s:%s:%d/%d:%s" % (prefix, self._text_head(entry), t, i + 1, count, base64.b64encode(bytes(data[i * part:(i + 1) * part])).decode()))
        elif kind == S_CLOUD:
            points, intensities, colors = values
            if entry.shape_type in (5, 6):  # the points of a line or a polygon
                self._line("3D|%s:%s:PT:%s" % (entry.name, t, ":".join(n(c) for p in points for c in p)))
                return
            fields = []
            for i, p in enumerate(points):
                f = [n(c) for c in p]
                if intensities is not None:
                    f.append(n(intensities[i]))
                if colors is not None:
                    f += [str(int(max(0, min(255, c)))) for c in colors[i]]
                fields.append(":".join(f))
            self._line("%s:%s%s%s" % (self._text_head(entry), t, "".join(";" + f for f in fields), self._text_flags(entry, "pc")))
        else:  # a property of a shape: 3D|name:time:PROPERTY:values
            q = lambda s: "\"%s\"" % str(s).replace("\"", "'").replace("\n", " ")
            if kind == S_QUATERNION:
                w, x, y, z = values
                body = "Q:%s" % ":".join(n(v) for v in (x, y, z, w))
            elif kind == S_INTRINSICS:
                width, height, fx, fy, cx, cy = values
                body = "K:%s" % ":".join(n(v) for v in (fx, fy, cx, cy, width, height))
            elif kind == S_COLOR_RGB:
                body = "C:#%02x%02x%02x" % tuple(int(max(0, min(255, v))) for v in values)
            elif kind == S_COLOR_STR:
                body = "C:%s" % values[0]
            elif kind == S_OPACITY:
                body = "O:%s" % n(values[0] / 255.0)
            elif kind == S_TEXTURE:
                body = "T:%s:%s" % ("url" if values[0] == 1 else "telem", q(values[1]))
            elif kind == S_SHAPE_TEXT:
                body = "TX:%s" % q(values[0])
            else:
                prop = {S_POSITION: "P", S_ROTATION: "R", S_SIZE: "SC", S_VECTOR: "V", S_LINE_WIDTH: "LW", S_DISTORTION: "DC"}[kind]
                body = "%s:%s" % (prop, ":".join(n(v) for v in values))
            self._line("3D|%s:%s:%s" % (entry.name, t, body))

    def _text_tick(self):  # (lock held) what changed at once; every describeInterval: descriptions and what was sent once, again
        now = _steady_ms()
        if now - self._described_ms < self._options["describeInterval"] * 1000:
            for e in self._entries:
                if e.dirty:
                    self._text_describe(e)
            return
        self._described_ms = now
        for e in self._entries:
            if e.attrs:
                self._text_describe(e)
            for (kind, _), (ns, values, sent_ms) in list(e.latched.items()):
                if now - sent_ms >= self._options["describeInterval"] * 1000:
                    self._text_sample(e, kind, ns, values)

    def _text_call(self, call):  # name#id:arg=value:...
        head, _, fields = call.partition(":")
        name, _, call_id = head.partition("#")
        try:
            call_id = int(call_id)
        except ValueError:
            return
        action = next((a for a in self._actions.values() if a._name == name), None)
        if action is None:
            return self._answer(0, name, call_id, 1, "unknown action")
        values = {}
        specs = {a.name: a for a in action._args}
        for field in fields.split(":") if fields else []:
            key, _, value = field.partition("=")
            key = _unescape(key)
            spec = specs.get(key)
            if spec is None:
                continue
            try:
                if spec.type == Teleplot.Arg.Bool:
                    values[key] = value.strip() not in ("0", "false", "")
                elif spec.type == Teleplot.Arg.Text:
                    values[key] = _unescape(value)
                elif spec.type in (Teleplot.Arg.XY, Teleplot.Arg.XYZ, Teleplot.Arg.Pose2D):
                    values[key] = [float(v) for v in value.split(",")]
                else:
                    values[key] = float(value)
            except ValueError:
                pass
        self._run_call(action, Teleplot.Call(name, call_id, self._entries[action._index].id), values)

    # ---------------------------------------------------------------- commands
    def _run_call(self, action, call, values):
        if action is None:
            return self._answer(call.telemetry, call.action, call.id, 1, "unknown action")
        for i, r in action._recent:
            if i == call.id:  # sent again: answered again, not run twice
                return self._answer(call.telemetry, call.action, call.id, r.status, r.text)
        for spec in action._args:
            if not spec.isOptional and spec.name not in values:
                return self._answer(call.telemetry, call.action, call.id, 1, "missing " + spec.name)
        self._answer(call.telemetry, call.action, call.id, 2, "")
        try:
            result = action._handler(Args(values, call)) if action._handler else None
            if result is None:
                result = Teleplot.ok()
            elif not isinstance(result, Teleplot.Result):
                result = Teleplot.ok(str(result))
        except Exception as e:  # the device says why
            result = Teleplot.error(str(e) or type(e).__name__)
        action._recent.append((call.id, result))
        del action._recent[:-16]
        if result.status != 2:
            self._answer(call.telemetry, call.action, call.id, result.status, result.text)

    # ---------------------------------------------------------------- stacks
    def _stack_entry(self, name):
        """The telemetry of a stack for the calling thread: the main thread sends to the stack as named, other threads to
        "name.thread" with the label of the stack; a oneThread() stack belongs to the first thread that uses it"""
        if not self._enabled:
            return None
        me = threading.get_ident()
        with self._lock:
            index = self._find(name)
            base = self._entries[index]
            if base.one_thread:
                if base.owner is None:
                    base.owner = me
                elif base.owner != me:
                    self._stats["wrongThread"] += 1
                    return None
            elif threading.current_thread() is not threading.main_thread():
                index = self._find("%s.%s" % (name, getattr(_thread_names, "name", None) or threading.current_thread().name))
            entry = self._entries[index]
            if not entry.stack:
                self._attr(entry, A_STACK, True)
                if A_LABEL not in entry.attrs:
                    self._attr(entry, A_LABEL, str(name))
        return index

    # ---------------------------------------------------------------- sending
    def _flush(self, try_only):
        if not self._enabled or getattr(_in_send, "value", False):
            return
        if not self._send_lock.acquire(blocking=not try_only):
            return
        _in_send.value = True
        try:
            self._last_flush_ms = _steady_ms()
            if not try_only:
                self._stats_due()
            packets, limit = 0, None
            while True:
                if not self._lock.acquire(blocking=not try_only):
                    break
                try:
                    if self._text:
                        self._text_tick()
                        data = self._text_packet()
                    else:
                        if limit is None:  # (at most what was queued when it started)
                            limit = 2 + len(self._entries) + self._queued // 256
                        packets += 1
                        data = self._build_packet() if packets <= limit else None
                finally:
                    self._lock.release()
                if not data:
                    break
                self._send(data)
            for f in self._files:
                f.flush()
        finally:
            _in_send.value = False
            self._send_lock.release()

    def _text_packet(self):  # (lock held) queued lines, up to a datagram
        if not self._text_queue:
            return None
        out = bytearray()
        while self._text_queue and (not out or len(out) + len(self._text_queue[0]) <= _PACKET_SIZE):
            line = self._text_queue.popleft()
            self._queued -= len(line)
            out += line
        return bytes(out)

    def _send(self, data):  # (send lock held)
        if not self._text:
            checksum = sum(data) & 0xFFFF
            data = data + struct.pack("<H", checksum)
        errors = 0
        for s, address in self._sockets:
            try:
                s.sendto(data, address)
            except OSError:
                errors += 1
        for f in self._files:
            try:
                f.write(data if self._text else struct.pack("<I", len(data)) + data)
            except OSError:
                errors += 1
        for fn in self._functions:
            fn(data)
        with self._lock:
            self._stats["packets"] += 1
            self._stats["bytes"] += len(data)
            self._stats["sendErrors"] += errors

    def _stats_due(self):
        with self._lock:
            now = _steady_ms()
            if self._stats_every <= 0 or now - self._stats_at < self._stats_every * 1000:
                return
            seconds = (now - self._stats_at) / 1000.0
            before, after, queued = self._stats_before or dict(self._stats), dict(self._stats), self._queued
            self._stats_before, self._stats_at = after, now
        for name, key, unit, desc in (("teleplot.packets", "packets", "/s", "Packets sent per second"), ("teleplot.bytes", "bytes", "B/s", "Bytes sent per second"),
                                      ("teleplot.samples", "samples", "/s", "Samples queued per second")):
            self.telemetry(name).unit(unit).label("teleplot sent").desc(desc).update((after[key] - before[key]) / seconds)
        self.telemetry("teleplot.queued").unit("B").label("teleplot sent").desc("Bytes waiting to be sent").update(queued)
        for name, key, desc in (("teleplot.dropped", "dropped", "Samples dropped (queue full, or lock busy for a nonBlocking telemetry), since the start"),
                                ("teleplot.tooBig", "tooBig", "Texts cut to fit a packet, lines refused, since the start"),
                                ("teleplot.sendErrors", "sendErrors", "Socket or file errors, since the start"),
                                ("teleplot.wrongThread", "wrongThread", "Samples of a oneThread() stack from another thread, since the start"),
                                ("teleplot.priorityRefused", "priorityRefused", "Priorities or CPUs the system refused to a thread of Teleplot, since the start")):
            self.telemetry(name).label("teleplot problems").desc(desc).update(after[key])

    def _open_outputs(self):
        o = self._options
        self._text_queue = collections.deque()
        udp = o["udp"]
        if udp is None and o["file"] is None and o["output"] is None:
            udp = ("127.0.0.1", 47269)
        for host, port in ([udp] if isinstance(udp, tuple) else list(udp or [])):
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.bind(("", 0))  # one socket to send and to receive: the server answers where the packets come from
            s.setblocking(False)
            self._sockets.append((s, (host, port)))
        for path in ([o["file"]] if isinstance(o["file"], (str, os.PathLike)) else list(o["file"] or [])):
            f = open(path, "wb")
            if not self._text:
                f.write(_FILE_MAGIC)
            self._files.append(f)
        self._functions = [o["output"]] if callable(o["output"]) else list(o["output"] or [])

    def _close_outputs(self):
        for s, _ in self._sockets:
            s.close()
        for f in self._files:
            f.close()
        self._sockets, self._files, self._functions = [], [], []

    def _start_thread(self):
        self._thread_stop = False

        def run():
            applied = None
            with self._thread_lock:
                while not self._thread_stop:
                    if applied != self._thread_generation:  # its priority and CPUs, as set: again when they change
                        applied = self._thread_generation
                        if not self._reference.apply(self._priority, self._affinity):
                            with self._lock:
                                self._stats["priorityRefused"] += 1
                    self._thread_wake.wait(max(0.001, self._options["flushInterval"]))
                    if self._thread_stop:
                        break
                    self._thread_lock.release()
                    try:
                        self.flush()
                    finally:
                        self._thread_lock.acquire()

        self._thread = threading.Thread(target=run, name="teleplot", daemon=True)
        self._thread.start()

    def _stop_thread(self):
        if self._thread is None:
            return
        with self._thread_lock:
            self._thread_stop = True
            self._thread_wake.notify_all()
        self._thread.join()
        self._thread = None

    def _extension(self, cls):
        e = self._extensions.get(cls)
        if e is None:
            e = self._extensions[cls] = cls(self)
        return e


_in_send = threading.local()
_thread_names = threading.local()


class _Entry:
    __slots__ = ("name", "id", "attrs", "args", "text_args", "items", "dirty", "attr_cursor", "attrs_sent_ms", "is_shape", "shape_type",
                 "log", "stack", "precise", "max_rate", "non_blocking", "one_thread", "owner", "stack_path", "queues", "latched",
                 "last_kept", "range")

    def __init__(self, name):
        self.name, self.id = name, 0
        self.attrs, self.args, self.text_args, self.items = {}, [], [], []
        self.dirty, self.attr_cursor, self.attrs_sent_ms = True, 0, -10 ** 12
        self.is_shape, self.shape_type, self.log, self.stack, self.precise = False, None, False, False, False
        self.max_rate, self.non_blocking, self.one_thread, self.owner = 0.0, None, False, None
        self.stack_path, self.queues, self.latched, self.last_kept = "", {}, {}, {}
        self.range = [None, None]


class _Reader:
    def __init__(self, data):
        self.data, self.at, self.ok = data, 0, True

    def _take(self, fmt):
        size = struct.calcsize(fmt)
        if self.at + size > len(self.data):
            self.ok = False
            return 0
        value = struct.unpack_from(fmt, self.data, self.at)[0]
        self.at += size
        return value

    def u8(self):
        return self._take("<B")

    def u16(self):
        return self._take("<H")

    def u32(self):
        return self._take("<I")

    def u64(self):
        return self._take("<Q")

    def f32(self):
        return self._take("<f")

    def f64(self):
        return self._take("<d")

    def str(self):
        end = self.data.find(b"\0", self.at)
        if end < 0:
            self.ok = False
            return ""
        text = self.data[self.at:end].decode(errors="replace")
        self.at = end + 1
        return text


def _ns(t):
    """A time, as nanoseconds: Teleplot.Time, seconds since 1970 (int or float), a datetime"""
    if isinstance(t, Teleplot.Time):
        return t.ns
    if isinstance(t, datetime.datetime):
        if t.tzinfo is None:
            t = t.astimezone()
        delta = t - datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
        return (delta.days * 86400 + delta.seconds) * 1000000000 + delta.microseconds * 1000
    if isinstance(t, numbers.Real):
        return int(round(float(t) * 1e9))
    raise TeleplotError("a time: Teleplot.Time (Teleplot.ms(...)), seconds since 1970, or a datetime")


def _seconds(v):
    """An interval, as seconds: Teleplot.Time (Teleplot.ms(20)), a timedelta, or a number of seconds"""
    if isinstance(v, Teleplot.Time):
        return v.ns / 1e9
    if isinstance(v, datetime.timedelta):
        return v.total_seconds()
    return float(v)


def _numbers(value, count=None):
    """A point (Number2D, Number3D, a tuple, a list, a NumPy array): a list of floats"""
    try:
        values = [float(v) for v in value]
    except TypeError:
        raise TeleplotError("not a point: %r" % (value,))
    if count is not None and len(values) != count:
        raise TeleplotError("%d numbers expected, got %d" % (count, len(values)))
    return values


def _points(points, dims):
    """Points: [(x, y[, z]), ...] or an N x 2 / N x 3 NumPy array: a list of (x, y, z)"""
    out = []
    for p in points:
        v = [float(c) for c in p]
        if len(v) == 2:
            v.append(0.0)
        if len(v) != 3:
            raise TeleplotError("a point has 2 or 3 numbers")
        out.append(tuple(v))
    return out


# --------------------------------------------------------------------------------------------------------------- telemetries
class _Describe:
    """What describes a telemetry: the same calls on a Telemetry and on the Samples of a chain"""
    __slots__ = ("_tp", "_index")

    def _do(self, fn):
        tp = self._tp
        with tp._lock:
            fn(tp._entries[self._index])
        return self

    def unit(self, text):
        return self._do(lambda e: self._tp._attr(e, A_UNIT, str(text)))

    def label(self, text):
        return self._do(lambda e: self._tp._attr(e, A_LABEL, str(text)))

    def desc(self, text):
        return self._do(lambda e: self._tp._attr(e, A_DESC, str(text)))

    def range(self, min, max):
        def apply(e):
            e.range = [float(min), float(max)]
            self._tp._attr(e, A_RANGE, tuple(e.range))
        return self._do(apply)

    def min(self, v):
        def apply(e):
            e.range[0] = float(v)
            self._tp._attr(e, A_RANGE, tuple(e.range))
        return self._do(apply)

    def max(self, v):
        def apply(e):
            e.range[1] = float(v)
            self._tp._attr(e, A_RANGE, tuple(e.range))
        return self._do(apply)

    def autoplot(self, v):
        return self._do(lambda e: self._tp._attr(e, A_AUTOPLOT, bool(v)))

    def timeout(self, t):
        return self._do(lambda e: self._tp._attr(e, A_TIMEOUT, int(_seconds(t) * 1e9)))

    def log(self, v=True):
        return self._do(lambda e: self._tp._attr(e, A_LOG, bool(v)))

    def stack(self, v=True):
        return self._do(lambda e: self._tp._attr(e, A_STACK, bool(v)))

    def frame(self, name):
        return self._do(lambda e: self._tp._attr(e, A_FRAME, (0, str(name))))

    def pixelsOf(self, image):
        return self._do(lambda e: self._tp._attr(e, A_FRAME, (1, str(image))))

    def depthMap(self, scale, noData=0):
        """A picture of distances: a pixel is worth its number x scale (noData: what means none; math.nan: none)"""
        return self._do(lambda e: self._tp._attr(e, A_PIXELS, (float(scale), float(noData), True)))

    def pixelValues(self, scale, noData=0):
        """A picture of other values (a temperature...): a pixel is worth its number x scale"""
        return self._do(lambda e: self._tp._attr(e, A_PIXELS, (float(scale), float(noData), False)))

    def shape(self, shape_type):
        def apply(e):
            e.is_shape, e.shape_type = True, int(shape_type)
            self._tp._attr(e, A_SHAPE, (int(shape_type), ""))
        return self._do(apply)

    def stl(self, url):
        def apply(e):
            e.is_shape, e.shape_type = True, Teleplot.Stl
            self._tp._attr(e, A_SHAPE, (Teleplot.Stl, str(url)))
        return self._do(apply)

    def maxRate(self, hz):
        return self._do(lambda e: setattr(e, "max_rate", float(hz)))

    def precise(self, v=True):
        return self._do(lambda e: setattr(e, "precise", bool(v)))

    def nonBlocking(self, v=True):
        return self._do(lambda e: setattr(e, "non_blocking", bool(v)))

    def oneThread(self, v=True):
        return self._do(lambda e: setattr(e, "one_thread", bool(v)))

    # ---------------------------------------------------------------- samples
    def update(self, value):
        s = self._samples()
        if isinstance(value, bool):
            s._send(S_NUMBER, [1.0 if value else 0.0])
        elif isinstance(value, str):
            s._send(S_TEXT, [value])
        elif isinstance(value, Teleplot.Pose2D):
            s._send(S_NUMBER_3D, _numbers(value, 3))
        elif isinstance(value, numbers.Real):
            s._send(S_NUMBER, [float(value)])
        else:
            values = _numbers(value)
            if len(values) not in (2, 3):
                raise TeleplotError("update(): a number, a text, or a point of 2 or 3 numbers")
            s._send(S_NUMBER_2D if len(values) == 2 else S_NUMBER_3D, values)
        return s

    def threshold(self, name, side, value, color=""):
        s = self._samples()
        s._send(S_THRESHOLD, (int(side), float(value), str(name), str(color)), str(name))
        return s

    def removeThreshold(self, name):
        s = self._samples()
        s._send(S_THRESHOLD, (Teleplot.Below, math.nan, str(name), ""), str(name))
        return s

    def position(self, x, y, z=0.0):
        return self._samples()._send(S_POSITION, [float(x), float(y), float(z)])

    def rotation(self, roll, pitch, yaw):
        return self._samples()._send(S_ROTATION, [float(roll), float(pitch), float(yaw)])

    def yaw(self, a):
        return self.rotation(0, 0, a)

    def quaternion(self, w, x, y, z):
        return self._samples()._send(S_QUATERNION, [float(w), float(x), float(y), float(z)])

    def size(self, x, y=None, z=None):
        if y is None:
            y = z = x
        if z is None:
            with self._tp._lock:
                latched = self._tp._entries[self._index].latched.get((S_SIZE, None))
            z = latched[1][2] if latched else 1.0  # (x, y: z kept)
        return self._samples()._send(S_SIZE, [float(x), float(y), float(z)])

    def color(self, c):
        tp = self._tp
        with tp._lock:
            shape = tp._entries[self._index].is_shape
        if not shape:  # not a shape (yet): the color of the telemetry
            text = "#%02x%02x%02x" % tuple(int(v) for v in c) if isinstance(c, Teleplot.Rgb) else str(c)
            return self._do(lambda e: tp._attr(e, A_COLOR, text))
        if isinstance(c, Teleplot.Rgb):
            return self._samples()._send(S_COLOR_RGB, [float(v) for v in c])
        return self._samples()._send(S_COLOR_STR, [str(c)])

    def opacity(self, v):
        return self._samples()._send(S_OPACITY, [round(max(0.0, min(1.0, float(v))) * 255)])

    def texture(self, url):
        return self._samples()._send(S_TEXTURE, (1, str(url)))

    def textureFrom(self, image):
        return self._samples()._send(S_TEXTURE, (2, str(image)))

    def vector(self, x, y, z=0.0):
        return self._samples()._send(S_VECTOR, [float(x), float(y), float(z)])

    def text(self, value):
        return self._samples()._send(S_SHAPE_TEXT, [str(value)])

    def textSize(self, h):
        return self.size(h)

    def lineWidth(self, w):
        return self._samples()._send(S_LINE_WIDTH, [float(w)])

    def points(self, points):
        return self._samples()._send(S_CLOUD, (_points(points, 2), None, None))

    def cloud(self, points, intensities=None, colors=None):
        pts = _points(points, 3)
        return self._samples()._send(S_CLOUD, (pts, None if intensities is None else [float(v) for v in intensities],
                                               None if colors is None else [tuple(int(c) for c in rgb) for rgb in colors]))

    def image(self, picture_or_type, data=None):
        """image(type, bytes), or image(picture) (TeleplotImage.Picture: nothing is sent when it is empty)"""
        if data is None:
            picture = picture_or_type
            if not picture.bytes:
                return self._samples()
            return self._samples()._send(S_IMAGE, (int(picture.type), bytes(picture.bytes)))
        return self._samples()._send(S_IMAGE, (int(picture_or_type), bytes(data)))

    def intrinsics(self, width, height, fx, fy, cx, cy):
        return self._samples()._send(S_INTRINSICS, [float(v) for v in (width, height, fx, fy, cx, cy)])

    def distortion(self, k1, k2, p1, p2, k3):
        return self._samples()._send(S_DISTORTION, [float(v) for v in (k1, k2, p1, p2, k3)])


class Samples(_Describe):
    """Samples of a chain: they all get the time of the chain, taken by its first sample (or given by at())"""
    __slots__ = ("_ns",)

    def __init__(self, tp, index, ns=None):
        self._tp, self._index, self._ns = tp, index, ns

    def _samples(self):
        return self

    def _send(self, kind, values, latch_key=None):
        if self._ns is None:
            self._ns = self._tp._now_ns()
        self._tp._sample(self._index, kind, self._ns, values, latch_key)
        return self

    def at(self, t):
        raise TeleplotError("Teleplot: at() must be the first call of a chain: telemetry.at(t).position(...)")


class Telemetry(_Describe):
    """The handle of a telemetry: describe it, send its samples"""
    __slots__ = ()

    def __init__(self, tp, index):
        self._tp, self._index = tp, index

    def _samples(self):
        return Samples(self._tp, self._index)

    def _chain(self, t):
        return Samples(self._tp, self._index, None if t is None else _ns(t))

    def at(self, t):
        return Samples(self._tp, self._index, _ns(t))

    def name(self):
        return self._tp._entries[self._index].name

    def teleplot(self):
        return self._tp


Teleplot.Samples = Samples
Teleplot.Telemetry = Telemetry


# --------------------------------------------------------------------------------------------------------------- commands
class Param:
    """A setting the page may write: .value (or the attribute it is bound to) is applied by poll() and published"""

    def __init__(self, tp, name, initial, attribute=None):
        self._tp, self._name, self._index = tp, str(name), None
        self._object, self._attribute = (initial, attribute) if attribute is not None else (None, None)
        self._value = None if attribute is not None else initial
        self._min = self._max = self._step = None
        self._rate = self._hold = self._axes = 0
        self._choices = []
        self._on_change = None
        self._written_ms = 0
        v = self.value
        self._type = 2 if isinstance(v, bool) else 6 if isinstance(v, Teleplot.Pose2D) else 1 if isinstance(v, numbers.Real) else \
            3 if isinstance(v, str) else None
        if self._type is None:
            values = _numbers(v)
            self._type = 4 if len(values) == 2 else 5 if len(values) == 3 else None
            if self._type is None:
                raise TeleplotError("param(): a bool, a number, a text, Number2D, Number3D or Pose2D")
        self._kind_of = type(v)

    @property
    def value(self):
        if self._object is None:
            return self._value
        return self._object[self._attribute] if isinstance(self._object, dict) else getattr(self._object, self._attribute)

    @value.setter
    def value(self, v):
        if self._object is None:
            self._value = v
        elif isinstance(self._object, dict):
            self._object[self._attribute] = v
        else:
            setattr(self._object, self._attribute, v)

    def _set(self, **changes):
        for k, v in changes.items():
            setattr(self, k, v)
        self._declare()
        return self

    def range(self, min, max):
        return self._set(_min=float(min), _max=float(max))

    def min(self, v):
        return self._set(_min=float(v))

    def max(self, v):
        return self._set(_max=float(v))

    def step(self, v):
        return self._set(_step=float(v))

    def unit(self, text):
        Telemetry(self._tp, self._index).unit(text)
        self._declare()
        return self

    def desc(self, text):
        Telemetry(self._tp, self._index).desc(text)
        self._declare()
        return self

    def choices(self, values):
        return self._set(_choices=[str(v) for v in values])

    def rate(self, hz):
        return self._set(_rate=int(max(0, min(65535, hz))))

    def hold(self, ms):
        return self._set(_hold=int(max(0, min(65535, _seconds(ms) * 1000 if isinstance(ms, (Teleplot.Time, datetime.timedelta)) else ms))))

    def axes(self, bits):
        return self._set(_axes=int(bits))

    def onChange(self, fn):
        """fn(value) is called before a value the page wrote is applied: Teleplot.error("why") (or an exception) refuses it"""
        self._on_change = fn
        return self

    def _declare(self):
        tp = self._tp
        with tp._lock:
            e = tp._entries[self._index]
            tp._attr(e, A_WRITE, (1, self._type, 0, self._step, self._rate, self._hold, self._axes))
            tp._attr(e, A_RANGE, (self._min, self._max))
            tp._attr(e, A_CHOICES, tuple(self._choices))

    def _publish(self):
        v = self.value
        t = Telemetry(self._tp, self._index)
        if self._type == 2:
            t.update(1.0 if v else 0.0)
        elif self._type == 6:
            t.update(Teleplot.Pose2D(*_numbers(v, 3)))
        else:
            t.update(v)

    def _clamp(self, v):
        if self._min is not None:
            v = max(self._min, v)
        if self._max is not None:
            v = min(self._max, v)
        if self._step:
            base = self._min if self._min is not None else 0.0
            v = base + round((v - base) / self._step) * self._step
        return v

    def _written(self, numbers_, text, telem_id):
        """What the page wrote: read, clamped, checked by onChange, applied (or refused), echoed"""
        why = None
        if self._type == 3:
            value = text
            if self._choices and value not in self._choices:
                why = "one of " + ", ".join(self._choices)
        elif not numbers_:
            why = "a number"
        elif self._type == 2:
            value = numbers_[0] != 0
        elif self._type == 1:
            value = self._clamp(numbers_[0])
            if issubclass(self._kind_of, numbers.Integral):
                value = int(round(value))
        else:
            count = 2 if self._type == 4 else 3
            if len(numbers_) < count:
                why = "%d numbers" % count
            else:
                values = [self._clamp(v) for v in numbers_[:count]]
                if self._type == 6:
                    values[2] = numbers_[2]  # (a yaw is not clamped)
                value = Teleplot.Pose2D(*values) if self._type == 6 else Teleplot.Number2D(*values) if count == 2 else Teleplot.Number3D(*values)
                if self._kind_of in (tuple, list):
                    value = self._kind_of(value)
        if why is None and self._on_change is not None:
            try:
                r = self._on_change(value)
                if isinstance(r, Teleplot.Result) and r.status == 1:
                    why = r.text or "refused"
            except Exception as e:
                why = str(e) or type(e).__name__
        if why is None:
            self.value = value
            self._written_ms = _steady_ms() or 1
        else:
            self._tp._answer(telem_id, self._name, _CALL_ID_SETTING, 1, why)
        self._publish()  # the echo: what is applied

    def _rest(self):
        if self._type == 1:
            self.value = self._kind_of(0)
        elif self._type in (4, 5, 6):
            zero = {4: Teleplot.Number2D(0.0, 0.0), 5: Teleplot.Number3D(0.0, 0.0, 0.0), 6: Teleplot.Pose2D(0.0, 0.0, 0.0)}[self._type]
            self.value = self._kind_of(zero) if self._kind_of in (tuple, list) else zero


class Action:
    """An action the page may call; a decorator when it was given no handler"""

    def __init__(self, tp, name, handler):
        self._tp, self._name, self._handler, self._index = tp, str(name), handler, None
        self._flags = 0
        self._args = []
        self._recent = []

    def __call__(self, fn):
        self._handler = fn
        return fn

    def _attr(self, code, value):
        with self._tp._lock:
            self._tp._attr(self._tp._entries[self._index], code, value)
        return self

    def title(self, text):
        return self._attr(A_TITLE, str(text))

    def desc(self, text):
        return self._attr(A_DESC, str(text))

    def color(self, text):
        return self._attr(A_COLOR, str(text))

    def confirm(self, v=True):
        self._flags = (self._flags | 1) if v else (self._flags & ~1)
        return self._declare()

    def longpress(self, v=True):
        self._flags = (self._flags | 2) if v else (self._flags & ~2)
        return self._declare()

    def arg(self, a):
        self._args.append(a)
        tp = self._tp
        with tp._lock:
            e = tp._entries[self._index]
            choices = "\n".join(a._choices)
            e.args.append(struct.pack("<BBBddd", len(self._args) - 1, a.type, 1 if a.isOptional else 0,
                                      math.nan if a._min is None else a._min, math.nan if a._max is None else a._max,
                                      math.nan if a._step is None else a._step)
                          + _cstr(a.name[:64]) + _cstr(a._unit[:32]) + _cstr(a._default[:128]) + _cstr(choices[:400]) + _cstr(a._desc[:300]))
            line = "ATTR|%s|arg=%s|type=%s" % (self._name, _escape(a.name, "%|,=:\n\r"), _WRITE_TYPES[a.type])
            line += "|optional" if a.isOptional else ""
            if a._default:
                line += "|default=" + _escape(a._default, "%|,=:\n\r")
            for v, key in ((a._min, "min"), (a._max, "max"), (a._step, "step")):
                if v is not None:
                    line += "|%s=%s" % (key, _number_text(v, True))
            for v, key in ((a._unit, "unit"), (a._desc, "desc")):
                if v:
                    line += "|%s=%s" % (key, _escape(v, "%|,=:\n\r"))
            if a._choices:
                line += "|choices=" + ",".join(_escape(c, "%|,=:\n\r") for c in a._choices)
            e.text_args.append(line)
            e.dirty = True
        return self

    def _declare(self):
        return self._attr(A_WRITE, (2, 0, self._flags, None, 0, 0, 0))


class Arg:
    """An argument of an action: Arg(name[, type]), then optional(), defaultValue(), range()..."""
    Number, Bool, Text, XY, XYZ, Pose2D = 1, 2, 3, 4, 5, 6

    def __init__(self, name, type=1):
        if not isinstance(type, int) or not 1 <= type <= 6:
            raise TeleplotError("Arg type: Teleplot.Arg.Number, Bool, Text, XY, XYZ or Pose2D")
        self.name, self.type, self.isOptional = str(name), type, False
        self._default, self._unit, self._desc = "", "", ""
        self._min = self._max = self._step = None
        self._choices = []

    def optional(self, v=True):
        self.isOptional = bool(v)
        return self

    def defaultValue(self, v):
        if isinstance(v, bool):
            self._default = "true" if v else "false"
        elif isinstance(v, numbers.Real):
            self._default = _number_text(v, True)
        elif isinstance(v, str):
            self._default = v
        else:
            self._default = ",".join(_number_text(c, True) for c in _numbers(v))
        return self

    def range(self, min, max):
        self._min, self._max = float(min), float(max)
        return self

    def min(self, v):
        self._min = float(v)
        return self

    def max(self, v):
        self._max = float(v)
        return self

    def step(self, v):
        self._step = float(v)
        return self

    def unit(self, text):
        self._unit = str(text)
        return self

    def choices(self, values):
        self._choices = [str(v) for v in values]
        return self

    def desc(self, text):
        self._desc = str(text)
        return self


class Args:
    """The arguments of a call, by name (an optional one left empty is missing: has() is False, the readers give the fallback)"""

    def __init__(self, values, call):
        self._values, self._call = values, call

    def has(self, name):
        return name in self._values

    def number(self, name, fallback=math.nan):
        v = self._values.get(name)
        return v if isinstance(v, float) else fallback

    def flag(self, name, fallback=False):
        v = self._values.get(name)
        return v if isinstance(v, bool) else fallback

    def text(self, name, fallback=""):
        v = self._values.get(name)
        return v if isinstance(v, str) else fallback

    def xy(self, name, fallback=None):
        v = self._values.get(name)
        return Teleplot.Number2D(*v[:2]) if isinstance(v, list) and len(v) >= 2 else (fallback if fallback is not None else Teleplot.Number2D(0.0, 0.0))

    def xyz(self, name, fallback=None):
        v = self._values.get(name)
        return Teleplot.Number3D(*v[:3]) if isinstance(v, list) and len(v) >= 3 else (fallback if fallback is not None else Teleplot.Number3D(0.0, 0.0, 0.0))

    def pose2d(self, name, fallback=None):
        v = self._values.get(name)
        return Teleplot.Pose2D(*v[:3]) if isinstance(v, list) and len(v) >= 3 else (fallback if fallback is not None else Teleplot.Pose2D(0.0, 0.0, 0.0))

    def call(self):
        return self._call


Teleplot.Param, Teleplot.Action, Teleplot.Arg, Teleplot.Args = Param, Action, Arg, Args


# --------------------------------------------------------------------------------------------------------------- stacks
class Stack:
    """A level of a stack (what runs) while it lives: with Teleplot.Stack(tp, "robot.task", "plan"): ..., or as a decorator"""

    def __init__(self, tp, name, level):
        self._tp, self._name, self._level = tp, str(name), str(level)
        self._local = threading.local()

    def __enter__(self):
        index = self._tp._stack_entry(self._name)
        befores = getattr(self._local, "befores", [])
        self._local.befores = befores
        if index is None:
            befores.append(None)
            return self
        tp = self._tp
        with tp._lock:
            e = tp._entries[index]
            befores.append((index, len(e.stack_path)))
            e.stack_path = (e.stack_path + "/" if e.stack_path else "") + self._level
            path = e.stack_path
        Telemetry(tp, index)._chain(None).update(path)
        return self

    def __exit__(self, *exc):
        before = self._local.befores.pop()
        if before is None:
            return False
        index, length = before
        tp = self._tp
        with tp._lock:
            e = tp._entries[index]
            e.stack_path = e.stack_path[:length]
            path = e.stack_path
        Telemetry(tp, index)._chain(None).update(path)
        return False

    def __call__(self, fn):
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        wrapper.__name__, wrapper.__doc__, wrapper.__wrapped__ = fn.__name__, fn.__doc__, fn
        return wrapper


Teleplot.Stack = Stack


# --------------------------------------------------------------------------------------------------------------- threads
class _Scheduling:
    """How a thread is scheduled (Linux: policy, priority, nice, CPUs): taken from the caller, given to a thread of Teleplot.
    Elsewhere Python cannot set them without native code: a priority or CPUs asked for are refused (the default does nothing)."""
    LINUX = sys.platform.startswith("linux")

    def __init__(self):
        self.policy = self.priority = self.nice = None
        self.cpus = None

    @staticmethod
    def ofCurrentThread():
        s = _Scheduling()
        if _Scheduling.LINUX:
            try:
                s.policy = os.sched_getscheduler(0)
                s.priority = os.sched_getparam(0).sched_priority
                s.nice = os.getpriority(os.PRIO_PROCESS, threading.get_native_id())
                s.cpus = os.sched_getaffinity(0)
            except (OSError, AttributeError):
                pass
        return s

    def apply(self, priority, affinity):
        """Gives the calling thread a priority and CPUs (relative to this scheduling: the caller's). False: refused (part of it)."""
        priority = Teleplot.ThreadPriority._of(priority)
        affinity = affinity or Teleplot.ThreadAffinity.automatic()
        kind = priority.kind
        if not _Scheduling.LINUX:
            return kind == Teleplot.BelowCaller and affinity.kind in (0, 1, 2)
        ok = True
        tid = threading.get_native_id()
        try:
            rt = (os.SCHED_FIFO, os.SCHED_RR)
            if kind == Teleplot.Realtime:
                os.sched_setscheduler(0, os.SCHED_RR if priority.roundRobin else os.SCHED_FIFO, os.sched_param(priority.number))
            elif kind == Teleplot.BelowCaller and self.policy in rt:
                os.sched_setscheduler(0, self.policy, os.sched_param(max(os.sched_get_priority_min(self.policy), self.priority - 1)))
            else:
                os.sched_setscheduler(0, os.SCHED_OTHER, os.sched_param(0))
                if kind == Teleplot.PriorityValue:
                    nice = priority.number
                elif kind == Teleplot.BelowCaller:
                    nice = min(19, (self.nice or 0) + 1)
                else:
                    nice = min(19, os.getpriority(os.PRIO_PROCESS, 0) + (10 if kind == Teleplot.Low else 0))
                os.setpriority(os.PRIO_PROCESS, tid, nice)
        except (OSError, AttributeError, ValueError):
            ok = False
        follow = affinity.kind == 1 or (affinity.kind == 0 and kind == Teleplot.BelowCaller)
        try:
            if follow:
                if self.cpus:
                    os.sched_setaffinity(0, self.cpus)
            elif affinity.kind in (0, 2):
                os.sched_setaffinity(0, os.sched_getaffinity(os.getpid()))
            else:
                if not affinity.list:
                    return False
                os.sched_setaffinity(0, set(affinity.list))
        except (OSError, AttributeError, ValueError):
            ok = False
        return ok

    def same(self, other):
        return other is not None and (self.policy, self.priority, self.nice, self.cpus) == (other.policy, other.priority, other.nice, other.cpus)


# --------------------------------------------------------------------------------------------------------------- pictures
try:
    import numpy as _np
except ImportError:
    _np = None


class TeleplotImage:
    """Pictures: what the pixels a program has need to be sent (as TeleplotImage.h): encode (JPEG, PNG, Raw), load, typeOf, shrink,
    copy, send (encoded on a thread), stats"""
    Gray8, Gray16, Float32, RGB8, BGR8, RGBA8, BGRA8, YUYV = range(8)
    _BYTES = {0: 1, 1: 2, 2: 4, 3: 3, 4: 3, 5: 4, 6: 4, 7: 2}

    class Pixels:
        """A view of pixels: Pixels(data, width, height, format, stride=0); a NumPy array gives its width and height"""

        def __init__(self, data, width=None, height=None, format=None, stride=0):
            if _np is not None and isinstance(data, _np.ndarray):
                array = data
                if format is None:
                    format = {(1, "uint8"): 0, (1, "uint16"): 1, (1, "float32"): 2, (3, "uint8"): 3, (4, "uint8"): 5}.get(
                        (1 if array.ndim == 2 else array.shape[2], str(array.dtype)))
                    if format is None:
                        raise TeleplotError("Pixels: give the format of this array")
                height = array.shape[0] if height is None else height
                if width is None:
                    width = array.shape[1] if format != TeleplotImage.YUYV or array.ndim == 3 else array.shape[1] // 2
                if not array.flags["C_CONTIGUOUS"]:
                    array = _np.ascontiguousarray(array)
                stride = stride or array.strides[0]
                data = array
            if width is None or height is None or format is None:
                raise TeleplotError("Pixels(data, width, height, format[, stride])")
            self.data, self.width, self.height, self.format, self.stride = data, int(width), int(height), int(format), int(stride)

        def rowBytes(self):
            return self.width * TeleplotImage._BYTES[self.format]

        def strideBytes(self):
            return self.stride or self.rowBytes()

        def buffer(self):
            return memoryview(self.data).cast("B") if not isinstance(self.data, (bytes, bytearray)) else memoryview(self.data)

    class Image(Pixels):
        """Pixels it holds (what shrink() and copy() give)"""

    class Picture:
        """An encoded picture: tp.telemetry("camera").image(picture). Empty bytes: it failed, error says why"""

        def __init__(self, type=0, bytes_=b"", error=""):
            self.type, self.bytes, self.error = type, bytes_, error

        def __bool__(self):
            return bool(self.bytes)

        def __repr__(self):
            return "TeleplotImage.Picture(%s, %d bytes%s)" % (["Jpeg", "Png", "Raw"][self.type], len(self.bytes), (", " + repr(self.error)) if self.error else "")

    class Jpeg:
        def __init__(self, quality=80):
            self.quality = quality

    class Png:
        pass

    class Raw:
        pass

    Stats = collections.namedtuple("Stats", "encoded replaced failed priorityRefused")

    # ---------------------------------------------------------------- what is checked, rows
    @staticmethod
    def _check(p):
        if p is None or p.width <= 0 or p.height <= 0:
            return "no pixels"
        if p.format not in TeleplotImage._BYTES:
            return "unknown format"
        if p.format == TeleplotImage.YUYV and p.width % 2:
            return "YUYV needs an even width"
        if p.stride and p.stride < p.rowBytes():
            return "stride shorter than a row"
        if len(p.buffer()) < (p.height - 1) * p.strideBytes() + p.rowBytes():
            return "fewer bytes than width x height"
        return ""

    @staticmethod
    def _rows(p):
        """The rows packed, as bytes"""
        b, line, stride = p.buffer(), p.rowBytes(), p.strideBytes()
        if stride == line:
            return bytes(b[:line * p.height])
        return b"".join(bytes(b[y * stride:y * stride + line]) for y in range(p.height))

    @staticmethod
    def _rgb(p, packed):
        """RGB (3 bytes per pixel) of packed rows of a color format"""
        f = p.format
        if f == TeleplotImage.RGB8:
            return packed
        if f == TeleplotImage.YUYV:
            if _np is not None:
                q = _np.frombuffer(packed, _np.uint8).reshape(-1, 4).astype(_np.int32)
                y = _np.stack([q[:, 0], q[:, 2]], 1).reshape(-1) - 16
                d = _np.repeat(q[:, 1] - 128, 2)
                e = _np.repeat(q[:, 3] - 128, 2)
                rgb = _np.stack([(298 * y + 409 * e + 128) >> 8, (298 * y - 100 * d - 208 * e + 128) >> 8, (298 * y + 516 * d + 128) >> 8], 1)
                return _np.clip(rgb, 0, 255).astype(_np.uint8).tobytes()
            out = bytearray(len(packed) // 2 * 3)
            clip = lambda v: 0 if v < 0 else 255 if v > 255 else v
            for i in range(0, len(packed), 4):
                d, e = packed[i + 1] - 128, packed[i + 3] - 128
                for k, yy in ((0, packed[i]), (1, packed[i + 2])):
                    c = yy - 16
                    o = (i // 2 + k) * 3
                    out[o], out[o + 1], out[o + 2] = clip((298 * c + 409 * e + 128) >> 8), clip((298 * c - 100 * d - 208 * e + 128) >> 8), clip((298 * c + 516 * d + 128) >> 8)
            return bytes(out)
        n = TeleplotImage._BYTES[f]
        out = bytearray(len(packed) // n * 3)
        red, blue = (2, 0) if f in (TeleplotImage.BGR8, TeleplotImage.BGRA8) else (0, 2)
        out[0::3], out[1::3], out[2::3] = packed[red::n], packed[1::n], packed[blue::n]
        return bytes(out)

    # ---------------------------------------------------------------- encoding
    @staticmethod
    def encode(pixels, encoding=None):
        """JPEG (the default: Jpeg(80), Pillow or OpenCV), PNG (Png(): exactly), Raw (Raw(): Gray16 / Float32 as they are)"""
        if encoding is None:
            encoding = TeleplotImage.Jpeg()
        error = TeleplotImage._check(pixels)
        if isinstance(encoding, TeleplotImage.Png):
            return TeleplotImage._png(pixels) if not error else TeleplotImage.Picture(Teleplot.Png, b"", error)
        if isinstance(encoding, TeleplotImage.Raw):
            return TeleplotImage._raw(pixels) if not error else TeleplotImage.Picture(Teleplot.Raw, b"", error)
        if error:
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", error)
        return TeleplotImage._jpeg(pixels, encoding.quality)

    @staticmethod
    def _jpeg(p, quality):
        if p.format == TeleplotImage.Gray16:
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", "a JPEG holds 8 bits: Png() or Raw() for Gray16")
        if p.format == TeleplotImage.Float32:
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", "a JPEG holds 8 bits: Raw() for Float32")
        quality = max(1, min(100, int(quality)))
        packed = TeleplotImage._rows(p)
        gray = p.format == TeleplotImage.Gray8
        data = packed if gray else TeleplotImage._rgb(p, packed)
        try:
            from PIL import Image as _PILImage
            out = io.BytesIO()
            _PILImage.frombytes("L" if gray else "RGB", (p.width, p.height), data).save(out, "JPEG", quality=quality, subsampling=2)
            return TeleplotImage.Picture(Teleplot.Jpeg, out.getvalue())
        except ImportError:
            pass
        try:
            import cv2
            array = _np.frombuffer(data, _np.uint8).reshape(p.height, p.width) if gray else \
                _np.frombuffer(data, _np.uint8).reshape(p.height, p.width, 3)[:, :, ::-1]
            ok, encoded = cv2.imencode(".jpg", _np.ascontiguousarray(array), [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            if ok:
                return TeleplotImage.Picture(Teleplot.Jpeg, encoded.tobytes())
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", "OpenCV could not encode it")
        except ImportError:
            pass
        return TeleplotImage.Picture(Teleplot.Jpeg, b"", "a JPEG needs Pillow or OpenCV: install one, or Png()")

    @staticmethod
    def _png(p):
        if p.format == TeleplotImage.Float32:
            return TeleplotImage.Picture(Teleplot.Png, b"", "a PNG holds whole numbers: Raw() for Float32")
        packed = TeleplotImage._rows(p)
        f = p.format
        if f == TeleplotImage.Gray16:
            values = memoryview(packed).cast("H")
            data, depth, color, bpp = struct.pack(">%dH" % len(values), *values) if _np is None else _np.frombuffer(packed, "<u2").astype(">u2").tobytes(), 16, 0, 2
        elif f == TeleplotImage.Gray8:
            data, depth, color, bpp = packed, 8, 0, 1
        elif f in (TeleplotImage.RGBA8, TeleplotImage.BGRA8):
            data = bytearray(packed)
            if f == TeleplotImage.BGRA8:
                data[0::4], data[2::4] = packed[2::4], packed[0::4]
            data, depth, color, bpp = bytes(data), 8, 6, 4
        else:
            data, depth, color, bpp = TeleplotImage._rgb(p, packed), 8, 2, 3
        line = p.width * bpp
        if _np is not None:  # each row filtered: Sub, Up or Paeth, the one with the smallest sum (as PNG encoders do)
            rows = _np.frombuffer(data, _np.uint8).reshape(p.height, line).astype(_np.int16)
            up = _np.vstack([_np.zeros((1, line), _np.int16), rows[:-1]])
            left = _np.hstack([_np.zeros((p.height, bpp), _np.int16), rows[:, :-bpp]])
            corner = _np.hstack([_np.zeros((p.height, bpp), _np.int16), up[:, :-bpp]])
            pa, pb, pc = _np.abs(up - corner), _np.abs(left - corner), _np.abs(left + up - 2 * corner)
            paeth = _np.where((pa <= pb) & (pa <= pc), left, _np.where(pb <= pc, up, corner))
            candidates = [rows, rows - left, rows - up, rows - paeth]
            filters = [0, 1, 2, 4]
            costs = _np.stack([_np.abs(((c + 128) % 256) - 128).sum(1) for c in candidates])
            best = costs.argmin(0)
            out = _np.empty((p.height, line + 1), _np.uint8)
            out[:, 0] = _np.array(filters, _np.uint8)[best]
            stacked = _np.stack(candidates) % 256
            out[:, 1:] = stacked[best, _np.arange(p.height)]
            raw = out.tobytes()
        else:  # rows not filtered: bigger, never wrong
            raw = b"".join(b"\0" + data[y * line:(y + 1) * line] for y in range(p.height))

        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", p.width, p.height, depth, color, 0, 0, 0)) + \
            chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
        return TeleplotImage.Picture(Teleplot.Png, png)

    @staticmethod
    def _raw(p):
        """{width[16]} {height[16]} {format[8]: 0 gray16, 1 float32} {3 bytes at 0}, then the numbers, rows packed, little-endian"""
        if p.format not in (TeleplotImage.Gray16, TeleplotImage.Float32):
            return TeleplotImage.Picture(Teleplot.Raw, b"", "Raw() is for numbers: Gray16 or Float32")
        if p.width > 65535 or p.height > 65535:
            return TeleplotImage.Picture(Teleplot.Raw, b"", "too big for a Raw picture")
        packed = TeleplotImage._rows(p)
        if sys.byteorder == "big":
            values = memoryview(packed).cast("H" if p.format == TeleplotImage.Gray16 else "f")
            packed = struct.pack("<%d%s" % (len(values), "H" if p.format == TeleplotImage.Gray16 else "f"), *values)
        header = struct.pack("<HHB3x", p.width, p.height, 1 if p.format == TeleplotImage.Float32 else 0)
        return TeleplotImage.Picture(Teleplot.Raw, header + packed)

    # ---------------------------------------------------------------- files
    @staticmethod
    def typeOf(data):
        """Teleplot.Jpeg, Teleplot.Png, or None, from the first bytes"""
        b = bytes(data[:8])
        if b[:3] == b"\xff\xd8\xff":
            return Teleplot.Jpeg
        if b == b"\x89PNG\r\n\x1a\n":
            return Teleplot.Png
        return None

    @staticmethod
    def load(path):
        """A .jpg / .png file, as it is (recognized by its first bytes)"""
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", "cannot open %s" % path)
        kind = TeleplotImage.typeOf(data)
        if kind is None:
            return TeleplotImage.Picture(Teleplot.Jpeg, b"", "%s is not a JPEG nor a PNG" % path)
        return TeleplotImage.Picture(kind, data)

    @staticmethod
    def copy(p):
        """Pixels it holds, rows packed (what send() keeps: the buffer of a camera is used again at once)"""
        if TeleplotImage._check(p):
            return TeleplotImage.Image(b"", 0, 0, p.format if p else 0)
        return TeleplotImage.Image(TeleplotImage._rows(p), p.width, p.height, p.format)

    @staticmethod
    def shrink(p, factor):
        """Smaller by a whole factor: each pixel the average of factor x factor pixels (needs NumPy); YUYV gives RGB8; not Float32"""
        if _np is None:
            raise TeleplotError("shrink() needs NumPy")
        factor = int(factor)
        if TeleplotImage._check(p) or factor < 1 or p.format == TeleplotImage.Float32:
            return TeleplotImage.Image(b"", 0, 0, p.format if p else 0)
        packed = TeleplotImage._rows(p)
        fmt = TeleplotImage.RGB8 if p.format == TeleplotImage.YUYV else p.format
        if p.format == TeleplotImage.YUYV:
            packed = TeleplotImage._rgb(p, packed)
        channels = 1 if fmt in (TeleplotImage.Gray8, TeleplotImage.Gray16) else 4 if fmt in (TeleplotImage.RGBA8, TeleplotImage.BGRA8) else 3
        dtype = _np.uint16 if fmt == TeleplotImage.Gray16 else _np.uint8
        w, h = p.width // factor, p.height // factor
        if w == 0 or h == 0:
            return TeleplotImage.Image(b"", 0, 0, fmt)
        a = _np.frombuffer(packed, dtype).reshape(p.height, p.width, channels)[:h * factor, :w * factor].astype(_np.uint64)
        s = a.reshape(h, factor, w, factor, channels).sum((1, 3))
        count = factor * factor
        out = ((s + count // 2) // count).astype(dtype)
        return TeleplotImage.Image(out.reshape(h, w * channels if channels > 1 else w).tobytes(), w, h, fmt)

    # ---------------------------------------------------------------- on a thread
    @staticmethod
    def send(telemetry, pixels, *rest):
        """send(telemetry, pixels[, time][, Jpeg() | Png() | Raw()]): encoded on the thread of the Teleplot, then sent, dated when
        asked (or at time). The pixels are copied first (an Image is taken as it is)."""
        when, encoding = None, TeleplotImage.Jpeg()
        for r in rest:
            if isinstance(r, (TeleplotImage.Jpeg, TeleplotImage.Png, TeleplotImage.Raw)):
                encoding = r
            else:
                when = r
        tp = telemetry.teleplot()
        image = pixels if isinstance(pixels, TeleplotImage.Image) else TeleplotImage.copy(pixels)
        ns = _ns(when) if when is not None else tp._now_ns()
        tp._extension(_Encoder).submit(telemetry, image, encoding, ns)

    @staticmethod
    def stats(tp):
        return tp._extension(_Encoder).stats()


class _Encoder:
    """The encoding thread of a Teleplot: a slot per telemetry; the picture being encoded always finishes and is sent, of the ones
    asked meanwhile only the latest is kept"""

    def __init__(self, tp):
        self._tp = tp
        self._lock = threading.Condition()
        self._pending, self._order = {}, []
        self._thread, self._stop, self._next = None, False, 0
        self._stats = dict(encoded=0, replaced=0, failed=0, priorityRefused=0)
        self._stats_at, self._stats_before = 0, None

    def submit(self, telemetry, image, encoding, ns):
        name = telemetry.name()
        with self._lock:
            if name not in self._pending:
                self._order.append(name)
            elif self._pending[name] is not None:
                self._stats["replaced"] += 1
            self._pending[name] = (telemetry, image, encoding, ns, _Scheduling.ofCurrentThread())
            if self._thread is None:
                self._thread = threading.Thread(target=self._run, name="teleplot images", daemon=True)
                self._thread.start()
            self._lock.notify()

    def stats(self):
        with self._lock:
            return TeleplotImage.Stats(**self._stats)

    def close(self):
        with self._lock:
            self._stop = True
            self._lock.notify_all()
        if self._thread is not None:
            self._thread.join()

    def _run(self):
        applied = None
        while True:
            with self._lock:
                self._lock.wait_for(lambda: self._stop or any(v is not None for v in self._pending.values()))
                if self._stop:
                    self._stats["replaced"] += sum(1 for v in self._pending.values() if v is not None)
                    return
                for k in range(len(self._order)):
                    name = self._order[(self._next + k) % len(self._order)]
                    if self._pending[name] is not None:
                        job, self._pending[name] = self._pending[name], None
                        self._next = (self._next + k + 1) % len(self._order)
                        break
            telemetry, image, encoding, ns, caller = job
            priority, affinity = self._tp.threadPriority(), self._tp.threadAffinity()
            key = (priority.kind, priority.number, priority.roundRobin, affinity.kind, tuple(affinity.list))
            if applied is None or applied[0] != key or not applied[1].same(caller):
                if not caller.apply(priority, affinity):
                    with self._lock:
                        self._stats["priorityRefused"] += 1
                applied = (key, caller)
            picture = TeleplotImage.encode(image, encoding)
            with self._lock:
                self._stats["encoded" if picture else "failed"] += 1
            if picture:
                telemetry.at(Teleplot.ns(ns)).image(picture)
            self._stats_due()

    def _stats_due(self):  # its stats as telemetries, when the Teleplot sends its own (sendStats)
        every = self._tp._stats_every
        now = _steady_ms()
        if every <= 0:
            self._stats_at = 0
            return
        current = self.stats()
        if self._stats_at == 0:
            self._stats_at, self._stats_before = now, current
            return
        if now - self._stats_at < every * 1000:
            return
        seconds = (now - self._stats_at) / 1000.0
        tp, before = self._tp, self._stats_before
        tp.telemetry("teleplot.images.encoded").unit("/s").label("teleplot images").desc("Pictures encoded per second").update((current.encoded - before.encoded) / seconds)
        tp.telemetry("teleplot.images.replaced").unit("/s").label("teleplot images").desc("Pictures replaced by a newer one before they were encoded, per second").update((current.replaced - before.replaced) / seconds)
        tp.telemetry("teleplot.images.failed").label("teleplot images").desc("Pictures that could not be encoded, since the start").update(current.failed)
        self._stats_at, self._stats_before = now, current
