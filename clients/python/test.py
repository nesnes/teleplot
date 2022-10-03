import socket
import math
import time
import random

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def format_unit(unit):
	if (unit == None or unit == ""):
		return "" 
	return (":" + unit)

def sendTelemetry(name, value, unit, useTime):
	now = time.time() * 1000
	
	msg = name+":"+str(now)+":"+str(value)+format_unit(unit)+"|g"
	if (not useTime):
		msg = name+":"+str(value)+format_unit(unit)+"|g"

	if (unit):
		msg += ", unit"

	sock.sendto(msg.encode(), teleplotAddr)

def sendTelemetryXY(name, x, y, x1, y1, unit):
	
	msg = name+":"+str(x)+":"+str(y)+";" +str(x1)+":"+str(y1)+format_unit(unit)+"|xy"
	if (unit):
		msg += ", unit"
	sock.sendto(msg.encode(), teleplotAddr)

i=0
currentRobotState = "standing"

while True:
	
	sendTelemetry("sin", math.sin(i), "my_weird@ unit $", True)
	sendTelemetry("cos", math.cos(i), None, False)
	sendTelemetryXY("XY_", math.sin(i),math.cos(i), math.sin(i+0.1), math.cos(i+0.1), "km²")

	if (random.randint(0, 1000) >= 999 ):
		if (currentRobotState == "standing") :
			currentRobotState = "sitted"
		else :
			currentRobotState = "standing"

	sendTelemetry("robot_state", currentRobotState ,"", True)
	

	i+=0.1
	time.sleep(0.01)