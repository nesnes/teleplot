from serial import Serial
import socket

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

with Serial('/dev/ttyACM0', 921600) as ser:
    while True:
        line = ser.readline().decode("utf-8")
        # print(line)

        sock.sendto(line.encode(), teleplotAddr)