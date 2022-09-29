import socket
import math
import time

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def format_unit(unit):
	if (unit == ""):
		return "" 
		
	return (":" + unit)

def sendTelemetry(name, value, unit=""):
	now = time.time() * 1000
	msg = name+":"+str(now)+":"+str(value)+format_unit(unit)+"|g"
	sock.sendto(msg.encode(), teleplotAddr)

def sendTelemetryXY(name, x, y, x1, y1, unit=""):
	
	msg = name+":"+str(x)+":"+str(y)+";" +str(x1)+":"+str(y1)+format_unit(unit)+"|xy"
	sock.sendto(msg.encode(), teleplotAddr)

i=0
while True:
	
	sendTelemetry("sin", math.sin(i), "my_weird@ unit $")
	sendTelemetry("cos", math.cos(i), )
	sendTelemetryXY("XY_", math.sin(i),math.cos(i), math.sin(i+0.1), math.cos(i+0.1), "km²")

	i+=0.1
	time.sleep(0.01)