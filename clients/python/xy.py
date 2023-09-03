import socket
import math
import time

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def sendTelemetryXY(name, valueX, valueY, clear=False):
	now = time.time() * 1000
	msg = name+":"+str(valueX)+":"+str(valueY)+":"+str(now)+"|xy"+("clr" if clear else "")
	sock.sendto(msg.encode(), teleplotAddr)

i=0
while True:
	
	# Clear telemetry when completing a circle
	clear = False
	if( i > 2 * math.pi):
		i = 0
		clear=True
	
	sendTelemetryXY("circle", math.sin(i), math.cos(i), clear)
	i+=0.1
	time.sleep(0.01)