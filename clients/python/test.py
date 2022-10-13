import socket
import math
import time
import random
import threading

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
	th = threading.Thread(target=basicTestSub)
	th.start()

def basicTestSub():
	i=0
	currentRobotState = "standing"
	while True:
		
		sendTelemetry("sin_unit", math.sin(i), "my_weird@ unit $", True)
		sendTelemetry("cos_no_time", math.cos(i), "", False)
		sendTelemetry("cos_time", math.cos(i), "", True)
		sendTelemetry("cos_no_time_unit", math.cos(i), "kilos", False)
		sendTelemetry("cos", math.cos(i), "", True)

		sendTelemetryXY("XY_", math.sin(i),math.cos(i), math.sin(i+0.1), math.cos(i+0.1), "km²")

		if (random.randint(0, 1000) >= 999 ):
			if (currentRobotState == "standing") :
				currentRobotState = "sitted"
			else :
				currentRobotState = "standing"

		sendTelemetry("robot_state", currentRobotState ,"", True)
		sendTelemetry("robot_state_no_time", currentRobotState ,"", False)
		sendTelemetry("robot_state_no_time_unit", currentRobotState ,"km/h", False)
		sendTelemetry("robot_state_unit", currentRobotState ,"m²", True)
		

		i+=0.1
		time.sleep(0.01)

def testThreeD():
	th1 = threading.Thread(target=testThreeD_sub)
	th1.start()

def testThreeD_sub():
	i = 0
	sphereRadius = 3
	cubeDepth = 5

	while True:

		msg1 = '3D|myData2:{"rotation":{"x":0,"y":0,"z":0},"position":{"x":0,"y":0,"z":0},"shape":"cube","width":5,"height":4,"depth":'+str(cubeDepth)+',"color":"blue"}|g'
		msg2 = '3D|myData1:{"rotation":{"x":0,"y":0,"z":0},"position":{"x":0,"y":0,"z":0},"precision":15,"radius":'+str(sphereRadius)+', "shape":"sphere"}|g'
	
		randomNb = random.randint(0, 100) 

		if ( randomNb== 1):
			sphereRadius += 1
		elif (randomNb == 2):
			sphereRadius  = max(sphereRadius-1, 1)
		elif (randomNb == 3):
			cubeDepth  += 1
		elif (randomNb == 4):
			cubeDepth = max(cubeDepth-1, 1)

		sock.sendto(msg1.encode(), teleplotAddr)
		sock.sendto(msg2.encode(), teleplotAddr)

		time.sleep(0.1)



sendMultipleTelemTest()
basicTest()
testThreeD()
