#!/usr/bin/env bash
# 4. Logs: lines to read one after the other ("|log"), shown in a log view and as marks on the charts.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send "events:started|log"
presses=0
while true; do
    presses=$((presses + 1))
    send "presses:$presses"
    if [ $((presses % 20)) -eq 0 ]; then send "events:twenty more|log"; fi
    sleep 0.1
done
