import socket
import math
import time
import random
import threading

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

sphere1rad = 5
sphere1x = 0
sphere1y = 0
sphere1z = 0

sphere1xOffset = -8
sphere1yOffset = 8
sphere1zOffset = 0



sphere2rad = 5
sphere2x = 0
sphere2y = 0
sphere2z = 0

sphere2xOffset = 8
sphere2yOffset = 8
sphere2zOffset = 0



sphere3rad = 10
sphere3x = 0
sphere3y = 0
sphere3z = 0

sphere3xOffset = 0
sphere3yOffset = 0
sphere3zOffset = 0


i = 0

while True:

    totalXOffset = math.sin(i)*30 + math.cos(6*i)*10
    totalYOffset = math.cos(i)*30 + math.sin(6*i)*10

    sphere1x = sphere1xOffset + totalXOffset
    sphere1y = sphere1yOffset + totalYOffset
    sphere1z = sphere1zOffset

    sphere2x = sphere2xOffset + totalXOffset
    sphere2y = sphere2yOffset + totalYOffset
    sphere2z = sphere2zOffset

    sphere3x = sphere3xOffset + totalXOffset
    sphere3y = sphere3yOffset + totalYOffset
    sphere3z = sphere3zOffset




    msg1 = '3D|sphere1,widget0:S:sphere:RA:'+ str(sphere1rad)+':P:'+ str(sphere1x) +':'+ str(sphere1y) +':'+ str(sphere1z) + ':C:black:O:1'
    msg2 = '3D|sphere2,widget0:S:sphere:RA:'+ str(sphere2rad)+':P:'+ str(sphere2x) +':'+ str(sphere2y) +':'+ str(sphere2z) + ':C:black:O:1'
    msg3 = '3D|sphere3,widget0:S:sphere:RA:'+ str(sphere3rad)+':P:'+ str(sphere3x) +':'+ str(sphere3y) +':'+ str(sphere3z) + ':C:black:O:1'

    sock.sendto(msg1.encode(), teleplotAddr)
    sock.sendto(msg2.encode(), teleplotAddr)
    sock.sendto(msg3.encode(), teleplotAddr)


    time.sleep(0.08)
    i+=0.1
