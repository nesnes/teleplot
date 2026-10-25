#!/usr/bin/env bash
# 9. Drawings on a map: a path (a line through points, PT), a zone (a polygon), a spot (a circle), an arrow (V: where it points) and
# a text. They are flat shapes: the page shows them in 2D.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send '2D|path:S:line:PT:0:0:1:0.5:2:0.25:3:1:LW:0.03:C:gray' \
     '2D|zone:S:polygon:PT:1:-1:3:-1:2.5:-0.2:C:rgba(46, 204, 113, 0.3)' \
     '2D|spot:S:circle:SC:0.4:P:0:1:C:orange' \
     '2D|goal:S:text:P:3:1.2:TX:"goal":TS:0.2' \
     '2D|wind:S:arrow:C:teal'
i=0
while true; do
    send "$(awk "BEGIN { t = $i * 0.1; print \"2D|wind:P:0:1.5:V:\" 0.6 * cos(t) \":\" 0.6 * sin(t) }")"  # an arrow that turns
    i=$((i + 1))
    sleep 0.1
done
