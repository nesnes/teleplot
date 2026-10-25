#!/usr/bin/env bash
# 7. A position on a map: two numbers (x:y) with "|xy" make a point, drawn with its trail. Text keeps all the digits it is given.
i=0
while true; do
    awk "BEGIN { t = $i * 0.02; printf \"gps:%.7f:%.7f|xy\n\", 2.294481 + 0.0005 * cos(t), 48.858370 + 0.0003 * sin(t) }" > /dev/udp/127.0.0.1/47269
    i=$((i + 1))
    sleep 0.1
done
