#!/usr/bin/env bash
# 2. Describe a value once: its unit, the range it is expected in, a description (ATTR| line) and a limit (TH| line). With both
# ends of its range, the page shows it as a gauge; past the limit it says "low". "|np": a value kept out of the Live dashboard.
# (The text protocol cannot say a data timeout: the C++ and Python clients send it in binary.)
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send "ATTR|battery|unit=V|min=10.5|max=12.6|desc=Main battery" "TH|battery:low<11,orange"
i=0
while true; do
    send "battery:$(awk "BEGIN { print 12.6 - ($i % 600) * 0.003 }")" "debug:$i|np"
    i=$((i + 1))
    sleep 0.1
done
