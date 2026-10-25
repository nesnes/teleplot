#!/usr/bin/env bash
# 10. A 3D scene: a body that turns (Q: a quaternion x:y:z:w), an arm placed in the frame of the body (F: it follows the body), and
# a point in space ("|xyz") with its trail. Frame of the scene: x forward, y to the left, z up.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send '3D|body:S:cube:SC:0.6:0.4:0.2:C:#3498db' '3D|arm:S:cylinder:SC:0.05:0.05:0.5:C:orange:F:"body":P:0.2:0:0.35'
i=0
while true; do
    send $(awk "BEGIN { t = $i * 0.025
        print \"3D|body:P:\" cos(t) \":\" sin(t) \":0.1:Q:0:0:\" sin(t / 2) \":\" cos(t / 2)
        print \"drone:\" 1.5 * cos(t * 2) \":\" 1.5 * sin(t * 2) \":\" 1 + 0.3 * sin(t * 3) \"|xyz\" }")
    i=$((i + 1))
    sleep 0.05
done
