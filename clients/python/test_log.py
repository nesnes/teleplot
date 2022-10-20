import socket
import math
import time
import random
import threading

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def sendTelemetry(name, value, now):
	
	flags = ""
	if (type(value) is str):
		flags += "t"

	msg = name+":"+str(now)+":"+str(value)+"|"+flags
	if (now == None):
		msg = name+":"+str(value)+"|"+flags

	sock.sendto(msg.encode(), teleplotAddr)



def basicTest():
	th = threading.Thread(target=basicTestSub)
	th.start()

def basicTestSub():
	i=0
	while True:
		
		now = time.time() * 1000


		sendTelemetry("cos", math.cos(i), now)
		sendLog("cos(i) : "+str(math.cos(i)), now)


		i+=0.1
		time.sleep(0.01)

def sendLog(mstr, now):
	timestamp = ""
	if (now != None):
		timestamp = str(now)

	msg = (">"+timestamp+":I am a log, linked to : "+mstr)
	sock.sendto(msg.encode(), teleplotAddr)



basicTest()


