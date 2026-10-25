#!/usr/bin/env bash
# 5. A state: a text whose latest value matters ("|t"). The page shows it as a value, and over time on a timeline.
# Sending the same text again continues the state; an empty text means "nothing" (a hole on the timeline).
states=(idle moving charging "")
i=0
while true; do
    printf 'mode:%s|t\n' "${states[$((i / 30 % 4))]}" > /dev/udp/127.0.0.1/47269  # a new state every 3 s
    i=$((i + 1))
    sleep 0.1
done
