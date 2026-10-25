#!/usr/bin/env bash
# 23. Choosing where values go: DASH| lines describe the views of a dashboard ("Robot": a chart, then the values beside it). A label
# that is a path does it for one value ("temperature,Robot/State"). The page shows that dashboard.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send 'DASH|Robot:row' 'DASH|Robot/Motion:chart:speed,accel|w=2' 'DASH|Robot/State:values:battery,mode'
i=0
while true; do
    send $(awk "BEGIN { t = $i * 0.05; print \"speed:\" sin(t); print \"accel:\" cos(t) }") "battery:12.3" "mode:running|t" "temperature,Robot/State:21.5"
    i=$((i + 1))
    sleep 0.05
done
