# Teleplot for Python

`teleplot.py` (one file, no dependency): telemetry over UDP in the text protocol ([doc/textProtocol.md](../../doc/textProtocol.md)),
and the settings and actions the page can use ([doc/telecmd.md](../../doc/telecmd.md)).

```python
import teleplot
tp = teleplot.Teleplot()                     # 127.0.0.1:47269, the Teleplot server
tp.send("temperature", 25.3)

kp = tp.param("kp", 0.4, min=0, max=10, step=0.01, desc="Proportional gain")

@tp.action("goto", title="Go to", args=[teleplot.Arg("target", "xy")])
def goto(target):
    drive_to(*target)                        # return a text (a result) or raise (an error)

while True:
    tp.poll()                                # reads what the page wrote, answers, publishes the settings
    controller.kp = kp.value
```

Tests: `python3 test_teleplot.py` (a fake Teleplot server, no dependency).

The other files are small samples written for Teleplot V1, plain sockets without the library: `main.py` (sine waves), `xy.py`
(positions), `imu.py` (a serial IMU relayed over UDP, needs `pyserial`), `mickey.py` (3D spheres),
`full_test.py`, `test_log.py` (many telemetries, texts and logs from threads).
