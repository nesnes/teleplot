#!/usr/bin/env bash
# 6. What runs: a path of levels ("|stack"), drawn on a timeline: "loop", "loop/read", "loop/compute", then empty (nothing runs).
# Here a shell script that runs its steps one after the other.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
while true; do
    send "task:loop/read|stack"
    sleep 0.05
    send "task:loop/compute|stack"
    sleep 0.$((RANDOM % 9 + 1))
    send "task:|stack"
    sleep 0.1
done
