#!/usr/bin/env bash
# 1. A first value: one line per sample, "name:value", sent over UDP to the Teleplot server (port 47269). A chart appears by itself.
# Bash writes to /dev/udp/HOST/PORT by itself (not sh, not zsh: there, echo "wave:1" | nc -u -w0 127.0.0.1 47269).
# The numbers are computed by awk: Bash only counts in integers.
i=0
while true; do
    printf 'wave:%s\n' "$(awk "BEGIN { print sin($i * 0.05) }")" > /dev/udp/127.0.0.1/47269
    i=$((i + 1))
    sleep 0.05
done
