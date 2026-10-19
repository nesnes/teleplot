"""
Teleplot client for Python: telemetry (text protocol, UDP) and commands from the page (telecmd, doc/telecmd.md).

    import teleplot
    tp = teleplot.Teleplot()                     # 127.0.0.1:47269, the Teleplot server
    tp.send("temperature", 25.3)

    kp = tp.param("kp", 0.4, min=0, max=10, step=0.01, desc="Proportional gain")
    mode = tp.param("mode", "auto", choices=["auto", "manual"])
    drive = tp.param("cmd_vel", (0.0, 0.0, 0.0), type="pose2d", axes=["x", "yaw"], rate=20, hold=200)

    @tp.action("goto", title="Go to", args=[teleplot.Arg("target", "xy"), teleplot.Arg("speed", optional=True, default=0.3)])
    def goto(target, speed=0.3):
        ...                                       # return nothing (ok), a text (ok, with a result), or raise (err)

    while True:
        tp.poll()                                 # reads what the page wrote, applies it, answers, publishes the settings
        motor.kp = kp.value

What it does for the device: declares the settings and actions (again every few seconds: a page may connect late), publishes the
applied value of each setting after a write and periodically (that is how the page knows it was applied), clamps a number to its
range and rounds it to its step before applying it, runs a call once and answers it again when it comes back, and gives a
continuous setting its rest value when nothing came for "hold" ms. Commands come back on the socket the telemetry is sent from:
the Teleplot server sends them to the address and port the packets came from.
"""
import socket
import time
import traceback

TYPES = ("number", "bool", "text", "xy", "xyz", "pose2d")
_ESCAPE = "%:,=|\n\r"


def _escape(text):
    return "".join("%%%02X" % ord(c) if c in _ESCAPE else c for c in str(text))


def _unescape(text):
    out, i = "", 0
    while i < len(text):
        if text[i] == "%" and i + 3 <= len(text):
            try:
                out += chr(int(text[i + 1:i + 3], 16))
                i += 3
                continue
            except ValueError:
                pass
        out += text[i]
        i += 1
    return out


def _number(value):
    value = float(value)
    return str(int(value)) if value.is_integer() else repr(value)


class Arg:
    """An argument of an action: name, type (number, bool, text, xy, xyz, pose2d), optional, default, min, max, step, unit, choices, desc"""
    def __init__(self, name, type="number", optional=False, default=None, min=None, max=None, step=None, unit=None, choices=None, desc=None):
        assert type in TYPES, "type: " + ", ".join(TYPES)
        self.name, self.type, self.optional, self.default = name, type, optional, default
        self.min, self.max, self.step, self.unit, self.choices, self.desc = min, max, step, unit, choices, desc

    def declaration(self, action):
        line = "ATTR|%s|arg=%s|type=%s" % (action, _escape(self.name), self.type)
        if self.optional:
            line += "|optional"
        for key in ("default", "min", "max", "step", "unit", "desc"):
            if getattr(self, key) is not None:
                line += "|%s=%s" % (key, _escape(getattr(self, key)))
        if self.choices:
            line += "|choices=" + ",".join(_escape(c) for c in self.choices)
        return line

    def read(self, text):
        if self.type in ("xy", "xyz", "pose2d"):
            return tuple(float(v) for v in text.split(","))
        if self.type == "bool":
            return text not in ("0", "false", "")
        if self.type == "text":
            return _unescape(text)
        return float(text)


class Param:
    """A setting the page may change. .value is what is applied (read it in your loop)."""
    def __init__(self, client, name, value, type, min, max, step, choices, unit, desc, rate, hold, axes, on_change):
        self.client, self.name, self.value, self.type = client, name, value, type
        self.min, self.max, self.step, self.choices, self.unit, self.desc = min, max, step, choices, unit, desc
        self.rate, self.hold, self.axes, self.on_change = rate, hold, axes, on_change
        self.written_at = None  # When the page last wrote it (continuous ones go back to rest after "hold" ms)

    def declaration(self):
        line = "ATTR|%s|write=%s" % (self.name, self.type)
        for key in ("min", "max", "step", "rate", "hold", "unit", "desc"):
            if getattr(self, key) is not None:
                line += "|%s=%s" % (key, _escape(getattr(self, key)))
        if self.choices:
            line += "|choices=" + ",".join(_escape(c) for c in self.choices)
        if self.axes:
            line += "|axes=" + ",".join(self.axes)
        return line

    def line(self):
        """The value as the text protocol says it (that is also its echo)"""
        if self.type in ("xy", "xyz", "pose2d"):
            return "%s:%s|%s" % (self.name, ":".join(_number(v) for v in self.value), "xy" if self.type == "xy" else "xyz")
        if self.type == "text":
            return "%s:%s|t" % (self.name, str(self.value).replace("\n", " "))
        if self.type == "bool":
            return "%s:%d" % (self.name, 1 if self.value else 0)
        return "%s:%s" % (self.name, _number(self.value))

    def apply(self, text):
        """What the page wrote: read, clamped to the range, rounded to the step. Returns an error text, or None."""
        if self.type in ("xy", "xyz", "pose2d"):
            values = [float(v) for v in text.split(":")]
            if len(values) != (2 if self.type == "xy" else 3):
                return "%d numbers" % (2 if self.type == "xy" else 3)
            value = tuple(self._clamp(v) for v in values)
        elif self.type == "bool":
            value = text.strip() not in ("0", "false", "")
        elif self.type == "text":
            value = _unescape(text)
            if self.choices and value not in self.choices:
                return "one of " + ", ".join(self.choices)
        else:
            value = self._clamp(float(text))
        if self.on_change is not None:
            refused = self.on_change(value)  # Return a text to refuse the value (it is sent as ACK|name:err:text)
            if refused:
                return str(refused)
        self.value = value
        self.written_at = time.monotonic()
        return None

    def _clamp(self, v):
        if self.min is not None:
            v = max(self.min, v)
        if self.max is not None:
            v = min(self.max, v)
        if self.step:
            base = self.min if self.min is not None else 0
            v = round(round((v - base) / self.step) * self.step + base, 9)
        return v


class Teleplot:
    def __init__(self, address="127.0.0.1", port=47269, declare_every=5.0, publish_every=0.2):
        self.address = (address, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("", 0))  # One socket to send and to receive: the server answers where the packets come from
        self.sock.setblocking(False)
        self.params, self.actions = {}, {}
        self.declare_every, self.publish_every = declare_every, publish_every
        self._declared_at, self._published_at = -1e9, -1e9
        self._calls = {}  # "name#id" -> what was answered (a call sent again is answered again, never run twice)

    # ------------------------------------------------------------------ telemetry
    def send_lines(self, lines):
        if lines:
            self.sock.sendto("\n".join(lines).encode(), self.address)

    def send(self, name, value, unit=None, flags=None):
        """A sample: a number, a text (flags="t"), a tuple of 2 or 3 numbers (xy, xyz)"""
        if isinstance(value, (tuple, list)):
            text, flags = ":".join(_number(v) for v in value), flags or ("xy" if len(value) == 2 else "xyz")
        elif isinstance(value, str):
            text, flags = value, flags or "t"
        else:
            text = _number(value)
        self.send_lines(["%s:%s%s%s" % (name, text, "§" + unit if unit else "", "|" + flags if flags else "")])

    # ------------------------------------------------------------------ commands
    def param(self, name, value, type=None, min=None, max=None, step=None, choices=None, unit=None, desc=None, rate=None, hold=None, axes=None, on_change=None):
        """Declares a setting the page may write. type: number, bool, text, xy, xyz, pose2d (guessed from the value when not given).
        rate and hold: continuous (a joystick); on_change(value) may return a text to refuse the value."""
        if type is None:
            type = "bool" if isinstance(value, bool) else "text" if isinstance(value, str) else ({2: "xy", 3: "xyz"}.get(len(value)) if isinstance(value, (tuple, list)) else "number")
        assert type in TYPES, "type: " + ", ".join(TYPES)
        self.params[name] = Param(self, name, value, type, min, max, step, choices, unit, desc, rate, hold, axes, on_change)
        self._declared_at = -1e9
        return self.params[name]

    def action(self, name, title=None, desc=None, args=(), confirm=False, longpress=False, color=None):
        """Declares an action (a decorator). The function gets the arguments by name; it returns nothing or a text (ok), or raises (err)."""
        def register(fn):
            self.actions[name] = {"fn": fn, "title": title, "desc": desc, "args": list(args), "confirm": confirm, "longpress": longpress, "color": color}
            self._declared_at = -1e9
            return fn
        return register

    def declare(self):
        lines = [p.declaration() for p in self.params.values()]
        for name, a in self.actions.items():
            line = "ATTR|%s|action" % name
            for key in ("title", "desc", "color"):
                if a[key]:
                    line += "|%s=%s" % (key, _escape(a[key]))
            line += "|confirm" if a["confirm"] else ""
            line += "|longpress" if a["longpress"] else ""
            lines.append(line)
            lines += [arg.declaration(name) for arg in a["args"]]
        self.send_lines(lines)
        self._declared_at = time.monotonic()

    def publish(self):
        self.send_lines([p.line() for p in self.params.values()])
        self._published_at = time.monotonic()

    def handle(self, line):
        """A line written by the page: "name:value" for a setting, "!name#id:arg=value:..." for a call"""
        line = line.strip()
        if not line:
            return
        if line.startswith("!"):
            head, *fields = line[1:].split(":")
            name, _, call_id = head.partition("#")
            if head in self._calls:
                return self.send_lines(["ACK|%s:%s" % (head, self._calls[head])])
            action = self.actions.get(name)
            if action is None:
                return self.send_lines(["ACK|%s:err:unknown action" % head])
            args, known = {}, {a.name: a for a in action["args"]}
            try:
                for field in fields:
                    key, _, value = field.partition("=")
                    key = _unescape(key)
                    if key in known:
                        args[key] = known[key].read(value)
                missing = [a.name for a in action["args"] if not a.optional and a.name not in args]
                if missing:
                    raise ValueError("missing " + ", ".join(missing))
                self.send_lines(["ACK|%s:run" % head])
                result = action["fn"](**args)
                answer = "ok" + (":" + _escape(result) if result else "")
            except Exception as e:  # The device says why
                answer = "err:" + _escape(str(e) or type(e).__name__)
            self._calls[head] = answer
            if len(self._calls) > 100:
                self._calls.pop(next(iter(self._calls)))
            return self.send_lines(["ACK|%s:%s" % (head, answer)])
        name, _, value = line.partition(":")
        param = self.params.get(name)
        if param is None:
            return  # Not declared: ignored
        try:
            error = param.apply(value)
        except ValueError:
            error = "not a value of its type"
        if error:
            self.send_lines(["ACK|%s:err:%s" % (name, _escape(error))])
        self.send_lines([param.line()])  # The echo: what is applied

    def poll(self):
        """Call it often (in your loop): reads what the page wrote, declares and publishes when it is time"""
        while True:
            try:
                data, _ = self.sock.recvfrom(65536)
            except (BlockingIOError, InterruptedError):
                break
            except OSError:
                break
            for line in data.decode(errors="replace").split("\n"):
                try:
                    self.handle(line)
                except Exception:
                    traceback.print_exc()
        now = time.monotonic()
        for p in self.params.values():  # A continuous setting nobody drives any more goes back to rest
            if p.hold and p.written_at is not None and now - p.written_at > p.hold / 1000:
                p.value = tuple(0.0 for _ in p.value) if isinstance(p.value, tuple) else 0.0
                p.written_at = None
                self.send_lines([p.line()])
        if now - self._declared_at >= self.declare_every:
            self.declare()
        if now - self._published_at >= self.publish_every:
            self.publish()
