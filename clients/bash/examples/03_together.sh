#!/usr/bin/env bash
# 3. Values that belong together: the same label (after a comma) puts them in the same chart.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send "ATTR|motor.left|unit=rpm" "ATTR|motor.right|unit=rpm"
i=0
while true; do
    send $(awk "BEGIN { t = $i * 0.05; print \"motor.left,motors:\" 100 + 20 * sin(t); print \"motor.right,motors:\" 100 + 20 * cos(t) }")
    i=$((i + 1))
    sleep 0.05
done
