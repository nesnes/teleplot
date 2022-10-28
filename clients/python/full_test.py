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

def sendTelemetry(name, value, unit, now):
	
	flags = ""
	if (type(value) is str):
		flags += "t"

	msg = name+":"+str(now)+":"+str(value)+format_unit(unit)+"|"+flags
	if (now == None):
		msg = name+":"+str(value)+format_unit(unit)+"|"+flags

	sock.sendto(msg.encode(), teleplotAddr)

def sendTelemetryXY(name, x, y, x1, y1, unit):

	now = time.time() * 1000
	msg = name+":"+str(x)+":"+str(y)+":"+str(now)+";" +str(x1)+":"+str(y1)+":"+str(now)+format_unit(unit)+"|xy"
	
	sock.sendto(msg.encode(), teleplotAddr)


def sendMultipleTelemTest():
	msg = "myValue:1627551892444:1;1627551892555:2;1627551892666:3\n\
	mySecondValue:1627551892444:1;1627551892555:2;1627551892666:3§rad\n\
	myThirdValue:3.2323e+4|\n\
	state:state_a|t\n\
	state2:1627551892444:state_a;1627551892555:state_b|t\n\
	trajectory:1:1;2:2;3:3;4:4|xy\n\
	trajectoryTimestamped:1:1:1627551892437;2:2:1627551892448;3:3:1627551892459|xy"


	sock.sendto(msg.encode(), teleplotAddr)

def basicTest():
	th0 = threading.Thread(target=basicTestSubBefore)
	th = threading.Thread(target=basicTestSub)

	th0.start()

	time.sleep(1)
	th.start()

def basicTestSubBefore():
	i=0
	while True:
		now = time.time() * 1000

		sendTelemetry("cos_before", math.cos(i), "", now)
		i+=0.1
		time.sleep(0.01)

def basicTestSub():
	i=0
	currentRobotState = "standing"
	while True:
		
		now = time.time() * 1000


		sendTelemetry("sin_unit", math.sin(i), "my_weird@ unit $", now)
		sendTelemetry("cos_no_time", math.cos(i), "", None)
		sendTelemetry("cos_time", math.cos(i), "", now)
		sendTelemetry("cos_no_time_unit", math.cos(i), "kilos", None)
		sendTelemetry("cos", math.cos(i), "", now)
		# sendLog("cos(i) : "+str(math.cos(i)), None)
		sendLog("cos(i) : "+str(math.cos(i)), now)

		sendTelemetryXY("XY_", math.sin(i),math.cos(i), math.sin(i+0.1), math.cos(i+0.1), "km²")

		if (random.randint(0, 1000) >= 950 ):
			if (currentRobotState == "standing") :
				currentRobotState = "sitted"
			else :
				currentRobotState = "standing"

		sendTelemetry("robot_state", currentRobotState ,"", now)
		sendTelemetry("robot_state_no_time", currentRobotState ,"", None)
		sendTelemetry("robot_state_no_time_unit", currentRobotState ,"km/h", None)
		sendTelemetry("robot_state_unit", currentRobotState ,"m²", now)
		

		i+=0.1
		time.sleep(0.01)

def sendLog(mstr, now):
	timestamp = ""
	if (now != None):
		timestamp = str(now)

	msg = (">"+timestamp+":I am a log, linked to : "+mstr+", useless text : blablablablablablablablablablablablablablablablablablabla")
	sock.sendto(msg.encode(), teleplotAddr)

def testThreeD():
	th1 = threading.Thread(target=testThreeD_sub)
	th2 = threading.Thread(target=testThreeDHighRate_sub)
	th1.start()
	th2.start()

def testThreeD_sub():
	sphereRadius = 3
	cube1Depth = 7
	cube2Rot = 0

	while True:

		msg1 = '3D|mycube1:S:cube:O:0.2:C:blue:W:5:H:4:D:'+str(cube1Depth)
		msg2 = '3D|mysphere,widget0:RA:'+str(sphereRadius)+':S:sphere:O:0.4'
		msg3 = '3D|mycube2,widget0:S:cube:R:'+ str(cube2Rot) +':::C:green:O:0.5'
	
		randomNb = random.randint(0, 100)

		if ( randomNb >= 1 and randomNb <= 10):
			sphereRadius += 1
		elif (randomNb >= 11 and randomNb <= 21):
			sphereRadius  = max(sphereRadius-1, 1)
		elif (randomNb >= 22 and randomNb <= 32):
			cube1Depth  += 1
		elif (randomNb >= 33 and randomNb <= 43):
			cube1Depth = max(cube1Depth-1, 1)
		elif (randomNb >= 44 and randomNb <= 54):
			cube2Rot -= 0.1
		elif (randomNb >= 65 and randomNb <= 85):
			cube2Rot += 0.1

		sock.sendto(msg1.encode(), teleplotAddr)
		sock.sendto(msg2.encode(), teleplotAddr)
		sock.sendto(msg3.encode(), teleplotAddr)

		time.sleep(0.1)

def testThreeDHighRate_sub():

	i = 0
	while True:
		msg4 = '3D|mysphere3:RA:1:S:sphere:O:0.4:P:'+str(math.sin(i)*2)+':'+str(math.cos(i)*2)+':1'
		sock.sendto(msg4.encode(), teleplotAddr)

		i+=0.1
		time.sleep(0.1) #1kHz


sendMultipleTelemTest()
basicTest()
testThreeD()


