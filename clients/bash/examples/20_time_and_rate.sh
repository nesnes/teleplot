#!/usr/bin/env bash
# 20. Times. A sample without a time is dated when it arrives; a time (ms since 1970, a first field that is a number) gives the time
# it was measured instead. Several samples in one line (";") arrive together: each with its time.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
i=0
while true; do
    measured=$(($(date +%s) * 1000))   # (date gives seconds; GNU date +%s%3N gives milliseconds)
    sleep 0.5
    send "reading:$measured:$((RANDOM % 100))" \
         "$(awk "BEGIN { line = \"fast:\"; for (k = 0; k < 10; k++) line = line (k ? \";\" : \"\") $measured + k * 50 \":\" sin($i + k * 0.1); print line }")"
    i=$((i + 1))
done
