# Stands for the Teleplot server while an example runs: receives what it sends to 127.0.0.1:47269 for a few seconds, then stops it.
# Usage: python3 capture_udp.py <seconds> <output prefix> <command...>. Writes <prefix>.teleplot (binary packets, framed as a binary
# file) and <prefix>.teleplot.txt (text datagrams), for the examples.test.js of the clients. A Teleplot server running on this
# computer holds the port: stop it first.
import os
import socket
import struct
import subprocess
import sys
import time

seconds, prefix, command = float(sys.argv[1]), sys.argv[2], sys.argv[3:]
server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    server.bind(("127.0.0.1", 47269))
except OSError:
    sys.exit("capture_udp: port 47269 is taken (a Teleplot server is running?): stop it to run the examples")
server.settimeout(0.05)
process = subprocess.Popen(command, stdout=subprocess.DEVNULL)
packets, end = [], time.monotonic() + seconds
while time.monotonic() < end and process.poll() is None:
    try:
        packets.append(server.recv(65536))
    except socket.timeout:
        pass
if process.poll() is None:
    process.terminate()
    try:
        process.wait(2)
    except subprocess.TimeoutExpired:
        process.kill()
while True:  # what was still on its way
    try:
        packets.append(server.recv(65536))
    except socket.timeout:
        break
with open(prefix + ".teleplot", "wb") as binary, open(prefix + ".teleplot.txt", "wb") as text:
    binary.write(bytes([0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00]))
    for p in packets:
        if p[:1] == b"\x10":
            binary.write(struct.pack("<I", len(p)) + p)
        else:
            text.write(p if p.endswith(b"\n") else p + b"\n")
