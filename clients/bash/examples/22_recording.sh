#!/usr/bin/env bash
# 22. Recording: the same lines go to the server and to a file (tee), which the page opens (Export and import panel, or dropped on
# the page). Give the lines a time, or the file has none to show.
while true; do
    line="temperature:$(($(date +%s) * 1000)):$(awk "BEGIN { srand(); print 20 + rand() }")"
    printf '%s\n' "$line" | tee -a run.teleplot.txt > /dev/udp/127.0.0.1/47269
    sleep 0.5
done
