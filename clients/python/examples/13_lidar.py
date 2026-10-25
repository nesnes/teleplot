# 13. A point cloud (a lidar scan): all the points of a scan are one sample, in the frame of the sensor.
# The sensor is placed in the scene like a shape; the page draws each scan where the sensor was. A NumPy array (N x 3) works too.
import math
import time
from teleplot import Teleplot

tp = Teleplot.instance()
lidar = tp.telemetry("lidar")
lidar.position(0, 0, 0.2)  # where the sensor is

while True:
    t = time.time()
    scan = []
    for i in range(72):
        angle = i * 2 * math.pi / 72
        distance = 2 + 0.5 * math.sin(angle * 3 + t)  # a wall that moves
        scan.append((distance * math.cos(angle), distance * math.sin(angle), 0))
    lidar.cloud(scan)
    time.sleep(0.2)
