#!/usr/bin/env bash
# 14. A camera: its pictures, its lens (K: fx:fy:cx:cy:width:height, DC: distortion) and where it is (P). The page draws the scene
# over its pictures as the lens sees it (a box in the scene), and drawings made in the pixels of the picture (FPX: a detection).
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send '3D|camera:K:14:14:8:8:16:16:DC:-0.1:0.01:0:0:0:P:-2:0:0.5' \
     '3D|box:S:cube:SC:0.5:P:0:0:0.25:C:orange' \
     '2D|detection:S:rect:C:red:FPX:"camera"'
picture=$(base64 < "$(dirname "$0")/media/tile.png" | tr -d '\n')
i=0
while true; do
    send "PNG|camera:$picture" "$(awk "BEGIN { print \"2D|detection:P:\" 8 + 3 * sin($i * 0.2) \":8:SC:4:3\" }")"
    i=$((i + 1))
    sleep 0.2
done
