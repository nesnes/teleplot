# Test of the commands of teleplot.py against a fake Teleplot server (no dependency): python3 test_teleplot.py
import os
import sys, socket, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import teleplot
# A fake server: receives what the client sends, writes back as the Teleplot server would
srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); srv.bind(("127.0.0.1", 0)); srv.settimeout(1)
tp = teleplot.Teleplot("127.0.0.1", srv.getsockname()[1])
kp = tp.param("kp", 0.4, min=0, max=10, step=0.01)
mode = tp.param("mode", "auto", choices=["auto", "manual"])
drive = tp.param("cmd_vel", (0.0, 0.0, 0.0), type="pose2d", axes=["x", "yaw"], rate=20, hold=100)
done = []
@tp.action("goto", title="Go to", args=[teleplot.Arg("target", "xy"), teleplot.Arg("speed", optional=True, default=0.3)])
def goto(target, speed=0.3):
    done.append((target, speed)); return "arrived"
tp.poll()
received = []
def drain():
    try:
        while True:
            data, addr = srv.recvfrom(65536); received.extend(data.decode().split("\n")); globals()["client"] = addr
    except socket.timeout:
        pass
drain()
assert "ATTR|kp|write=number|min=0|max=10|step=0.01" in received, received
assert "ATTR|goto|action|title=Go to" in received and "ATTR|goto|arg=target|type=xy" in received
assert "ATTR|cmd_vel|write=pose2d|rate=20|hold=100|axes=x,yaw" in received, received
received.clear()
for line in ["kp:12.345", "mode:manual", "mode:fast", "cmd_vel:0.5:0:0.2", "!goto#7:target=1.5,2", "!goto#7:target=1.5,2", "!goto#8:speed=1", "unknown:1"]:
    srv.sendto(line.encode(), client)
time.sleep(0.05); tp.poll(); drain()
assert kp.value == 10 and "kp:10" in received, received
assert mode.value == "manual" and "ACK|mode:err:one of auto%2C manual" in received
assert drive.value == (0.5, 0.0, 0.2)
assert done == [((1.5, 2.0), 0.3)], done
assert received.count("ACK|goto#7:ok:arrived") == 2 and "ACK|goto#7:run" in received
assert "ACK|goto#8:err:missing target" in received
time.sleep(0.15); received.clear(); tp.poll(); drain()
assert drive.value == (0.0, 0.0, 0.0) and "cmd_vel:0:0:0|xyz" in received, received
print("python client ok")
