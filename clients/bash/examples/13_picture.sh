#!/usr/bin/env bash
# 13. A picture: a PNG or JPEG file in base64 after "PNG|" (or "JPG|"). Here a picture taken by a camera of the computer would do
# (ffmpeg, raspistill); this one is the small PNG of the Arduino example. A big one goes in parts (PNG|name:time:1/3:...).
while true; do
    printf 'PNG|camera:%s\n' "$(base64 < "$(dirname "$0")/media/tile.png" | tr -d '\n')" > /dev/udp/127.0.0.1/47269
    sleep 1
done
