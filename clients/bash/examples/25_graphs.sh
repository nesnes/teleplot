#!/usr/bin/env bash
# 25. Graphs: a state machine (its states "|enum", its transitions "|edges", where it is "|stack") and a behavior tree (its nodes,
# then each tick with the result of each node). The page draws them in a graph view, and their stacks on a timeline. See doc/graph.md.
send() { printf '%s\n' "$@" > /dev/udp/127.0.0.1/47269; }
send "mode:idle,mission/goto,mission/grasp,error|enum" \
     "mode:idle>mission=start,mission/goto>mission/grasp=arrived,mission/grasp>idle=done,mission>error=fault,error>idle=reset|edges" \
     "bt:root#fallback,root/patrol#sequence,root/patrol/battery_ok#condition,root/patrol/goto#action,root/dock#action|enum"
states=(idle mission/goto mission/grasp)
i=0
while true; do
    if ((i % 15 == 0)); then send "mode:${states[$((i / 15 % 3))]}|stack"; fi  # a new state every 1.5 s
    if ((RANDOM % 6 == 0)); then send "bt:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack"  # the check fails: dock
    else send "bt:root/patrol/battery_ok=success,root/patrol/goto|stack"; fi
    i=$((i + 1))
    sleep 0.1
done
