# Runs an example for about a second (python3 run_example.py <example.py> <output prefix>): what its Teleplot clients send is also
# written to <prefix>.teleplot (binary) and <prefix>.teleplot.txt (text), for examples.test.js to read with the library of the page.
import os
import runpy
import struct
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import teleplot  # noqa: E402

example, prefix = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
clients, captured = [], []
initialize = teleplot.Teleplot.__init__


def capturing_init(self, **options):  # every client also writes what it sends here
    outputs = options.get("output")
    outputs = [outputs] if callable(outputs) else list(outputs or [])
    options["output"] = outputs + [lambda data, client=self: captured.append((client._text, data))]
    initialize(self, **options)
    clients.append(self)


teleplot.Teleplot.__init__ = capturing_init
real_sleep, started = time.sleep, time.monotonic()


def short_sleep(seconds):  # the example runs for about a second
    if time.monotonic() - started > 1.2:
        raise SystemExit
    real_sleep(min(seconds, 0.05))


time.sleep = short_sleep
os.chdir(os.path.dirname(prefix) or ".")
sys.argv = [example]
try:
    runpy.run_path(example, run_name="__main__")
except SystemExit:
    pass
for client in clients:
    client.close()
with open(prefix + ".teleplot", "wb") as binary, open(prefix + ".teleplot.txt", "wb") as text:
    binary.write(bytes([0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00]))
    for is_text, data in captured:
        if is_text:
            text.write(data)
        else:
            binary.write(struct.pack("<I", len(data)) + data)
