#!/usr/bin/env bash
# 8. A shape that moves: described once (S: its kind, SC: its size, C: its color), then only its position (P) and heading (R, the
# rotation around z in radians) are sent. 2D| lines are flat: the page shows it on a map.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send "2D|robot:S:rect:SC:0.4:0.3:C:#2ecc71"
i=0
while true; do
    send "$(awk "BEGIN { t = $i * 0.015; print \"2D|robot:P:\" 2 * cos(t) \":\" 2 * sin(t) \":R:\" t + 1.5708 }")"
    i=$((i + 1))
    sleep 0.05
done
