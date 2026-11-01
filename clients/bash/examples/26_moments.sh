#!/usr/bin/env bash
# 26. Moments: periods of your application, a cycle, an operation, a phase. The page steps through them, replays them and exports them.
# "#42" numbers each occurrence, "/" nests, "=ok" ends a moment with its result.
pick=0
while true; do
    pick=$((pick + 1))
    printf 'cycle:run 1/pick#%d/approach|mom\n' "$pick" > /dev/udp/127.0.0.1/47269
    sleep 0.1
    printf 'cycle:run 1/pick#%d/grip|mom\n' "$pick" > /dev/udp/127.0.0.1/47269
    sleep 0.1
    result=ok
    if [ $((pick % 7)) -eq 0 ]; then result=failed; fi
    printf 'cycle:run 1/pick#%d=%s|mom\n' "$pick" "$result" > /dev/udp/127.0.0.1/47269
    sleep 0.05
done
