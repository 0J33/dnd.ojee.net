#!/bin/bash
# Stops everything demo/run.sh started (watchdog, tunnel, server, mongod).
STATE="${DND_DEMO_STATE:-$HOME/.cache/dnd-world}"
PORT="${DND_DEMO_PORT:-5095}"
[ -f "$STATE/run.pid" ] && kill "$(cat "$STATE/run.pid")" 2>/dev/null
[ -f "$STATE/tunnel.pid" ] && kill "$(cat "$STATE/tunnel.pid")" 2>/dev/null
[ -f "$STATE/table.pid" ] && kill "$(cat "$STATE/table.pid")" 2>/dev/null
holder=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$holder" ] && kill "$holder"
mongod --dbpath "$STATE/mongodata" --shutdown >/dev/null 2>&1
rm -f "$STATE/url.txt"
echo "demo stopped"
