import socket
import math
import time
import random

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def format_unit(unit):
	if (unit == None or unit == ""):
		return "" 
	return ("§" + unit)

def sendTelemetry(name, value, unit, useTime):
	now = time.time() * 1000
	
	msg = name+":"+str(now)+":"+str(value)+format_unit(unit)+"|g"
	if (not useTime):
		msg = name+":"+str(value)+format_unit(unit)+"|g"

	sock.sendto(msg.encode(), teleplotAddr)

def sendTelemetryXY(name, x, y, x1, y1, unit):
	
	msg = name+":"+str(x)+":"+str(y)+";" +str(x1)+":"+str(y1)+format_unit(unit)+"|xy"
	
	sock.sendto(msg.encode(), teleplotAddr)


def sendMultipleTelemTest():
	msg = "myValue:1627551892444:1;1627551892555:2;1627551892666:3|g\n\
	mySecondValue:1627551892444:1;1627551892555:2;1627551892666:3§rad|g\n\
	myThirdValue:1627551892437:1234|g\n\
	state:state_a|g\n\
	state2:1627551892444:state_a;1627551892555:state_b|g\n\
	trajectory:1:1;2:2;3:3;4:4|xy\n\
	trajectoryTimestamped:1:1:1627551892437;2:2:1627551892448;3:3:1627551892459|xy"

	sock.sendto(msg.encode(), teleplotAddr)

def basicTest():
	i=0
	currentRobotState = "standing"
	while True:
		
		# sendTelemetry("sin_unit", math.sin(i), "my_weird@ unit $", True)
		sendTelemetry("cos_no_time", math.cos(i), "", False)
		sendTelemetry("cos_time", math.cos(i), "", True)
		# sendTelemetry("cos_no_time_unit", math.cos(i), "kilos", False)
		# sendTelemetry("cos", math.cos(i), "", True)

		#sendTelemetryXY("XY_", math.sin(i),math.cos(i), math.sin(i+0.1), math.cos(i+0.1), "")

		# if (random.randint(0, 1000) >= 999 ):
		# 	if (currentRobotState == "standing") :
		# 		currentRobotState = "sitted"
		# 	else :
		# 		currentRobotState = "standing"

		# sendTelemetry("robot_state", currentRobotState ,"", True)
		# sendTelemetry("robot_state_no_time", currentRobotState ,"", False)
		# sendTelemetry("robot_state_no_time_unit", currentRobotState ,"km/h", False)
		# sendTelemetry("robot_state_unit", currentRobotState ,"m²", True)
		

		i+=0.1
		time.sleep(0.01)


#sendMultipleTelemTest()
basicTest()
