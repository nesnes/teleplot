#!/usr/bin/env bash
# 11. How shapes look: a sphere in a color that changes, a cube you see through (O: opacity), a mesh from an STL file (U: its url),
# a picture on a rectangle (T: a texture). Files are urls the page can read: here the ones the Teleplot page serves (media/).
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send '3D|ball:S:sphere:SC:0.5:P:0:0:0.25' \
     '3D|glass:S:cube:SC:1:1:1:P:0:0:0.5:C:lightblue:O:0.3' \
     '3D|pawn:S:stl:U:"media/pawn.stl":SC:0.02:P:1.5:0:0:C:gold' \
     '3D|sign:S:rect:SC:2:1.5:P:-1.5:0:0:T:url:"media/floor-plan.png"'
i=0
while true; do
    send "$(awk "BEGIN { printf \"3D|ball:C:#%02x50c8\", 127 + 127 * sin($i * 0.05) }")"
    i=$((i + 1))
    sleep 0.05
done
