#!/usr/bin/env bash
# 15. A depth map: plain numbers after "RAW|" (8 bytes of header: width, height, format 0 = 16-bit; then the numbers, little-endian),
# in base64. ATTR|...|scale says what a number is worth (here 1 mm), K places it in 3D with the lens of its camera.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send 'ATTR|depth|scale=0.001|nodata=0|depth=1' '3D|depth:K:14:14:8:6:16:12'
i=0
while true; do
    # awk writes the bytes as \ooo escapes, printf turns them into bytes (a shell variable cannot hold a byte 0)
    bytes=$(awk "BEGIN { printf \"\\\\020\\\\000\\\\014\\\\000\\\\000\\\\000\\\\000\\\\000\"
        for (y = 0; y < 12; y++) for (x = 0; x < 16; x++) { v = int(1500 + 500 * sin(x * 0.4 + $i * 0.2) * cos(y * 0.4))
            printf \"\\\\%03o\\\\%03o\", v % 256, int(v / 256) } }")
    send "RAW|depth:$(printf "$bytes" | base64 | tr -d '\n')"
    i=$((i + 1))
    sleep 0.2
done
