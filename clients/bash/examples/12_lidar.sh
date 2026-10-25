#!/usr/bin/env bash
# 12. A point cloud (a lidar scan, "|pc"): all the points of a scan are one sample (x:y:z;x:y:z...), in the frame of the sensor; a
# fourth number per point is its intensity. The sensor is placed in the scene like a shape (P).
# A scan is a line of 3 KB: printf would write it in pieces of 1 KB, each a datagram of its own (a broken line). cat writes it at once.
send() { cat <<< "$(printf '%s\n' "$@")" > /dev/udp/127.0.0.1/47269; }
send '3D|lidar:P:0:0:0.2'
i=0
while true; do
    send "$(awk "BEGIN { t = $i * 0.2; line = \"lidar:\"
        for (k = 0; k < 72; k++) { a = k * 6.2831853 / 72; d = 2 + 0.5 * sin(a * 3 + t)
            line = line (k ? \";\" : \"\") d * cos(a) \":\" d * sin(a) \":0:\" 1 / d }
        print line \"|pc\" }")"
    i=$((i + 1))
    sleep 0.2
done
